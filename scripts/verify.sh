#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export COMPOSE_PROGRESS=quiet
verify_scope="${1:-all}"
case "$verify_scope" in
  all | security | backend | frontend | browser) ;;
  *)
    echo "usage: $0 [all|security|backend|frontend|browser]" >&2
    exit 2
    ;;
esac

includes() {
  [[ "$verify_scope" == "all" || "$verify_scope" == "$1" ]]
}

phase() {
  if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
    [[ -z "${current_phase:-}" ]] || echo "::endgroup::"
    echo "::group::$1"
  else
    printf '\n== %s\n' "$1"
  fi
  current_phase="$1"
}

if includes security; then
  phase "Secret scan"
  scan_image="ghcr.io/gitleaks/gitleaks:v8.30.0@sha256:691af3c7c5a48b16f187ce3446d5f194838f91238f27270ed36eef6359a574d9"
  docker run --rm --network none -v "$repo_root:/scan:ro" "$scan_image" dir --no-banner --redact --config /scan/.gitleaks.toml /scan
  git_mounts=(-v "$repo_root:/scan:ro")
  if [[ -f "$repo_root/.git" ]]; then
    git_common_dir="$(git -C "$repo_root" rev-parse --path-format=absolute --git-common-dir)"
    git_mounts+=(-v "$git_common_dir:$git_common_dir:ro")
  fi
  history_scan="$(docker run --rm --network none "${git_mounts[@]}" "$scan_image" git --no-banner --redact --config /scan/.gitleaks.toml /scan 2>&1)"
  printf '%s\n' "$history_scan"
  if [[ ! "$history_scan" =~ [1-9][0-9]*[[:space:]]commits[[:space:]]scanned ]]; then
    echo "Git history was not scanned" >&2
    exit 1
  fi

  phase "ShellCheck"
  shellcheck_image="koalaman/shellcheck:v0.11.0@sha256:61862eba1fcf09a484ebcc6feea46f1782532571a34ed51fedf90dd25f925a8d"
  (cd "$repo_root" && docker run --rm --network none -v "$repo_root:/mnt:ro" -w /mnt "$shellcheck_image" scripts/*.sh deploy/*.sh)
fi

if [[ "$verify_scope" != "frontend" ]]; then
  "$repo_root/scripts/local-env.sh"
  export ITER_WEB_PORT=3019
  compose=(docker compose --project-name "iter-directory-check-$verify_scope" --env-file "$repo_root/.env.local" -f "$repo_root/compose.local.yaml")
  cleanup() {
    "${compose[@]}" --profile test down --volumes --remove-orphans >/dev/null
  }
  trap cleanup EXIT
fi

if includes security; then
  phase "Compose configuration"
  "${compose[@]}" --profile test config --quiet
  ITER_DOMAIN=iter.example.com ITER_DB_PASSWORD=check ITER_ADMIN_TOKEN=check TELEGRAM_BOT_TOKEN=check \
    OPERATOR_TELEGRAM_IDS=1 TELEGRAM_BOT_USERNAME=check BACKEND_IMAGE=check FRONTEND_IMAGE=check \
    docker compose -f "$repo_root/compose.production.yaml" config --quiet
fi

if includes backend; then
  phase "Backend images and database"
  "${compose[@]}" --profile test build migrate backend backend-test
  "${compose[@]}" --profile test up -d --wait db-test
  "${compose[@]}" --profile test exec -T db-test createdb -U iter_test iter_migrations

  phase "Migrations"
  "${compose[@]}" --profile test run --rm --no-deps backend-test sh -c "DATABASE_URL=\"\${MIGRATION_DATABASE_URL}\" uv run --no-sync alembic upgrade head"
  "${compose[@]}" --profile test run --rm --no-deps backend-test sh -c "DATABASE_URL=\"\${MIGRATION_DATABASE_URL}\" uv run --no-sync alembic check"
  phase "Backend lint and tests"
  "${compose[@]}" --profile test run --rm --no-deps backend-test uv run --no-sync ruff check --no-cache app tests alembic/env.py alembic/versions
  "${compose[@]}" --profile test run --rm --no-deps backend-test uv run --no-sync ruff format --check app tests alembic/env.py alembic/versions
  "${compose[@]}" --profile test run --rm --no-deps backend-test uv run --no-sync pytest -q -p no:cacheprovider
  phase "Backup and restore rehearsal"
  "${compose[@]}" --profile test exec -T db-test pg_dump -U iter_test -Fc -f /tmp/iter_test.dump iter_test
  "${compose[@]}" --profile test exec -T db-test createdb -U iter_test iter_restore
  "${compose[@]}" --profile test exec -T db-test pg_restore -U iter_test -d iter_restore --exit-on-error /tmp/iter_test.dump
  row_counts='SELECT (SELECT count(*) FROM employers), (SELECT count(*) FROM listings), (SELECT count(*) FROM reviews), (SELECT count(*) FROM reports), (SELECT count(*) FROM audit_events)'
  original_counts="$("${compose[@]}" --profile test exec -T db-test psql -U iter_test -d iter_test -Atc "$row_counts")"
  restored_counts="$("${compose[@]}" --profile test exec -T db-test psql -U iter_test -d iter_restore -Atc "$row_counts")"
  if [[ "$original_counts" != "$restored_counts" ]]; then
    echo "Disposable database restore did not reproduce row counts" >&2
    exit 1
  fi
  phase "Python dependency audit"
  "${compose[@]}" --profile test run --rm --no-deps backend-test uv audit --preview-features audit-command
fi

if includes browser; then
  phase "Local stack health and seeding"
  "${compose[@]}" build migrate backend frontend
  "${compose[@]}" up -d --wait frontend
  curl --fail --silent --show-error "http://127.0.0.1:$ITER_WEB_PORT/" >/dev/null
  ITER_COMPOSE_PROJECT="iter-directory-check-$verify_scope" "$repo_root/scripts/local-seed.sh"
  ITER_COMPOSE_PROJECT="iter-directory-check-$verify_scope" "$repo_root/scripts/local-seed.sh" | grep -q "nothing to add"
fi

if includes frontend || includes browser; then
  phase "Frontend install"
  cd "$repo_root/frontend"
  npm ci
fi

if includes frontend; then
  phase "Frontend format, types, and unit tests"
  npm run format:check
  npm run typecheck
  npm test
  phase "Frontend production build"
  npm run build
  phase "npm dependency audit"
  npm audit --audit-level=high --fund=false
fi

if includes browser; then
  phase "Browser setup and tests"
  export PLAYWRIGHT_PORT="${PLAYWRIGHT_PORT:-3020}"
  if [[ "${CI:-}" == "true" ]]; then
    npx playwright install --with-deps chromium
  else
    npx playwright install chromium
  fi
  npm run test:e2e
fi
