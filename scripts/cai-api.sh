#!/usr/bin/env bash
# scripts/cai-api.sh METHOD PATH [JSON_BODY] - reads token+port at runtime, never prints the token
set -euo pipefail
CFG="${CAI_CONFIG:-$HOME/Library/Application Support/chiikawa-ai/chiikawa-config.json}"
[ -f "$CFG" ] || CFG="$HOME/Library/Application Support/chiikawa-companion/chiikawa-config.json"
TOKEN="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["token"])' "$CFG")"
PORT="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("port",7788))' "$CFG")"
M="${1:-GET}"; P="${2:-/health}"; B="${3:-}"
if [ -n "$B" ]; then
  curl -sS -X "$M" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "$B" "http://127.0.0.1:$PORT$P"
else
  curl -sS -X "$M" -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:$PORT$P"
fi
