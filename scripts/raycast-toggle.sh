#!/usr/bin/env bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Toggle Chiikawa
# @raycast.mode silent

# Optional parameters:
# @raycast.icon 🐾
# @raycast.packageName Chiikawa Companion

CONFIG_FILE="$HOME/Library/Application Support/chiikawa-companion/chiikawa-config.json"

if [ ! -f "$CONFIG_FILE" ]; then
  echo "Chiikawa configuration not found"
  exit 0
fi

TOKEN=$(grep -o '"token"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_FILE" 2>/dev/null | head -n1 | sed -e 's/.*"token"[[:space:]]*:[[:space:]]*"//' -e 's/"//')
PORT=$(grep -o '"port"[[:space:]]*:[[:space:]]*[0-9]*' "$CONFIG_FILE" 2>/dev/null | head -n1 | sed -e 's/.*:[[:space:]]*//')
PORT="${PORT:-7788}"

curl -s --connect-timeout 1 --max-time 1.5 \
  -X POST "http://127.0.0.1:$PORT/toggle-raycast" \
  -H "Authorization: Bearer $TOKEN" >/dev/null 2>&1 || true

echo "Toggled Chiikawa Mascot"
