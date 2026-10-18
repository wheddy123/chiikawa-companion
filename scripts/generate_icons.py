#!/usr/bin/env python3
import os
import subprocess
from PIL import Image

SRC_IMG = "/Users/wheddy/.gemini/antigravity-cli/brain/8fdbdef5-b4c2-4a8a-a25f-fd6c293e5f9c/.user_uploaded/uploaded_media_1792303601081.png"
ASSETS_DIR = "/Users/wheddy/Desktop/chiikau\u031ba/assets"
ICONSET_DIR = "/tmp/chiikawa_cai.iconset"

print("[1/5] Loading source image:", SRC_IMG)
im = Image.open(SRC_IMG)
print(f"Source size: {im.size}, mode: {im.mode}")

# 1. Save high-res master 1024x1024 icon.png
im_1024 = im.resize((1024, 1024), Image.Resampling.LANCZOS)
icon_png_path = os.path.join(ASSETS_DIR, "icon.png")
im_1024.save(icon_png_path, "PNG")
print("Saved assets/icon.png (1024x1024)")

# 2. Save tray icon (32x32)
im_tray = im.resize((32, 32), Image.Resampling.LANCZOS)
tray_path = os.path.join(ASSETS_DIR, "tray.png")
im_tray.save(tray_path, "PNG")
print("Saved assets/tray.png (32x32)")

# 3. Save multi-resolution Windows icon.ico
ico_path = os.path.join(ASSETS_DIR, "icon.ico")
im_1024.save(
    ico_path,
    format="ICO",
    sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
)
print("Saved assets/icon.ico (Windows multi-res)")

# 4. Generate macOS icon.icns via iconutil
os.makedirs(ICONSET_DIR, exist_ok=True)
icon_sizes = [
    ("icon_16x16.png", (16, 16)),
    ("icon_16x16@2x.png", (32, 32)),
    ("icon_32x32.png", (32, 32)),
    ("icon_32x32@2x.png", (64, 64)),
    ("icon_128x128.png", (128, 128)),
    ("icon_128x128@2x.png", (256, 256)),
    ("icon_256x256.png", (256, 256)),
    ("icon_256x256@2x.png", (512, 512)),
    ("icon_512x512.png", (512, 512)),
    ("icon_512x512@2x.png", (1024, 1024)),
]

created_files = []
for name, sz in icon_sizes:
    fpath = os.path.join(ICONSET_DIR, name)
    resized = im.resize(sz, Image.Resampling.LANCZOS)
    resized.save(fpath, "PNG")
    created_files.append(fpath)

icns_path = os.path.join(ASSETS_DIR, "icon.icns")
try:
    subprocess.run(["iconutil", "-c", "icns", ICONSET_DIR, "-o", icns_path], check=True)
    print("Saved assets/icon.icns (macOS multi-res)")
except Exception as e:
    print("Warning: iconutil failed, electron-builder will fallback to icon.png:", e)

# Clean up temp iconset
for f in created_files:
    try:
        os.remove(f)
    except:
        pass
try:
    os.rmdir(ICONSET_DIR)
except:
    pass

print("[5/5] All icon assets generated successfully!")
