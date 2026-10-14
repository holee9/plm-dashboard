#!/usr/bin/env bash
# Start PLM Dashboard proxy (reads token from ~/.hermes/.env)
set -euo pipefail

ENV_FILE="${HOME}/.hermes/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found" >&2
  exit 1
fi

# shellcheck source=/dev/null
source "$ENV_FILE"

if [[ -z "${OP_API_KEY:-}" ]]; then
  echo "ERROR: OP_API_KEY not set in $ENV_FILE" >&2
  exit 1
fi

export OP_AUTH_B64
OP_AUTH_B64=$(printf "apikey:%s" "$OP_API_KEY" | base64 -w 0)

cd "$(dirname "$0")"

# 주요 과제 선택 (#110): the settings directory must exist before the container starts (the mount point sits inside
# a read-only tree) and must be writable by the nginx user (uid 101). Without it Docker would create a root-owned dir.
CONF_DIR="../design_handoff_plm_dashboard/data/config"
mkdir -p "$CONF_DIR"
if command -v setfacl >/dev/null 2>&1; then
  setfacl -m u:101:rwx "$CONF_DIR" || echo "WARN: could not set the ACL on $CONF_DIR; saving the main-project setting will fail" >&2
else
  echo "WARN: setfacl not found; give uid 101 write access to $CONF_DIR or saving the main-project setting will fail" >&2
fi

docker compose up -d "$@"
echo "PLM Dashboard: http://localhost:8088/"
echo "PLM Dashboard: http://plm-dash.work/"
echo "API proxy:     http://localhost:8088/op/users/me"
