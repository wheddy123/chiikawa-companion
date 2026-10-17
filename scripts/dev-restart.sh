#!/usr/bin/env bash
set -euo pipefail

WORKSPACE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$WORKSPACE"

echo "[dev-restart] Building project..."
npm run build

echo "[dev-restart] Stopping existing Chiikawa process..."
if [ -f /tmp/chiikawa.pid ]; then
  OLD_PID="$(cat /tmp/chiikawa.pid || true)"
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "[dev-restart] Stopping PID $OLD_PID..."
    kill "$OLD_PID" 2>/dev/null || true
    for _ in {1..20}; do
      kill -0 "$OLD_PID" 2>/dev/null || break
      sleep 0.2
    done
  fi
  rm -f /tmp/chiikawa.pid
fi

# Fallback: check if port 7788 is still bound, kill ONLY that specific PID
PID_PORT="$(lsof -tiTCP:7788 -sTCP:LISTEN 2>/dev/null || true)"
if [ -n "$PID_PORT" ]; then
  echo "[dev-restart] Port 7788 held by PID $PID_PORT, stopping it..."
  kill "$PID_PORT" 2>/dev/null || true
  for _ in {1..20}; do
    kill -0 "$PID_PORT" 2>/dev/null || break
    sleep 0.2
  done
fi

mkdir -p /tmp/chiikawa-evidence

echo "[dev-restart] Starting Chiikawa in debug mode..."
CHIIKAWA_DEBUG=1 nohup ./node_modules/.bin/electron . > /tmp/chiikawa-dev.log 2>&1 &
NEW_PID=$!
echo "$NEW_PID" > /tmp/chiikawa.pid
echo "[dev-restart] Chiikawa launched (PID $NEW_PID)"

# Wait for server to become healthy
MAX_TRIES=20
TRIES=0
while [ $TRIES -lt $MAX_TRIES ]; do
  if curl -s http://127.0.0.1:7788/health >/dev/null 2>&1; then
    HEALTH="$(curl -s http://127.0.0.1:7788/health)"
    echo "[dev-restart] Ready! Health: $HEALTH"
    exit 0
  fi
  sleep 0.5
  TRIES=$((TRIES + 1))
done

echo "[dev-restart] Error: Server did not respond to /health in time. Check /tmp/chiikawa-dev.log"
tail -n 25 /tmp/chiikawa-dev.log
exit 1
