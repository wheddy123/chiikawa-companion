#!/usr/bin/env bash
set -euo pipefail

NAME="${1:-snap}"
CONFIG="$HOME/Library/Application Support/chiikawa-companion/chiikawa-config.json"
if [ ! -f "$CONFIG" ]; then
  echo "Error: Config file not found at $CONFIG" >&2
  exit 1
fi

TOKEN=$(python3 -c "import json; print(json.load(open('$CONFIG'))['token'])")
RES=$(curl -s -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:7788/debug/snapshot?name=$NAME")

FILE=$(python3 -c "import json; print(json.loads('''$RES''').get('file', ''))")
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Error taking snapshot: $RES" >&2
  exit 1
fi

GRAY_FILE="${FILE%.png}_gray.png"

python3 -c "
from PIL import Image
im = Image.open('$FILE').convert('RGBA')
bg = Image.new('RGBA', im.size, (136, 136, 136, 255))
comp = Image.alpha_composite(bg, im).convert('RGB')
comp.save('$GRAY_FILE')
"

echo "$GRAY_FILE"
