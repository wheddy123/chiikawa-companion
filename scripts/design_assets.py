#!/usr/bin/env python3
"""
design_assets.py - High-precision visual asset generator for Chiikawa Companion
Complies with Apple macOS Human Interface Guidelines (HIG):
1. App Icon: 1024x1024 canvas, 824x824 squircle tile, multi-layer drop shadows,
   subtle inner bezel, centered C.ai mascot branding with pink blush.
   Outputs: icon.png, icon.ico, icon.icns (via iconutil)
2. Menu Bar Tray Icon: 100% transparent background, clean vector outline glyph,
   crisp template image at 22x22 pt (22x22 and 44x44 @2x).
   Outputs: tray.png, tray@2x.png, trayTemplate.png, trayTemplate@2x.png
3. DMG Background: 540x380 px and 1080x760 px (@2x) installer window background,
   aesthetic pastel tone, directional arrow, drag-to-install prompt.
   Outputs: dmg-background.png, dmg-background@2x.png
"""

import os
import shutil
import subprocess
from PIL import Image, ImageDraw, ImageFont, ImageFilter

SRC_LOGO = "/Users/wheddy/.gemini/antigravity-cli/brain/8fdbdef5-b4c2-4a8a-a25f-fd6c293e5f9c/.user_uploaded/uploaded_media_1792303601081.png"
ASSETS_DIR = "/Users/wheddy/Desktop/chiikau\u031ba/assets"
TEMP_ICONSET = "/tmp/chiikawa_app.iconset"

os.makedirs(ASSETS_DIR, exist_ok=True)

# -------------------------------------------------------------------------
# Step 1: Clean Foreground Logo Extraction (C.ai Mascot + Blush)
# -------------------------------------------------------------------------
print("[1/5] Extracting C.ai mascot graphics from source...")
src_im = Image.open(SRC_LOGO).convert("RGB")
w, h = src_im.size

extracted_logo = Image.new("RGBA", (w, h), (0, 0, 0, 0))

# Logo sits roughly in x: [180, 1090], y: [380, 820]
for y in range(380, 820):
    for x in range(180, 1090):
        r, g, b = src_im.getpixel((x, y))
        diff = max(255 - r, 255 - g, 255 - b)
        # Background pure white noise threshold
        if diff <= 6:
            continue

        # Blush area
        if 475 <= x <= 620 and 585 <= y <= 655 and (g < 245 or b < 245):
            val = max(255 - g, 255 - b)
            if val <= 6:
                continue
            alpha = min(255, int(round((val - 6) * 255.0 / (87.0 - 6))))
            extracted_logo.putpixel((x, y), (253, 168, 177, alpha))
        else:
            mean_val = (r + g + b) / 3.0
            d = 255.0 - mean_val
            if d <= 6:
                continue
            alpha = min(255, int(round((d - 6) * 255.0 / (224.0 - 6))))
            extracted_logo.putpixel((x, y), (31, 31, 31, alpha))

bbox = extracted_logo.getbbox()
logo_cropped = extracted_logo.crop(bbox)
print(f"Extracted logo size: {logo_cropped.size}")

# -------------------------------------------------------------------------
# Step 2: macOS Big Sur+ HIG Squircle App Icon (1024x1024)
# -------------------------------------------------------------------------
print("[2/5] Generating macOS squircle master app icon (1024x1024)...")

canvas_w, canvas_h = 1024, 1024
tile_w, tile_h = 824, 824
tile_x = 100
tile_y = 96
corner_r = 185

# Build supersampled squircle mask for smooth anti-aliased curvature
ss_factor = 4
ss_w, ss_h = tile_w * ss_factor, tile_h * ss_factor
ss_r = corner_r * ss_factor

ss_mask = Image.new("L", (ss_w, ss_h), 0)
ss_draw = ImageDraw.Draw(ss_mask)
ss_draw.rounded_rectangle([0, 0, ss_w - 1, ss_h - 1], radius=ss_r, fill=255)
squircle_mask = ss_mask.resize((tile_w, tile_h), Image.Resampling.LANCZOS)

