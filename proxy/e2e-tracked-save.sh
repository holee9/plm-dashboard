#!/usr/bin/env bash
# 주요 과제 선택 (#110): server-side save test. Starts throw-away nginx containers with the real nginx.conf,
# default.conf.template and tracked.js, as the production container runs (master root, worker uid 101, ACL directory),
# and checks (A) invalid input is rejected with the existing file untouched, (B) an existing file survives a failed write,
# (C) the permission and path rules. Needs docker and setfacl. Touches nothing outside a scratch directory.
set -uo pipefail
cd "$(dirname "$0")"
W=$(mktemp -d "${TMPDIR:-/tmp}/tracked-save.XXXXXX")
PORT_OK=${PORT_OK:-18110}; PORT_RO=${PORT_RO:-18111}; PORT_DENY=${PORT_DENY:-18112}
FILE=tracked-projects.json; P=/data/config/$FILE
pass=0; fail=0
ok()  { echo "  PASS $1"; pass=$((pass+1)); }
bad() { echo "  FAIL $1"; fail=$((fail+1)); }
cleanup() { docker rm -f plm-ts-ok plm-ts-ro plm-ts-deny >/dev/null 2>&1; rm -rf "$W"; }
trap cleanup EXIT

mkdir -p "$W/dash/data/config" "$W/acl" "$W/ro"
cp -r ../design_handoff_plm_dashboard/. "$W/dash/" && rm -rf "$W/dash/.moai" "$W/dash/data/config" && mkdir -p "$W/dash/data/config"
setfacl -m u:101:rwx "$W/acl" || { echo "setfacl failed"; exit 2; }
conf() { sed -e "s/listen 80;/listen 127.0.0.1:$1;/" -e '/listen 8088;/d' -e 's/\${OP_AUTH_B64}/x/' nginx/default.conf.template > "$W/c$1.conf"; }
conf "$PORT_OK"; conf "$PORT_RO"; conf "$PORT_DENY"
sed -i '/allow /d' "$W/c$PORT_DENY.conf"          # no network is allowed to write
run() { docker run -d --rm --name "$1" --network host -v "$PWD/nginx/nginx.conf:/etc/nginx/nginx.conf:ro" -v "$PWD/nginx/tracked.js:/etc/nginx/njs/tracked.js:ro" \
  -v "$W/c$2.conf:/etc/nginx/conf.d/default.conf:ro" -v "$W/dash:/dashboard:ro" -v "$3:/dashboard/data/config:rw" nginx:alpine >/dev/null; }
run plm-ts-ok "$PORT_OK" "$W/acl"; run plm-ts-ro "$PORT_RO" "$W/ro"; run plm-ts-deny "$PORT_DENY" "$W/ro"
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -o /dev/null "http://127.0.0.1:$PORT_OK/" && break; sleep 0.5; done
if docker logs plm-ts-ok 2>&1 | grep -q "emerg"; then docker logs plm-ts-ok 2>&1 | grep emerg; echo "nginx failed to start"; exit 2; fi

U=http://127.0.0.1:$PORT_OK
put()  { curl -s -o "$W/resp" -w '%{http_code}' -X PUT -H 'Content-Type: application/json' --data-binary "$2" "$1$P"; }
sha()  { sha256sum "$1/$FILE" 2>/dev/null | cut -c1-16; }
files() { ls -A "$1" | tr '\n' ' '; }

echo "[A] invalid input is rejected and the existing file is untouched (ACL directory, uid 101)"
c=$(put "$U" '{"version":1,"excluded":["HVR","CON"],"updated_at":"1999-01-01T00:00:00Z"}')
[ "$c" = 204 ] && ok "valid PUT -> 204" || bad "valid PUT -> $c"
base=$(sha "$W/acl"); [ -n "$base" ] && ok "file written" || bad "file missing"
grep -q '"excluded":\["CON","HVR"\]' "$W/acl/$FILE" && ok "excluded stored sorted" || bad "excluded not sorted: $(cat "$W/acl/$FILE")"
grep -q 1999 "$W/acl/$FILE" && bad "client updated_at was kept" || ok "updated_at is stamped by the server, not the client"
[ "$(stat -c '%u %a' "$W/acl/$FILE")" = "101 644" ] && ok "file owner 101, mode 644 (readable by Hermes)" || bad "owner/mode: $(stat -c '%u %a' "$W/acl/$FILE")"
case_bad() {   # name, body, expected code
  local c; c=$(put "$U" "$2")
  if [ "$c" = "$3" ] && [ "$(sha "$W/acl")" = "$base" ] && [ "$(files "$W/acl")" = "$FILE " ]; then ok "$1 -> $c, file unchanged, no temp file"
  else bad "$1 -> $c (want $3), sha $(sha "$W/acl") vs $base, dir: $(files "$W/acl")"; fi
}
case_bad "malformed JSON"            '{not json' 400
case_bad "empty body"                '' 400
case_bad "array instead of object"   '[]' 400
case_bad "string instead of object"  '"x"' 400
case_bad "null"                      'null' 400
case_bad "wrong version"             '{"version":2,"excluded":[]}' 400
case_bad "missing excluded"          '{"version":1}' 400
case_bad "excluded is a string"      '{"version":1,"excluded":"HVR"}' 400
case_bad "excluded holds a number"   '{"version":1,"excluded":[1]}' 400
case_bad "identifier with a space"   '{"version":1,"excluded":["a b"]}' 400
case_bad "identifier with a path"    '{"version":1,"excluded":["../x"]}' 400
case_bad "duplicate identifiers"     '{"version":1,"excluded":["A","A"]}' 400
case_bad "unknown key"               '{"version":1,"excluded":[],"x":1}' 400
case_bad "__proto__ key"              '{"__proto__":{"x":1},"version":1,"excluded":[]}' 400
c=$(put "$U" '{"version":1,"excluded":["constructor","toString","hasOwnProperty"]}'); [ "$c" = 204 ] && grep -q constructor "$W/acl/$FILE" && ok "names that exist on every JS object are valid identifiers (204)" || bad "object-property names -> $c"
base=$(sha "$W/acl")
case_bad "updated_at is a number"    '{"version":1,"excluded":[],"updated_at":123}' 400
many=$(python3 -c 'import json;print(json.dumps({"version":1,"excluded":["P%d"%i for i in range(501)]}))'); case_bad "501 identifiers" "$many" 400
big=$(head -c 70000 /dev/zero | tr '\0' a); case_bad "body over 64k" "$big" 413
c=$(put "$U" '{"version":1,"excluded":[]}'); [ "$c" = 204 ] && grep -q '"excluded":\[\]' "$W/acl/$FILE" && ok "a later valid PUT replaces the file (204)" || bad "replace failed: $c"
[ "$(files "$W/acl")" = "$FILE " ] && ok "no temp files left after valid and invalid writes" || bad "stray files: $(files "$W/acl")"
[ "$(curl -s "$U$P" | head -c 12)" = '{"version":1' ] && ok "GET returns the saved file" || bad "GET failed"

