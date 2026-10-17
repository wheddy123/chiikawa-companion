#!/usr/bin/env bash
# ==============================================================================
# Chiikawa Companion CLI Notification Sender (macOS / Linux)
# Usage:
#   chiikawa-notify.sh --state <state> --message <text> [--source <source>] [--duration <ms>] [--sticky]
# Or shorthand:
#   chiikawa-notify.sh success "Build completed!" "claude-code"
# ==============================================================================

STATE="idle"
MESSAGE=""
SOURCE="terminal"
DURATION=""
STICKY="false"
SOUND=""

# Helper for parsing
while [[ $# -gt 0 ]]; do
  case "$1" in
    --state|-s)
      STATE="$2"
      shift 2
      ;;
    --message|-m)
      MESSAGE="$2"
      shift 2
      ;;
    --source)
      SOURCE="$2"
      shift 2
      ;;
    --duration|-d)
      DURATION="$2"
      shift 2
      ;;
    --sound)
      SOUND="$2"
      shift 2
      ;;
    --sticky)
      STICKY="true"
      shift
      ;;
    *)
      # Positional arguments fallback: $1 = state, $2 = message, $3 = source
      if [ -z "$MESSAGE" ] && [ "$STATE" == "idle" ]; then
        STATE="$1"
        shift
        if [ $# -gt 0 ]; then
          MESSAGE="$1"
          shift
        fi
        if [ $# -gt 0 ]; then
          SOURCE="$1"
          shift
        fi
      else
        shift
      fi
      ;;
  esac
done

if [ -z "$MESSAGE" ]; then
  # No message provided, ignore silently
  exit 0
fi

# Locate chiikawa-config.json
CONFIG_PATHS=(
  "$HOME/Library/Application Support/chiikawa-companion/chiikawa-config.json"
  "$XDG_CONFIG_HOME/chiikawa-companion/chiikawa-config.json"
  "$HOME/.config/chiikawa-companion/chiikawa-config.json"
  "$APPDATA/chiikawa-companion/chiikawa-config.json"
)

CONFIG_FILE=""
for p in "${CONFIG_PATHS[@]}"; do
  if [ -f "$p" ]; then
    CONFIG_FILE="$p"
    break
  fi
done

if [ -z "$CONFIG_FILE" ]; then
  # App hasn't run yet or config missing, exit silently to never block agents
  exit 0
fi

# Extract token and port with python/perl/sed/grep
TOKEN=$(grep -o '"token"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_FILE" 2>/dev/null | head -n1 | sed -e 's/.*"token"[[:space:]]*:[[:space:]]*"//' -e 's/"//')
PORT=$(grep -o '"port"[[:space:]]*:[[:space:]]*[0-9]*' "$CONFIG_FILE" 2>/dev/null | head -n1 | sed -e 's/.*:[[:space:]]*//')

PORT="${PORT:-7788}"

if [ -z "$TOKEN" ]; then
  exit 0
fi

# Escape JSON string safely
ESCAPED_MSG=$(echo "$MESSAGE" | awk '{gsub(/\\/, "\\\\"); gsub(/"/, "\\\""); gsub(/\t/, "\\t"); gsub(/\r/, ""); printf "%s\\n", $0}' | sed '$ s/\\n$//')

JSON_BODY="{\"state\":\"$STATE\",\"message\":\"$ESCAPED_MSG\",\"source\":\"$SOURCE\",\"sticky\":$STICKY"
if [ -n "$DURATION" ]; then
  JSON_BODY="$JSON_BODY,\"duration_ms\":$DURATION"
fi
if [ -n "$SOUND" ]; then
  JSON_BODY="$JSON_BODY,\"sound\":\"$SOUND\""
fi
JSON_BODY="$JSON_BODY}"

# Send HTTP request with 1.5s timeout. Output discarded to avoid polluting agent output.
curl -s --connect-timeout 1 --max-time 1.5 \
  -X POST "http://127.0.0.1:$PORT/notify" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$JSON_BODY" >/dev/null 2>&1 || true

exit 0
