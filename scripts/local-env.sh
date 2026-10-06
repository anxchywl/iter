#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="$repo_root/.env.local"
umask 077
if [[ ! -e "$env_file" ]]; then
  db_password="$(openssl rand -hex 32)"
  admin_token="$(openssl rand -hex 32)"
  provider_token="$(openssl rand -hex 32)"
  cat > "$env_file" <<EOF
ITER_DB_PASSWORD=$db_password
ITER_ADMIN_TOKEN=$admin_token
ITER_PROVIDER_TOKEN=$provider_token
EOF
elif ! rg -q '^ITER_PROVIDER_TOKEN=' "$env_file"; then
  provider_token="$(openssl rand -hex 32)"
  printf '\nITER_PROVIDER_TOKEN=%s\n' "$provider_token" >> "$env_file"
fi
