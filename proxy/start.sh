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
docker compose up -d "$@"
echo "PLM Dashboard: http://localhost:8088/"
echo "PLM Dashboard: http://plm-dash.work/"
echo "API proxy:     http://localhost:8088/op/users/me"