echo "[B] an existing file survives a failed write (directory the nginx user cannot write to)"
echo '{"version":1,"excluded":["KEEP"],"updated_at":"2026-01-01T00:00:00Z"}' > "$W/ro/$FILE"; chmod 644 "$W/ro/$FILE"
before=$(sha "$W/ro"); R=http://127.0.0.1:$PORT_RO
c=$(put "$R" '{"version":1,"excluded":["NEW"]}')
[ "$c" = 500 ] && ok "write failure -> 500" || bad "write failure -> $c"
[ "$(sha "$W/ro")" = "$before" ] && grep -q KEEP "$W/ro/$FILE" && ok "existing file preserved byte for byte" || bad "existing file changed: $(cat "$W/ro/$FILE")"
[ "$(files "$W/ro")" = "$FILE " ] && ok "no temp file left" || bad "stray files: $(files "$W/ro")"
c=$(put "$R" '{not json'); [ "$c" = 400 ] && [ "$(sha "$W/ro")" = "$before" ] && ok "invalid input on the unwritable directory -> 400, file preserved" || bad "invalid on ro -> $c"

echo "[C] path and network rules"
for m in DELETE POST PATCH; do c=$(curl -s -o /dev/null -w '%{http_code}' -X $m -d x "$U$P"); [ "$c" = 405 ] && [ "$(files "$W/acl")" = "$FILE " ] && ok "$m -> 405, file intact" || bad "$m -> $c"; done
b=$(sha256sum "$W/dash/app.js" | cut -c1-8)
c=$(curl -s -o /dev/null -w '%{http_code}' -X PUT -d hacked "$U/app.js"); [ "$c" = 405 ] && [ "$b" = "$(sha256sum "$W/dash/app.js" | cut -c1-8)" ] && ok "PUT on another existing file -> 405, unchanged" || bad "PUT /app.js -> $c"
c=$(curl -s -o /dev/null -w '%{http_code}' -X PUT -d x "$U/data/config/other.json"); [ "$c" = 405 ] || [ "$c" = 404 ] && [ "$(files "$W/acl")" = "$FILE " ] && ok "PUT on another path in the directory -> $c, nothing created" || bad "PUT other.json -> $c"
c=$(curl -s --path-as-is -o /dev/null -w '%{http_code}' -X PUT -d x "$U/data/config/../../app.js"); [ "$c" = 405 ] || [ "$c" = 404 ] || [ "$c" = 400 ] && ok "path traversal -> $c" || bad "traversal -> $c"
D=http://127.0.0.1:$PORT_DENY; c=$(put "$D" '{"version":1,"excluded":[]}'); [ "$c" = 403 ] && ok "PUT from a network that is not allowed -> 403" || bad "denied network -> $c"

echo "[D] readers never see a partial file while writes are in flight (atomic replace)"
res=$(python3 -I - "$U$P" <<'PY'
import json, sys, threading, urllib.request
url = sys.argv[1]; bad = []; done = threading.Event(); reads = [0]
def reader():
    while not done.is_set():
        try:
            body = urllib.request.urlopen(url, timeout=5).read()
            reads[0] += 1
            j = json.loads(body)
            assert j["version"] == 1 and isinstance(j["excluded"], list)
        except Exception as e:
            bad.append(repr(e)[:80])
rs = [threading.Thread(target=reader) for _ in range(4)]
[t.start() for t in rs]
for i in range(300):
    req = urllib.request.Request(url, data=json.dumps({"version": 1, "excluded": ["P%d" % n for n in range(i % 40)]}).encode(), method="PUT", headers={"Content-Type": "application/json"})
    assert urllib.request.urlopen(req, timeout=5).status == 204
done.set(); [t.join() for t in rs]
print(len(bad), reads[0])
PY
)
bads=${res% *}; reads=${res#* }
[ "$bads" = 0 ] && [ "${reads:-0}" -gt 200 ] && ok "300 writes, $reads concurrent reads, 0 unreadable or partial" || bad "concurrent reads: bad=$bads reads=$reads"
[ "$(files "$W/acl")" = "$FILE " ] && ok "no temp files left after the concurrent writes" || bad "stray files: $(files "$W/acl")"

echo; echo "RESULT: $pass passed, $fail failed"; [ "$fail" = 0 ]
