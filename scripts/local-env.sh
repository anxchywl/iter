#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="$repo_root/.env.local"
if [[ -e "$env_file" ]]; then
  exit 0
fi

umask 077
db_password="$(openssl rand -hex 32)"
admin_token="$(openssl rand -hex 32)"
cat > "$env_file" <<EOF
ITER_DB_PASSWORD=$db_password
ITER_ADMIN_TOKEN=$admin_token
EOF
