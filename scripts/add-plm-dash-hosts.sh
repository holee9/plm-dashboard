#!/usr/bin/env bash
set -euo pipefail

HOST_NAME="plm-dash.work"
HOSTS_FILE="${PLM_DASHBOARD_HOSTS_FILE:-/etc/hosts}"
TARGET_IP=""
NETWORK_LABEL=""
PROFILE=""
DRY_RUN=0

usage() {
  cat <<EOF
Usage: ${0##*/} [office25g|wired|tailscale] [--dry-run]

No profile: auto-detect the network, then prompt if needed.
office25g : map ${HOST_NAME} to 192.168.100.50
wired     : map ${HOST_NAME} to 10.20.6.187
tailscale : map ${HOST_NAME} to 100.110.194.101
--dry-run : print the updated hosts file without changing the system
EOF
}

set_profile() {
  case "$1" in
    office25g|office-25g)
      TARGET_IP="192.168.100.50"
      NETWORK_LABEL="Office 2.5G"
      ;;
    wired|office-wired)
      TARGET_IP="10.20.6.187"
      NETWORK_LABEL="Office wired"
      ;;
    tailscale)
      TARGET_IP="100.110.194.101"
      NETWORK_LABEL="Tailscale"
      ;;
    *)
      echo "Unknown profile: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
}

detect_network() {
  local addresses
  addresses="$({ ifconfig 2>/dev/null || true; ip address 2>/dev/null || true; } | tr '\n' ' ')"

  if [[ "$addresses" == *"192.168.100."* ]]; then
    set_profile office25g
  elif [[ "$addresses" == *"10.20.6."* ]]; then
    set_profile wired
  elif command -v tailscale >/dev/null 2>&1 && tailscale ip -4 >/dev/null 2>&1; then
    set_profile tailscale
  elif [[ "$addresses" =~ 100\.(6[4-9]|[78][0-9]|9[0-9]|1[01][0-9]|12[0-7])\. ]]; then
    set_profile tailscale
  fi
}

choose_network() {
  if [[ ! -t 0 ]]; then
    echo "Could not auto-detect the network. Pass office25g, wired, or tailscale." >&2
    exit 1
  fi

  echo "Could not auto-detect the current network."
  echo
  echo "1. Office 2.5G  (192.168.100.x) - 192.168.100.50"
  echo "2. Office wired (10.20.6.x)     - 10.20.6.187"
  echo "3. Tailscale remote              - 100.110.194.101"
  echo
  read -r -p "Select network [1-3]: " selection
  case "$selection" in
    1) set_profile office25g ;;
    2) set_profile wired ;;
    3) set_profile tailscale ;;
    *) echo "Invalid selection: $selection" >&2; exit 2 ;;
  esac
}

open_dashboard() {
  local url="http://${HOST_NAME}/"
  if [[ "${PLM_DASHBOARD_NO_OPEN:-0}" == "1" ]]; then
    return
  fi

  case "$(uname -s)" in
    Darwin) open "$url" ;;
    Linux)
      if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$url" >/dev/null 2>&1 &
      elif command -v powershell.exe >/dev/null 2>&1; then
        powershell.exe -NoProfile -Command "Start-Process '$url'" >/dev/null 2>&1
      fi
      ;;
  esac
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help|help)
      usage
      exit 0
      ;;
    --dry-run)
      DRY_RUN=1
      ;;
    *)
      if [[ -n "$PROFILE" ]]; then
        echo "Only one network profile can be specified." >&2
        exit 2
      fi
      PROFILE="$1"
      ;;
  esac
  shift
done

if [[ -n "$PROFILE" ]]; then
  set_profile "$PROFILE"
else
  detect_network
fi
if [[ -z "$TARGET_IP" ]]; then
  choose_network
fi

TEMP_FILE="$(mktemp)"
trap 'rm -f "$TEMP_FILE"' EXIT
awk -v target="$HOST_NAME" '
  {
    original = $0
    content = $0
    comment = ""
    comment_at = index(content, "#")
    if (comment_at > 0) {
      comment = substr(content, comment_at)
      content = substr(content, 1, comment_at - 1)
    }
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", content)
    if (content == "") {
      print original
      next
    }

    field_count = split(content, fields, /[[:space:]]+/)
    found = 0
    alias_count = 0
    rebuilt = fields[1]
    for (field_index = 2; field_index <= field_count; field_index++) {
      if (tolower(fields[field_index]) == tolower(target)) {
        found = 1
      } else {
        rebuilt = rebuilt "  " fields[field_index]
        alias_count++
      }
    }

    if (!found) {
      print original
    } else if (alias_count > 0) {
      print rebuilt (comment == "" ? "" : "  " comment)
    } else if (comment != "") {
      print comment
    }
  }
' "$HOSTS_FILE" >"$TEMP_FILE"
printf '%s  %s\n' "$TARGET_IP" "$HOST_NAME" >>"$TEMP_FILE"

echo "${HOST_NAME} -> ${TARGET_IP} [${NETWORK_LABEL}]"
if [[ "$DRY_RUN" == "1" ]]; then
  cat "$TEMP_FILE"
  exit 0
fi

BACKUP_PATH="${TMPDIR:-/tmp}/hosts.plm-dash.backup.$(date +%Y%m%d%H%M%S)"
cp "$HOSTS_FILE" "$BACKUP_PATH"
sudo cp "$TEMP_FILE" "$HOSTS_FILE"

case "$(uname -s)" in
  Darwin)
    sudo dscacheutil -flushcache >/dev/null 2>&1 || true
    sudo killall -HUP mDNSResponder >/dev/null 2>&1 || true
    ;;
  Linux)
    resolvectl flush-caches >/dev/null 2>&1 || true
    ;;
esac

echo "Done. Backup: ${BACKUP_PATH}"
echo "Opening http://${HOST_NAME}/"
open_dashboard
