#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="$repo_root/.env.local"
umask 077
if [[ ! -e "$env_file" ]]; then
  cat > "$env_file" <<ENV
ITER_DB_PASSWORD=$(openssl rand -hex 32)
ITER_ADMIN_TOKEN=$(openssl rand -hex 32)
ENV
fi
# a local-only stand-in for the bot token, so local launches can be signed without telegram
if ! grep -q '^ITER_TELEGRAM_BOT_TOKEN=' "$env_file"; then
  printf 'ITER_TELEGRAM_BOT_TOKEN=0:%s\n' "$(openssl rand -hex 24)" >> "$env_file"
fi
