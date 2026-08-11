#!/usr/bin/env bash
# Purge Cloudflare's edge cache for one or more therapybydavid.com paths.
#
# Blog post URLs are cached at the edge for 7 days by a zone-level cache rule,
# so deleting or editing an existing post keeps serving the stale copy until it
# is purged. Deploys do NOT purge it.
#
#   ./scripts/purge-cache.sh /blog/some-post
#   ./scripts/purge-cache.sh /blog/some-post /another-page
#
# Each path is purged in both its extensionless and .html form, because .html
# URLs 308 to extensionless and the two are cached separately.
#
# Token: needs Zone -> Cache Purge -> Purge, scoped to therapybydavid.com.
# Read from $CLOUDFLARE_API_TOKEN, or the CLOUDFLARE_API_TOKEN= line in
# keys.txt on the mounted backup drive.

set -euo pipefail

ZONE_NAME="therapybydavid.com"
SITE="https://${ZONE_NAME}"

if [ $# -eq 0 ]; then
  echo "usage: $0 /path [/path ...]" >&2
  exit 64
fi

TOKEN="${CLOUDFLARE_API_TOKEN:-}"
if [ -z "$TOKEN" ]; then
  for keyfile in "/Volumes/Therapy Backup/keys.txt" "/Volumes/ROBLES/keys.txt" "/Volumes/ROBLES2/keys.txt"; do
    if [ -f "$keyfile" ]; then
      TOKEN=$(grep -m1 "^CLOUDFLARE_API_TOKEN=" "$keyfile" 2>/dev/null | cut -d= -f2- | tr -d ' "'"'"'' || true)
      [ -n "$TOKEN" ] && break
    fi
  done
fi

if [ -z "$TOKEN" ]; then
  cat >&2 <<'EOF'
No Cloudflare API token found.

Set one for this run:
  export CLOUDFLARE_API_TOKEN=...

Or fill in the CLOUDFLARE_API_TOKEN= line in keys.txt on the backup drive.
Create the token at Cloudflare -> My Profile -> API Tokens -> Create Token
-> Custom token, with Zone / Cache Purge / Purge, scoped to therapybydavid.com.
EOF
  exit 78
fi

api() { curl -sS -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" "$@"; }

ZONE_ID=$(api "https://api.cloudflare.com/client/v4/zones?name=${ZONE_NAME}" \
  | python3 -c 'import sys,json; r=json.load(sys.stdin).get("result") or []; print(r[0]["id"] if r else "")')

if [ -z "$ZONE_ID" ]; then
  echo "Could not resolve the zone id for ${ZONE_NAME}." >&2
  echo "The token is probably missing Zone:Read or is scoped to a different zone." >&2
  exit 77
fi

FILES=$(python3 - "$SITE" "$@" <<'PY'
import json, sys
site, paths = sys.argv[1], sys.argv[2:]
urls = []
for p in paths:
    p = "/" + p.lstrip("/")
    base = p[:-5] if p.endswith(".html") else p
    for u in (site + base, site + base + ".html"):
        if u not in urls:
            urls.append(u)
print(json.dumps({"files": urls}))
PY
)

echo "Purging from zone ${ZONE_NAME}:"
python3 -c 'import json,sys; [print("   ",u) for u in json.loads(sys.argv[1])["files"]]' "$FILES"

RESP=$(api -X POST "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/purge_cache" --data "$FILES")
OK=$(printf '%s' "$RESP" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("success"))')

if [ "$OK" != "True" ]; then
  echo "Purge failed:" >&2
  printf '%s\n' "$RESP" | python3 -m json.tool >&2 || printf '%s\n' "$RESP" >&2
  exit 1
fi

echo "Purged. Verifying..."
for p in "$@"; do
  p="/${p#/}"; base="${p%.html}"
  code=$(curl -s -o /dev/null -w "%{http_code}" "${SITE}${base}")
  echo "   ${base} -> HTTP ${code}"
done
