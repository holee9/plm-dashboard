#!/usr/bin/env bash
set -euo pipefail

LABEL="com.holee9.plm-dashboard.local"
DOMAIN="gui/$(id -u)"
PLIST_PATH="${HOME}/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="${HOME}/Library/Logs/plm-dashboard"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_PATH="${REPO_ROOT}/scripts/local-dashboard-server.py"
PYTHON_PATH="$(command -v python3)"
PORT="${PLM_DASHBOARD_PORT:-8080}"
UPSTREAM="${PLM_DASHBOARD_UPSTREAM:-http://100.110.194.101}"
URL="http://127.0.0.1:${PORT}/"

install_service() {
  mkdir -p "$(dirname "$PLIST_PATH")" "$LOG_DIR"
  launchctl bootout "${DOMAIN}/${LABEL}" >/dev/null 2>&1 || true

  for _ in {1..20}; do
    if ! lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
      break
    fi
    sleep 0.25
  done

  if lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "ERROR: port ${PORT} is already in use" >&2
    lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN >&2
    exit 1
  fi

  PLIST_PATH="$PLIST_PATH" LABEL="$LABEL" PYTHON_PATH="$PYTHON_PATH" \
    SERVER_PATH="$SERVER_PATH" REPO_ROOT="$REPO_ROOT" PORT="$PORT" \
    UPSTREAM="$UPSTREAM" LOG_DIR="$LOG_DIR" "$PYTHON_PATH" <<'PY'
import os
import plistlib

config = {
    "Label": os.environ["LABEL"],
    "ProgramArguments": [
        os.environ["PYTHON_PATH"],
        os.environ["SERVER_PATH"],
        "--host",
        "127.0.0.1",
        "--port",
        os.environ["PORT"],
        "--upstream",
        os.environ["UPSTREAM"],
    ],
    "WorkingDirectory": os.environ["REPO_ROOT"],
    "RunAtLoad": True,
    "KeepAlive": True,
    "ThrottleInterval": 10,
    "StandardOutPath": os.path.join(os.environ["LOG_DIR"], "stdout.log"),
    "StandardErrorPath": os.path.join(os.environ["LOG_DIR"], "stderr.log"),
}

with open(os.environ["PLIST_PATH"], "wb") as plist_file:
    plistlib.dump(config, plist_file)
PY

  launchctl bootstrap "$DOMAIN" "$PLIST_PATH"
  launchctl kickstart -k "${DOMAIN}/${LABEL}"

  for _ in {1..20}; do
    if curl --silent --fail --output /dev/null "$URL"; then
      echo "PLM Dashboard service installed: ${URL}"
      return
    fi
    sleep 0.5
  done

  echo "ERROR: service did not become ready" >&2
  tail -n 20 "${LOG_DIR}/stderr.log" >&2 || true
  exit 1
}

uninstall_service() {
  launchctl bootout "${DOMAIN}/${LABEL}" >/dev/null 2>&1 || true
  rm -f "$PLIST_PATH"
  echo "PLM Dashboard service removed"
}

show_status() {
  launchctl print "${DOMAIN}/${LABEL}" | sed -n '1,35p'
  echo
  curl --silent --show-error --output /dev/null --write-out \
    "Dashboard HTTP %{http_code}\n" "$URL"
  curl --silent --show-error --output /dev/null --write-out \
    "API proxy HTTP %{http_code}\n" "${URL}op/users/me"
}

case "${1:-install}" in
  install)
    install_service
    ;;
  uninstall)
    uninstall_service
    ;;
  status)
    show_status
    ;;
  *)
    echo "Usage: ${0##*/} [install|uninstall|status]" >&2
    exit 2
    ;;
esac
