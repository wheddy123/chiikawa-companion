#!/usr/bin/env python3
"""Find eyes + mouth in a gray-composited snapshot. Pure PIL (no numpy/scipy).
usage: find_face_features.py snapshot_gray.png out_debug.png
prints JSON: {eyeL, eyeR, mouth_px, scale_hint}"""
import sys, json
from collections import deque
from PIL import Image, ImageDraw

if len(sys.argv) < 3:
    print(f"Usage: {sys.argv[0]} <snapshot_gray.png> <out_debug.png>")
    sys.exit(1)

src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGB")
W, H = im.size
px = im.load()
dark = [[False] * W for _ in range(H)]
for y in range(H):
    for x in range(W):
        r, g, b = px[x, y]
        # Dark facial features (eyes, eyebrows, mouth)
        if 0.299 * r + 0.587 * g + 0.114 * b < 70:
            dark[y][x] = True

seen = [[False] * W for _ in range(H)]
comps = []
for y in range(H):
    for x in range(W):
        if dark[y][x] and not seen[y][x]:
            q = deque([(x, y)]); seen[y][x] = True
            pts = []
            while q:
                cx, cy = q.popleft(); pts.append((cx, cy))
                for nx, ny in ((cx+1, cy), (cx-1, cy), (cx, cy+1), (cx, cy-1)):
                    if 0 <= nx < W and 0 <= ny < H and dark[ny][nx] and not seen[ny][nx]:
                        seen[ny][nx] = True; q.append((nx, ny))
            if len(pts) >= 15:
                xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
                comps.append({
                    "area": len(pts),
                    "cx": sum(xs) / len(xs),
                    "cy": sum(ys) / len(ys),
                    "bbox": [min(xs), min(ys), max(xs), max(ys)]
                })

if len(comps) < 3:
    print(json.dumps({"error": "need >=3 dark components (2 eyes + mouth)", "found": len(comps)}))
    sys.exit(2)

# eyes = the pair with similar cy, similar area, horizontally separated, largest areas
best = None
for i in range(len(comps)):
    for j in range(i + 1, len(comps)):
        a, b = comps[i], comps[j]
        if abs(a["cy"] - b["cy"]) > 0.25 * abs(a["cx"] - b["cx"]):
            continue
        if abs(a["cx"] - b["cx"]) < 20:
            continue
        ratio = min(a["area"], b["area"]) / max(a["area"], b["area"])
        score = ratio * min(a["area"], b["area"])
        if best is None or score > best[0]:
            best = (score, a, b)

if not best:
    print(json.dumps({"error": "no eye pair found", "comps": comps}))
    sys.exit(3)

_, e1, e2 = best
eyeL, eyeR = sorted((e1, e2), key=lambda c: c["cx"])
mid = (eyeL["cx"] + eyeR["cx"]) / 2
d = eyeR["cx"] - eyeL["cx"]
eye_y = (eyeL["cy"] + eyeR["cy"]) / 2

# Mouth candidate(s): below eyes, horizontally centered between eyes
mouth_parts = [c for c in comps if c is not eyeL and c is not eyeR
               and abs(c["cx"] - mid) < 0.45 * d and c["cy"] > eye_y]

if not mouth_parts:
    print(json.dumps({"error": "no mouth candidate below/between eyes", "comps": comps}))
    sys.exit(4)

tot = sum(c["area"] for c in mouth_parts)
mx = sum(c["cx"] * c["area"] for c in mouth_parts) / tot
my = sum(c["cy"] * c["area"] for c in mouth_parts) / tot

dr = ImageDraw.Draw(im)
for c in (eyeL, eyeR):
    dr.ellipse([c["cx"]-12, c["cy"]-12, c["cx"]+12, c["cy"]+12], outline=(0, 160, 255), width=3)
dr.line([mx-18, my, mx+18, my], fill=(255, 0, 0), width=3)
dr.line([mx, my-18, mx, my+18], fill=(255, 0, 0), width=3)
im.save(out)

print(json.dumps({
    "eyeL": [eyeL["cx"], eyeL["cy"]],
    "eyeR": [eyeR["cx"], eyeR["cy"]],
    "mouth_px": [mx, my],
    "image_size": [W, H],
    "scale": W / 320.0,
    "mouth_css": [mx / (W / 320.0), my / (H / 420.0)],
    "note": "mouth_css gives CSS pixel coords matching renderer getBoundingClientRect"
}))
