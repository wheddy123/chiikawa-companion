#!/usr/bin/env bash
# scripts/dev-restart.sh - Safe build & process restarter for Chiikawa AI
set -euo pipefail

WORKSPACE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$WORKSPACE"

echo "[dev-restart] 1. Running typecheck and build..."
npm run typecheck
npm run build

echo "[dev-restart] 2. Stopping existing Chiikawa process..."
TARGET_PID=""
if [ -f /tmp/chiikawa.pid ]; then
  FILE_PID="$(cat /tmp/chiikawa.pid 2>/dev/null || true)"
  if [ -n "$FILE_PID" ] && kill -0 "$FILE_PID" 2>/dev/null; then
    TARGET_PID="$FILE_PID"
  fi
fi

# Also check port 7788 listener
PORT_PID="$(lsof -tiTCP:7788 -sTCP:LISTEN 2>/dev/null || true)"
if [ -n "$PORT_PID" ]; then
  TARGET_PID="$PORT_PID"
fi

if [ -n "$TARGET_PID" ]; then
  echo "[dev-restart] Stopping Chiikawa PID $TARGET_PID..."
  kill "$TARGET_PID" 2>/dev/null || true
  for _ in {1..25}; do
    kill -0 "$TARGET_PID" 2>/dev/null || break
    sleep 0.2
  done
  if kill -0 "$TARGET_PID" 2>/dev/null; then
    echo "[dev-restart] PID $TARGET_PID did not exit gracefully, terminating..."
    kill -9 "$TARGET_PID" 2>/dev/null || true
  fi
  rm -f /tmp/chiikawa.pid
  echo "[dev-restart] Process stopped cleanly."
else
  echo "[dev-restart] No active Chiikawa process found on port 7788 or /tmp/chiikawa.pid."
fi

mkdir -p /tmp/chiikawa-evidence

echo "[dev-restart] Build and shutdown complete. Electron should be launched via manage_task / background task."
