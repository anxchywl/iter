#!/bin/sh
# refuses a deployment that would ship demo data, open feedback, or a service
# nobody can sign in to; runs before anything is built
set -eu

repo_dir=$(CDPATH='' cd -- "$(dirname "$0")/.." && pwd)
env_file=${ENV_FILE:-$repo_dir/.env.production}

fail() {
  echo "preflight: $1" >&2
  exit 1
}

[ -f "$env_file" ] || fail "$env_file is missing"
[ "$(stat -c %a "$env_file")" = "600" ] || fail "$env_file must have mode 600"

value_of() {
  sed -n "s/^$1=//p" "$env_file" | head -1
}

for name in ITER_DOMAIN ITER_DB_PASSWORD ITER_ADMIN_TOKEN TELEGRAM_BOT_TOKEN \
  OPERATOR_TELEGRAM_IDS TELEGRAM_BOT_USERNAME; do
  [ -n "$(value_of "$name")" ] || fail "$name is required"
done
[ "$(value_of ITER_DB_PASSWORD | wc -c)" -gt 32 ] || fail "ITER_DB_PASSWORD must be at least 32 characters"
[ "$(value_of ITER_ADMIN_TOKEN | wc -c)" -gt 32 ] || fail "ITER_ADMIN_TOKEN must be at least 32 characters"
value_of TELEGRAM_BOT_TOKEN | grep -Eq '^[0-9]{1,20}:[A-Za-z0-9_-]{30,64}$' ||
  fail "TELEGRAM_BOT_TOKEN does not look like a BotFather token"
value_of OPERATOR_TELEGRAM_IDS | grep -Eq '^[1-9][0-9]{0,15}(,[1-9][0-9]{0,15})*$' ||
  fail "OPERATOR_TELEGRAM_IDS must be comma-separated numeric Telegram user IDs"

# public reviews and reports stay off until their data-location and rate-limit plan is approved
[ "$(value_of FEEDBACK_ENABLED)" != "true" ] || fail "FEEDBACK_ENABLED must not be true yet"
[ -z "$(value_of DIRECTORY_DEMO_MODE)" ] || fail "DIRECTORY_DEMO_MODE must not be set in production"

docker network inspect wished_wished-app >/dev/null 2>&1 ||
  fail "the shared proxy network wished_wished-app does not exist"
[ "$(stat -c %u /var/backups/iter 2>/dev/null)" = "999" ] ||
  fail "/var/backups/iter must exist and belong to uid 999"

caddyfile=${CADDYFILE:-/home/deploy/wished/infra/caddy/Caddyfile.production}
grep -q "^$(value_of ITER_DOMAIN) {" "$caddyfile" 2>/dev/null ||
  fail "$caddyfile has no site block for $(value_of ITER_DOMAIN); see deploy/Caddyfile.iter"

git -C "$repo_dir" diff --quiet HEAD ||
  fail "the working tree is dirty; deploy a committed revision"

echo "preflight: ok"