# Create squircle tile with subtle vertical gradient (#FFFFFF -> #F5F6F8)
tile_img = Image.new("RGBA", (tile_w, tile_h), (255, 255, 255, 255))
tile_draw = ImageDraw.Draw(tile_img)
for y in range(tile_h):
    t = y / float(tile_h)
    r = int(255 * (1 - t) + 245 * t)
    g = int(255 * (1 - t) + 246 * t)
    b = int(255 * (1 - t) + 248 * t)
    tile_draw.line([(0, y), (tile_w, y)], fill=(r, g, b, 255))

# Scale & center mascot logo on tile
target_logo_w = 640
target_logo_h = int(logo_cropped.height * (target_logo_w / float(logo_cropped.width)))
logo_resized = logo_cropped.resize((target_logo_w, target_logo_h), Image.Resampling.LANCZOS)

logo_x = (tile_w - target_logo_w) // 2
logo_y = (tile_h - target_logo_h) // 2
tile_img.paste(logo_resized, (logo_x, logo_y), logo_resized)

# Subtle inner hairline border (rgba(0,0,0,0.08))
ss_border = Image.new("RGBA", (ss_w, ss_h), (0, 0, 0, 0))
ss_bdraw = ImageDraw.Draw(ss_border)
ss_bdraw.rounded_rectangle([0, 0, ss_w - 1, ss_h - 1], radius=ss_r, outline=(0, 0, 0, 22), width=ss_factor)
border_img = ss_border.resize((tile_w, tile_h), Image.Resampling.LANCZOS)
tile_img.paste(border_img, (0, 0), border_img)

# Apply squircle mask to tile
tile_masked = Image.new("RGBA", (tile_w, tile_h), (0, 0, 0, 0))
tile_masked.paste(tile_img, (0, 0), squircle_mask)

# Multi-layer Apple HIG drop shadow against transparent canvas
master_icon = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))

# Layer 1: Ambient soft shadow
ambient = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
ambient_tile = Image.new("RGBA", (tile_w, tile_h), (0, 0, 0, int(255 * 0.16)))
ambient.paste(ambient_tile, (tile_x, tile_y + 10), squircle_mask)
ambient = ambient.filter(ImageFilter.GaussianBlur(28))

# Layer 2: Key contact shadow
key = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
key_tile = Image.new("RGBA", (tile_w, tile_h), (0, 0, 0, int(255 * 0.22)))
key.paste(key_tile, (tile_x, tile_y + 18), squircle_mask)
key = key.filter(ImageFilter.GaussianBlur(12))

# Layer 3: Soft spread shadow
contact = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
contact_tile = Image.new("RGBA", (tile_w, tile_h), (0, 0, 0, int(255 * 0.10)))
contact.paste(contact_tile, (tile_x, tile_y + 4), squircle_mask)
contact = contact.filter(ImageFilter.GaussianBlur(6))

master_icon = Image.alpha_composite(master_icon, ambient)
master_icon = Image.alpha_composite(master_icon, contact)
master_icon = Image.alpha_composite(master_icon, key)
master_icon.paste(tile_masked, (tile_x, tile_y), tile_masked)

# Save assets/icon.png
icon_png_path = os.path.join(ASSETS_DIR, "icon.png")
master_icon.save(icon_png_path, "PNG")
print(f"Saved: {icon_png_path}")

# Multi-res Windows ICO
ico_path = os.path.join(ASSETS_DIR, "icon.ico")
master_icon.save(
    ico_path,
    format="ICO",
    sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
)
print(f"Saved: {ico_path}")

# Multi-res macOS ICNS via iconutil
if os.path.exists(TEMP_ICONSET):
    shutil.rmtree(TEMP_ICONSET)
os.makedirs(TEMP_ICONSET, exist_ok=True)

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

for name, sz in icon_sizes:
    fpath = os.path.join(TEMP_ICONSET, name)
    resized = master_icon.resize(sz, Image.Resampling.LANCZOS)
    resized.save(fpath, "PNG")

