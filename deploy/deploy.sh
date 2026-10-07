#!/bin/sh
# builds the current revision, backs up the database, migrates, and replaces
# the running containers, restoring the previous images if anything fails
set -eu

repo_dir=$(CDPATH='' cd -- "$(dirname "$0")/.." && pwd)
env_file=${ENV_FILE:-$repo_dir/.env.production}
deploy_ref=${DEPLOY_REF:-$(git -C "$repo_dir" rev-parse --verify HEAD)}
compose="docker compose --env-file $env_file -f $repo_dir/compose.production.yaml"
domain=$(sed -n 's/^ITER_DOMAIN=//p' "$env_file" | head -1)

ENV_FILE=$env_file "$repo_dir/deploy/preflight.sh"

image_of() {
  docker inspect --format '{{.Config.Image}}' "$1" 2>/dev/null || true
}
previous_backend=$(image_of iter-api)
previous_frontend=$(image_of iter-web)

# another project logs docker in to ghcr.io with an expiring token, and a stale
# login breaks even anonymous pulls, so builds read no shared registry credentials
build_config=$(mktemp -d)
trap 'rm -rf "$build_config"' EXIT
DOCKER_CONFIG=$build_config docker build --pull --target runtime \
  --tag "iter-backend:$deploy_ref" "$repo_dir/backend"
DOCKER_CONFIG=$build_config docker build --pull --target runtime \
  --tag "iter-frontend:$deploy_ref" "$repo_dir/frontend"
rm -rf "$build_config"
trap - EXIT

if docker ps --format '{{.Names}}' | grep -qx iter-backup; then
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  docker exec iter-backup sh -c \
    "pg_dump -h iter-postgres -U iter -d iter -Fc -f /backups/pre-deploy-$stamp.dump"
  echo "pre-deploy backup: /var/backups/iter/pre-deploy-$stamp.dump"
  docker exec iter-backup sh -c \
    'ls -1t /backups/pre-deploy-*.dump | tail -n +6 | xargs -r rm --'
fi

rollback() {
  status=$?
  if [ "$status" -ne 0 ] && [ -n "$previous_backend" ] && [ -n "$previous_frontend" ]; then
    echo "deployment failed; restoring the previous images" >&2
    BACKEND_IMAGE=$previous_backend FRONTEND_IMAGE=$previous_frontend \
      $compose up -d --no-deps iter-api iter-web
  fi
  exit "$status"
}
trap rollback EXIT INT TERM

BACKEND_IMAGE="iter-backend:$deploy_ref" FRONTEND_IMAGE="iter-frontend:$deploy_ref" \
  $compose up -d --wait --remove-orphans

# an ambiguous name on the shared network makes caddy round-robin between projects
answers=$(docker exec wished-caddy nslookup iter-web 2>/dev/null | grep -A1 '^Name:' | grep -c '^Address' || true)
[ "$answers" = "1" ] || { echo "iter-web resolves to $answers containers on the proxy network" >&2; exit 1; }

attempt=0
until curl --fail --silent --show-error --max-time 8 "https://$domain/" >/dev/null; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 30 ] || exit 1
  sleep 2
done

trap - EXIT INT TERM
echo "deployment completed: $deploy_ref"
