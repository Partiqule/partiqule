#!/usr/bin/env python3
"""Build the Open Graph social preview image (1200x630).

Produces frontend/public/og-image.png — the image that Instagram, Facebook,
iMessage, Twitter, Slack, etc. render as the preview thumbnail when any
partiqule.com URL is shared.

Design matches the current app UI (cream paper, warm ink, moss wordmark —
NOT the old leaf icon + saturated green scheme).

Regenerate: python3 frontend/scripts/build-og-image.py
"""
from __future__ import annotations
import os
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"

# ── Canvas ──────────────────────────────────────────────────────
W, H = 1200, 630
CREAM = (243, 237, 226)          # --cream
CREAM_LIGHT = (247, 241, 231)    # --cream-light
INK = (26, 31, 21)               # --ink
INK_SOFT = (74, 83, 66)          # --ink-soft
MOSS = (45, 90, 39)              # --moss
AMBER_WARM = (255, 230, 180)     # morning-light top tint

# ── Fonts ───────────────────────────────────────────────────────
# Lora isn't installed system-wide. Fall back to Georgia — visually
# closest serif available on macOS. The wordmark image carries the brand
# identity; the tagline is secondary.
def load_font(candidates: list[str], size: int) -> ImageFont.FreeTypeFont:
    for path in candidates:
        if os.path.exists(path):
            return ImageFont.truetype(path, size=size)
    return ImageFont.load_default()

SERIF = load_font([
    "/System/Library/Fonts/Supplemental/Georgia.ttf",
    "/Library/Fonts/Georgia.ttf",
    "/System/Library/Fonts/Times.ttc",
], size=46)

SANS_CAPS = load_font([
    "/System/Library/Fonts/Supplemental/Futura.ttc",
    "/System/Library/Fonts/HelveticaNeue.ttc",
    "/System/Library/Fonts/Helvetica.ttc",
], size=18)

# ── Compose ─────────────────────────────────────────────────────
img = Image.new("RGB", (W, H), CREAM)
draw = ImageDraw.Draw(img)

# Morning-light gradient at the top 240px — subtle warm amber wash
top_band = Image.new("RGBA", (W, 280), (0, 0, 0, 0))
tb_draw = ImageDraw.Draw(top_band)
for y in range(280):
    fade = 1 - (y / 280)
    alpha = int(80 * fade)  # max ~31% opacity at the very top
    tb_draw.line([(0, y), (W, y)], fill=(255, 230, 180, alpha))
img.paste(top_band, (0, 0), top_band)

# ── Wordmark (centered, upper-middle) ───────────────────────────
# Despite CLAUDE.md's asset inventory text, partiqule-wordmark-1080.png has
# DARK letters + green Q (verified by pixel inspection: 59k dark pixels vs
# 58k cream in the -light variant). That's the one we want on cream.
wordmark_path = PUBLIC / "partiqule-wordmark-1080.png"
if not wordmark_path.exists():
    print(f"[og-image] Wordmark not found at {wordmark_path}", file=sys.stderr)
    sys.exit(1)

wordmark = Image.open(wordmark_path).convert("RGBA")
# Target width on the 1200x630 canvas: 560px keeps breathing room
wm_target_w = 560
wm_scale = wm_target_w / wordmark.width
wm_target_h = int(wordmark.height * wm_scale)
wordmark = wordmark.resize((wm_target_w, wm_target_h), Image.LANCZOS)

# Position: horizontally centered, ~200px from the top
wm_x = (W - wm_target_w) // 2
wm_y = 195
img.paste(wordmark, (wm_x, wm_y), wordmark)

# ── Small-caps eyebrow above tagline ────────────────────────────
# Simulated with a short moss rule + all-caps DM-Sans-equivalent text
rule_y = wm_y + wm_target_h + 72
rule_w = 32
# Horizontally center the rule + eyebrow block
EYEBROW = "KNOW WHAT'S IN IT"
eyebrow_bbox = draw.textbbox((0, 0), EYEBROW, font=SANS_CAPS)
eyebrow_w = eyebrow_bbox[2] - eyebrow_bbox[0]
total_eyebrow_w = rule_w + 12 + eyebrow_w
eyebrow_x = (W - total_eyebrow_w) // 2

# Moss hairline
draw.rectangle([(eyebrow_x, rule_y + 8), (eyebrow_x + rule_w, rule_y + 10)], fill=MOSS)
# Eyebrow text (letter-spaced approximation)
draw.text((eyebrow_x + rule_w + 12, rule_y), EYEBROW, font=SANS_CAPS, fill=MOSS)

# ── Tagline (Lora fallback: Georgia) ────────────────────────
TAGLINE = "Score any product. Find the cleaner swap."
tag_bbox = draw.textbbox((0, 0), TAGLINE, font=SERIF)
tag_w = tag_bbox[2] - tag_bbox[0]
tag_x = (W - tag_w) // 2
tag_y = rule_y + 40
draw.text((tag_x, tag_y), TAGLINE, font=SERIF, fill=INK)

# ── Bottom domain stamp ─────────────────────────────────────────
DOMAIN = "PARTIQULE.COM"
dom_bbox = draw.textbbox((0, 0), DOMAIN, font=SANS_CAPS)
dom_w = dom_bbox[2] - dom_bbox[0]
dom_x = (W - dom_w) // 2
dom_y = H - 55
draw.text((dom_x, dom_y), DOMAIN, font=SANS_CAPS, fill=INK_SOFT)

# ── Subtle paper-texture overlay (optional, skipped) ────────────
# The live app uses a fractal-noise SVG overlay for paper grain. At OG
# preview sizes it's barely visible; skip for simplicity.

# ── Save ────────────────────────────────────────────────────────
out = PUBLIC / "og-image.png"
img.save(out, "PNG", optimize=True)
print(f"[og-image] Wrote {out} ({W}x{H})")