icns_path = os.path.join(ASSETS_DIR, "icon.icns")
try:
    subprocess.run(["iconutil", "-c", "icns", TEMP_ICONSET, "-o", icns_path], check=True)
    print(f"Saved: {icns_path}")
except Exception as e:
    print(f"Warning: iconutil failed: {e}")
finally:
    if os.path.exists(TEMP_ICONSET):
        shutil.rmtree(TEMP_ICONSET)


# -------------------------------------------------------------------------
# Step 3: macOS Menu Bar Tray Icon (100% Transparent Background)
# -------------------------------------------------------------------------
print("[3/5] Generating macOS menu bar tray icon...")

def render_chiikawa_tray_glyph(scale=8):
    """
    Renders an ultra-clean Chiikawa outline glyph with transparent background.
    Compatible with macOS setTemplateImage(true).
    """
    size = 44 * scale
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)
    cx, cy = size / 2.0, size / 2.0 + 1 * scale

    stroke_w = int(2.4 * scale)

    # Head body dimensions
    head_w = 30 * scale
    head_h = 24 * scale

    # Ears:
    ear_r = 4.8 * scale
    ear_lx, ear_ly = cx - 9.5 * scale, cy - 8.5 * scale
    ear_rx, ear_ry = cx + 9.5 * scale, cy - 8.5 * scale

    # Draw solid ear loops & head base
    draw.ellipse([ear_lx - ear_r, ear_ly - ear_r, ear_lx + ear_r, ear_ly + ear_r], fill=(0, 0, 0, 255))
    draw.ellipse([ear_rx - ear_r, ear_ry - ear_r, ear_rx + ear_r, ear_ry + ear_r], fill=(0, 0, 0, 255))
    draw.ellipse([cx - head_w / 2.0, cy - head_h / 2.0, cx + head_w / 2.0, cy + head_h / 2.0], fill=(0, 0, 0, 255))

    # Hollow inside head
    in_w = head_w - stroke_w * 2
    in_h = head_h - stroke_w * 2
    draw.ellipse([cx - in_w / 2.0, cy - in_h / 2.0, cx + in_w / 2.0, cy + in_h / 2.0], fill=(0, 0, 0, 0))

    # Hollow inside ears
    in_ear_r = ear_r - stroke_w
    draw.ellipse([ear_lx - in_ear_r, ear_ly - in_ear_r, ear_lx + in_ear_r, ear_ly + in_ear_r], fill=(0, 0, 0, 0))
    draw.ellipse([ear_rx - in_ear_r, ear_ry - in_ear_r, ear_rx + in_ear_r, ear_ry + in_ear_r], fill=(0, 0, 0, 0))

    # Eyes
    eye_r = 2.0 * scale
    draw.ellipse([cx - 6.5 * scale - eye_r, cy - 0.5 * scale - eye_r, cx - 6.5 * scale + eye_r, cy - 0.5 * scale + eye_r], fill=(0, 0, 0, 255))
    draw.ellipse([cx + 6.5 * scale - eye_r, cy - 0.5 * scale - eye_r, cx + 6.5 * scale + eye_r, cy - 0.5 * scale + eye_r], fill=(0, 0, 0, 255))

    # Cat/bear curved mouth (w shape)
    draw.arc([cx - 3 * scale, cy + 1.5 * scale, cx, cy + 4.5 * scale], start=0, end=180, fill=(0, 0, 0, 255), width=int(1.6 * scale))
    draw.arc([cx, cy + 1.5 * scale, cx + 3 * scale, cy + 4.5 * scale], start=0, end=180, fill=(0, 0, 0, 255), width=int(1.6 * scale))

    out_44 = im.resize((44, 44), Image.Resampling.LANCZOS)
    out_22 = im.resize((22, 22), Image.Resampling.LANCZOS)
    return out_44, out_22

tray_44, tray_22 = render_chiikawa_tray_glyph()

