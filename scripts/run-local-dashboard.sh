#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_PATH="${REPO_ROOT}/scripts/local-dashboard-server.py"
HOST="127.0.0.1"
PORT="${PLM_DASHBOARD_PORT:-8080}"
UPSTREAM="${PLM_DASHBOARD_UPSTREAM:-}"
URL="http://${HOST}:${PORT}/"
PYTHON_PATH="${PYTHON_PATH:-}"

if [[ -z "$UPSTREAM" ]]; then
  ADDRESSES="$({ ifconfig 2>/dev/null || true; ip address 2>/dev/null || true; } | tr '\n' ' ')"
  if [[ "$ADDRESSES" == *"192.168.100."* ]]; then
    UPSTREAM="http://192.168.100.50"
  elif [[ "$ADDRESSES" == *"10.20.6."* ]]; then
    UPSTREAM="http://10.20.6.187"
  else
    UPSTREAM="http://100.110.194.101"
  fi
fi

open_dashboard() {
  if [[ "${PLM_DASHBOARD_NO_OPEN:-0}" == "1" ]]; then
    return
  fi

  case "$(uname -s)" in
    Darwin) open "$URL" ;;
    Linux)
      if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$URL" >/dev/null 2>&1 &
      elif command -v powershell.exe >/dev/null 2>&1; then
        powershell.exe -NoProfile -Command "Start-Process '$URL'" >/dev/null 2>&1
      fi
      ;;
  esac
}

dashboard_is_running() {
  local health
  health="$(curl -fs "${URL}__plm_health" 2>/dev/null)" || return 1
  [[ "$health" == *'"service": "plm-dashboard-local"'* ]] &&
    [[ "$health" == *"\"upstream\": \"${UPSTREAM}\""* ]]
}

if command -v curl >/dev/null 2>&1; then
  if dashboard_is_running; then
    echo "PLM Dashboard is already running: ${URL}"
    open_dashboard
    exit 0
  fi
  if curl -fs -o /dev/null "$URL" 2>/dev/null; then
    echo "ERROR: port ${PORT} is used by another service or upstream configuration." >&2
    exit 1
  fi
fi

if [[ -z "$PYTHON_PATH" ]]; then
  PYTHON_PATH="$(command -v python3 || command -v python || true)"
fi
if [[ -z "$PYTHON_PATH" ]]; then
  echo "ERROR: Python 3 is required." >&2
  exit 1
fi
if ! "$PYTHON_PATH" -c 'import sys; raise SystemExit(sys.version_info < (3, 8))'; then
  echo "ERROR: Python 3.8 or newer is required." >&2
  exit 1
fi

"$PYTHON_PATH" "$SERVER_PATH" --host "$HOST" --port "$PORT" --upstream "$UPSTREAM" &
SERVER_PID=$!
cleanup() {
  kill "$SERVER_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

if command -v curl >/dev/null 2>&1; then
  READY=0
  for _ in {1..20}; do
    if dashboard_is_running; then
      READY=1
      break
    fi
    if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
      break
    fi
    sleep 0.25
  done
  if [[ "$READY" != "1" ]]; then
    echo "ERROR: PLM Dashboard did not start on ${URL}" >&2
    exit 1
  fi
else
  sleep 1
fi

echo "PLM Dashboard: ${URL}"
echo "API upstream: ${UPSTREAM}"
echo "Press Ctrl+C to stop."
open_dashboard
wait "$SERVER_PID"
