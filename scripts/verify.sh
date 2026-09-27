#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export COMPOSE_PROGRESS=quiet
scan_image="ghcr.io/gitleaks/gitleaks:v8.30.0@sha256:691af3c7c5a48b16f187ce3446d5f194838f91238f27270ed36eef6359a574d9"
docker run --rm --network none -v "$repo_root:/scan:ro" "$scan_image" dir --no-banner --redact --config /scan/.gitleaks.toml /scan
docker run --rm --network none -v "$repo_root:/scan:ro" "$scan_image" git --no-banner --redact --config /scan/.gitleaks.toml /scan

"$repo_root/scripts/local-env.sh"
export ITER_WEB_PORT=3019
compose=(docker compose --project-name iter-directory-check --env-file "$repo_root/.env.local" -f "$repo_root/compose.local.yaml")
cleanup() {
  "${compose[@]}" --profile test down --volumes --remove-orphans >/dev/null
}
trap cleanup EXIT

"${compose[@]}" --profile test config --quiet
"${compose[@]}" --profile test build backend backend-test frontend
"${compose[@]}" --profile test up -d --wait db-test
"${compose[@]}" --profile test exec -T db-test createdb -U iter_test iter_migrations

"${compose[@]}" --profile test run --rm --no-deps backend-test sh -c "DATABASE_URL=\"\${MIGRATION_DATABASE_URL}\" uv run --no-sync alembic upgrade head"
"${compose[@]}" --profile test run --rm --no-deps backend-test sh -c "DATABASE_URL=\"\${MIGRATION_DATABASE_URL}\" uv run --no-sync alembic check"
"${compose[@]}" --profile test run --rm --no-deps backend-test uv run --no-sync ruff check --no-cache app tests alembic/env.py alembic/versions
"${compose[@]}" --profile test run --rm --no-deps backend-test uv run --no-sync ruff format --check app tests alembic/env.py alembic/versions
"${compose[@]}" --profile test run --rm --no-deps backend-test uv run --no-sync pytest -q -p no:cacheprovider
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
"${compose[@]}" --profile test run --rm --no-deps backend-test uv audit --preview-features audit-command

"${compose[@]}" up -d --wait frontend
curl --fail --silent --show-error "http://127.0.0.1:$ITER_WEB_PORT/" >/dev/null

cd "$repo_root/frontend"
npm ci
if [[ "${CI:-}" == "true" ]]; then
  npx playwright install --with-deps chromium
else
  npx playwright install chromium
fi
npm run format:check
npm run typecheck
npm test
npm run build
npm run test:e2e
npm audit --audit-level=high --fund=false
