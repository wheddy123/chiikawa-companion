#!/usr/bin/env bash
# scripts/verify_all.sh - One-command verification gate
set -euo pipefail

WORKSPACE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$WORKSPACE"

FAIL=0
RESULTS=()

run_step() {
  local name="$1"
  local cmd="$2"
  echo "--- Running $name ---"
  if eval "$cmd"; then
    RESULTS+=("PASS | $name")
  else
    RESULTS+=("FAIL | $name")
    FAIL=1
  fi
}

echo "============================================="
echo "   CHIIKAWA AI - VERIFICATION SUITE GATE     "
echo "============================================="

# 1. Typecheck Gate (Tsc)
run_step "TypeScript Typecheck" "npm run typecheck"

# 2. Build Pipeline
run_step "Full Build (Main/Preload/Renderer/Native)" "npm run build"

# 3. Gesture State Machine Unit Tests
run_step "Gesture Unit Tests" "node scripts/test_gesture.mjs"

# 4. Secrets Guard (No Bearer Token Leaks)
run_step "Secrets Guard" "bash scripts/guard_secrets.sh"

# 5. Live E2E Checks if Server is Running in Debug Mode
if curl -s http://127.0.0.1:7788/health >/dev/null 2>&1 && [ "$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:7788/debug/state)" != "404" ]; then
  echo "Detected live debug mascot server at 127.0.0.1:7788"
  run_step "E2E: Double-Click Mute Toggle Sequence" "python3 scripts/test_double_click_sequence.py"
  
  if [ "${VERIFY_FULL_E2E:-0}" = "1" ]; then
    run_step "E2E: Speech Bubbles" "python3 scripts/test_bubbles.py"
    run_step "E2E: Bubble Features" "python3 scripts/test_bubble_features.py"
    run_step "E2E: Stillness & Accents" "python3 scripts/measure_stillness.py"
  fi
else
  echo "Live server not running; skipping live E2E tests."
fi

echo ""
echo "============================================="
echo "           VERIFICATION SUMMARY              "
echo "============================================="
for res in "${RESULTS[@]}"; do
  echo "  $res"
done
echo "============================================="

if [ "$FAIL" -eq 0 ]; then
  echo "✅ ALL VERIFY CHECKS PASSED!"
  exit 0
else
  echo "❌ VERIFICATION FAILED!"
  exit 1
fi
