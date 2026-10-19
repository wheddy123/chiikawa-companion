#!/usr/bin/env bash
# scripts/guard_secrets.sh - scans repo and worklog for leaked Bearer tokens
set -euo pipefail

FAIL=0

# Pattern for Bearer token: "Bearer " followed by 20+ alphanumerics
PATTERN='Bearer[[:space:]]+[A-Za-z0-9_-]{20,}'

# Check tracked files, excluding this script itself and binary files
TRACKED_HITS="$(git grep -EI "$PATTERN" -- ':!scripts/guard_secrets.sh' || true)"
if [ -n "$TRACKED_HITS" ]; then
  echo "❌ GUARD SECRETS FAIL: Tracked files contain Bearer token patterns!"
  echo "$TRACKED_HITS" | awk -F: '{print $1}' | sort -u
  FAIL=1
fi

# Check .agent/worklog.md if present
if [ -f ".agent/worklog.md" ]; then
  WORKLOG_HITS="$(grep -EI "$PATTERN" .agent/worklog.md || true)"
  if [ -n "$WORKLOG_HITS" ]; then
    echo "❌ GUARD SECRETS FAIL: .agent/worklog.md contains Bearer token pattern!"
    FAIL=1
  fi
fi

if [ "$FAIL" -eq 0 ]; then
  echo "✓ guard_secrets: No secrets detected in repo or worklog."
  exit 0
else
  exit 1
fi