# Save tray icon files
tray_paths = [
    (os.path.join(ASSETS_DIR, "tray.png"), tray_22),
    (os.path.join(ASSETS_DIR, "tray@2x.png"), tray_44),
    (os.path.join(ASSETS_DIR, "trayTemplate.png"), tray_22),
    (os.path.join(ASSETS_DIR, "trayTemplate@2x.png"), tray_44),
    (os.path.join(ASSETS_DIR, "tray-chiikawa.png"), tray_22),
    (os.path.join(ASSETS_DIR, "tray-chiikawa@2x.png"), tray_44),
]

for p, img in tray_paths:
    img.save(p, "PNG")
    print(f"Saved: {p} ({img.size})")

# Also generate C.ai tray variation
cai_44 = Image.new("RGBA", (44, 44), (0, 0, 0, 0))
w_glyph = 38
h_glyph = int(round(logo_cropped.height * (w_glyph / float(logo_cropped.width))))
logo_res = logo_cropped.resize((w_glyph, h_glyph), Image.Resampling.LANCZOS)
black_glyph = Image.new("RGBA", (w_glyph, h_glyph), (0, 0, 0, 0))
r, g, b, a = logo_res.split()
black_glyph.paste((0, 0, 0, 255), (0, 0), a)
cai_44.paste(black_glyph, ((44 - w_glyph) // 2, (44 - h_glyph) // 2), black_glyph)
cai_22 = cai_44.resize((22, 22), Image.Resampling.LANCZOS)

cai_44.save(os.path.join(ASSETS_DIR, "tray-cai@2x.png"), "PNG")
cai_22.save(os.path.join(ASSETS_DIR, "tray-cai.png"), "PNG")


# -------------------------------------------------------------------------
# Step 4: DMG Installer Window Background (540x380 & 1080x760 @2x)
# -------------------------------------------------------------------------
print("[4/5] Generating DMG installer window background...")

def render_dmg_background(w=1080, h=760):
    dmg = Image.new("RGBA", (w, h), (255, 255, 255, 255))
    draw = ImageDraw.Draw(dmg)

    # 1. Subtle warm background gradient
    for y in range(h):
        t = y / float(h)
        r = int(255 * (1 - t) + 247 * t)
        g = int(254 * (1 - t) + 248 * t)
        b = int(252 * (1 - t) + 252 * t)
        draw.line([(0, y), (w, y)], fill=(r, g, b, 255))

    # Soft glowing ambient background orbs
    blur_layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    bdraw = ImageDraw.Draw(blur_layer)
    bdraw.ellipse([80, 60, 480, 460], fill=(255, 226, 235, 80))
    bdraw.ellipse([600, 60, 1000, 460], fill=(230, 240, 255, 80))
    bdraw.ellipse([340, 240, 740, 520], fill=(255, 248, 232, 90))
    blur_layer = blur_layer.filter(ImageFilter.GaussianBlur(80))
    dmg = Image.alpha_composite(dmg, blur_layer)
    draw = ImageDraw.Draw(dmg)

    # Window inner border
    draw.rounded_rectangle([8, 8, w - 9, h - 9], radius=28, outline=(0, 0, 0, 18), width=2)

    # Pedestals for left (App: 280, 380) and right (Applications: 800, 380)
    pw, ph = 240, 270
    def draw_pedestal(cx, cy):
        nonlocal dmg
        x0, y0 = cx - pw // 2, cy - ph // 2
        x1, y1 = cx + pw // 2, cy + ph // 2

        shadow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        sdraw = ImageDraw.Draw(shadow)
        sdraw.rounded_rectangle([x0, y0 + 6, x1, y1 + 6], radius=36, fill=(0, 0, 0, 14))
        shadow = shadow.filter(ImageFilter.GaussianBlur(16))
        dmg = Image.alpha_composite(dmg, shadow)

        card = Image.new("RGBA", (pw, ph), (0, 0, 0, 0))
        cdraw = ImageDraw.Draw(card)
        cdraw.rounded_rectangle([0, 0, pw - 1, ph - 1], radius=36, fill=(255, 255, 255, 195), outline=(0, 0, 0, 16), width=2)
        dmg.paste(card, (x0, y0), card)

    draw_pedestal(280, 380)
    draw_pedestal(800, 380)
    draw = ImageDraw.Draw(dmg)

    # Typography
    font_title = ImageFont.truetype("/System/Library/Fonts/SFNSRounded.ttf", 48)
    font_sub = ImageFont.truetype("/System/Library/Fonts/SFNS.ttf", 21)
    font_badge = ImageFont.truetype("/System/Library/Fonts/SFNSRounded.ttf", 21)
    font_hint = ImageFont.truetype("/System/Library/Fonts/SFNS.ttf", 19)

    title_text = "Chiikawa AI (c.ai)"
    title_bbox = font_title.getbbox(title_text)
    title_w = title_bbox[2] - title_bbox[0]
    draw.text(((w - title_w) // 2, 68), title_text, fill=(30, 32, 38, 255), font=font_title)

    sub_text = "Chiikawa AI Desktop Mascot • Kéo vào Applications để cài đặt"
    sub_bbox = font_sub.getbbox(sub_text)
    sub_w = sub_bbox[2] - sub_bbox[0]
    draw.text(((w - sub_w) // 2, 134), sub_text, fill=(112, 118, 130, 255), font=font_sub)

    # Middle area (Action Pill Badge + Directional Arrow)
    badge_text = "Kéo sang Applications"
    bbox_badge = font_badge.getbbox(badge_text)
    bw = (bbox_badge[2] - bbox_badge[0]) + 38
    bh = 44
    bx0 = (w - bw) // 2
    by0 = 336

    pshadow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    pdraw = ImageDraw.Draw(pshadow)
    pdraw.rounded_rectangle([bx0, by0 + 3, bx0 + bw, by0 + bh + 3], radius=bh // 2, fill=(0, 0, 0, 15))
    pshadow = pshadow.filter(ImageFilter.GaussianBlur(8))
    dmg = Image.alpha_composite(dmg, pshadow)
    draw = ImageDraw.Draw(dmg)

    draw.rounded_rectangle([bx0, by0, bx0 + bw, by0 + bh], radius=bh // 2, fill=(255, 255, 255, 250), outline=(210, 215, 228, 255), width=2)
    draw.text((bx0 + 19, by0 + 10), badge_text, fill=(55, 60, 72, 255), font=font_badge)

    # Elegant horizontal arrow underneath
    x_start, x_end, y_arrow = 448, 632, 416
    color = (135, 150, 175, 255)
    line_w = 6
    head_sz = 22

    draw.line([(x_start, y_arrow), (x_end - head_sz + 2, y_arrow)], fill=color, width=line_w)
    r = line_w // 2
    draw.ellipse([x_start - r, y_arrow - r, x_start + r, y_arrow + r], fill=color)

    tip = (x_end, y_arrow)
    top = (x_end - head_sz, y_arrow - head_sz * 0.72)
    bot = (x_end - head_sz, y_arrow + head_sz * 0.72)
    inner = (x_end - head_sz + 3, y_arrow)
    draw.polygon([tip, top, inner, bot], fill=color)

    # Bottom Hint
    hint_text = "Mở ứng dụng từ Applications hoặc Launchpad sau khi cài đặt ♡"
    h_bbox = font_hint.getbbox(hint_text)
    hw = h_bbox[2] - h_bbox[0]
    draw.text(((w - hw) // 2, 680), hint_text, fill=(145, 150, 160, 255), font=font_hint)

    dmg_2x = dmg
    dmg_1x = dmg.resize((540, 380), Image.Resampling.LANCZOS)
    return dmg_1x, dmg_2x

dmg_1x, dmg_2x = render_dmg_background()
dmg_bg_path = os.path.join(ASSETS_DIR, "dmg-background.png")
dmg_bg2x_path = os.path.join(ASSETS_DIR, "dmg-background@2x.png")

dmg_1x.save(dmg_bg_path, "PNG")
dmg_2x.save(dmg_bg2x_path, "PNG")
print(f"Saved: {dmg_bg_path} ({dmg_1x.size})")
print(f"Saved: {dmg_bg2x_path} ({dmg_2x.size})")

print("[5/5] All visual assets generated successfully!")
