#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
project="${ITER_COMPOSE_PROJECT:-iter-directory-local}"
docker compose --project-name "$project" --env-file "$repo_root/.env.local" -f "$repo_root/compose.local.yaml" \
  exec -T backend python - < "$repo_root/scripts/local-seed.py"
