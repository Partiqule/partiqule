#!/usr/bin/env python3
"""Build per-product Open Graph preview images (1200x630).

Each image shows: Partiqule wordmark, product name, score number with
natural-earth tint, verdict sentence, category stamp. Matches the current
app result-card aesthetic — cream paper, warm ink, moss accents.

Output: frontend/public/og/<slug>.png
Referenced by generate-product-pages.js via <meta property="og:image">
when the per-product file exists; falls back to /og-image.png otherwise.

Input: a manifest.json file whose shape is:
  [
    { "slug": "...", "name": "...", "score": 2, "category": "clothing",
      "subtitle": "optional secondary line, e.g. certifications" },
    ...
  ]

Run:
  python3 frontend/scripts/build-product-og-images.py <manifest.json>
"""
from __future__ import annotations
import json
import os
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
OUT_DIR = PUBLIC / "og"

# ── Canvas + tokens (mirrored from tokens.css) ──────────────────
W, H = 1200, 630
CREAM = (243, 237, 226)
CREAM_LIGHT = (247, 241, 231)
INK = (26, 31, 21)
INK_SOFT = (74, 83, 66)
INK_FAINT = (138, 144, 128)
MOSS = (45, 90, 39)

SCORE_GREEN = (107, 140, 62)
SCORE_AMBER = (196, 154, 51)
SCORE_RED = (176, 73, 58)

# Pre-blended tinted backgrounds against the cream canvas. Baked in because
# drawing onto an RGB canvas with an RGBA fill doesn't alpha-composite — PIL
# just takes the RGB bytes and ignores alpha. Values below are the visible
# result of 8-10% of the score color over cream #f3ede2.
SCORE_GREEN_BG = (229, 233, 213)
SCORE_AMBER_BG = (239, 229, 209)
SCORE_RED_BG = (238, 225, 210)

def score_color(score: int) -> tuple[int, int, int]:
    if score <= 3: return SCORE_GREEN
    if score <= 5: return SCORE_AMBER
    return SCORE_RED

def score_bg(score: int) -> tuple[int, int, int]:
    if score <= 3: return SCORE_GREEN_BG
    if score <= 5: return SCORE_AMBER_BG
    return SCORE_RED_BG

def verdict(score: int) -> str:
    if score <= 3: return "Looks good to me."
    if score <= 5: return "I'd swap if you can."
    if score <= 7: return "I'd skip if you can."
    return "Hard pass."

# ── Fonts ───────────────────────────────────────────────────────
# Lora isn't system-installed; Georgia is the closest serif available.
# DM Sans also not installed; Helvetica/Futura approximate for caps labels.
def load_font(candidates: list[str], size: int):
    for path in candidates:
        if os.path.exists(path):
            return ImageFont.truetype(path, size=size)
    return ImageFont.load_default()

def load_serif(size): return load_font([
    "/System/Library/Fonts/Supplemental/Georgia.ttf",
    "/Library/Fonts/Georgia.ttf",
    "/System/Library/Fonts/Times.ttc",
], size=size)

def load_serif_bold(size): return load_font([
    "/System/Library/Fonts/Supplemental/Georgia Bold.ttf",
    "/Library/Fonts/Georgia Bold.ttf",
    "/System/Library/Fonts/Supplemental/Georgia.ttf",
], size=size)

def load_sans(size): return load_font([
    "/System/Library/Fonts/HelveticaNeue.ttc",
    "/System/Library/Fonts/Helvetica.ttc",
], size=size)

# ── Wordmark (cached at module load) ────────────────────────────
_wordmark_cache = None
def wordmark(target_width: int) -> Image.Image:
    global _wordmark_cache
    path = PUBLIC / "partiqule-wordmark-1080.png"
    if _wordmark_cache is None:
        _wordmark_cache = Image.open(path).convert("RGBA")
    w = _wordmark_cache.copy()
    scale = target_width / w.width
    return w.resize((target_width, int(w.height * scale)), Image.LANCZOS)

# ── Wrap a name onto up to N lines with a given serif size ──────
def wrap_lines(draw: ImageDraw.ImageDraw, text: str, font, max_width: int, max_lines: int = 2) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        test = (current + " " + word).strip()
        bbox = draw.textbbox((0, 0), test, font=font)
        if bbox[2] - bbox[0] <= max_width:
            current = test
        else:
            if current:
                lines.append(current)
            current = word
            if len(lines) == max_lines:
                break
    if current and len(lines) < max_lines:
        lines.append(current)
    # Truncate last line with ellipsis if we ran out of lines
    if len(lines) == max_lines and len(" ".join(lines).split()) < len(words):
        last = lines[-1]
        while last and draw.textbbox((0, 0), last + "…", font=font)[2] > max_width:
            last = last.rsplit(" ", 1)[0] if " " in last else last[:-1]
        lines[-1] = (last + "…") if last else "…"
    return lines

# ── Rounded rect with optional alpha fill ───────────────────────
def rounded_rect(canvas: Image.Image, xy, radius: int, fill):
    # PIL's rectangle(radius=) requires Pillow ≥ 8.2. Safe on modern systems.
    ImageDraw.Draw(canvas).rounded_rectangle(xy, radius=radius, fill=fill)

# ── Main compose function ───────────────────────────────────────
def compose(product: dict) -> Image.Image:
    name = product["name"]
    score = int(product["score"])
    category = product.get("category") or "product"
    subtitle = product.get("subtitle") or ""

    img = Image.new("RGB", (W, H), CREAM)
    draw = ImageDraw.Draw(img, "RGBA")

    # Morning-light warm gradient at top ───────────────────────
    top_band = Image.new("RGBA", (W, 320), (0, 0, 0, 0))
    tb_draw = ImageDraw.Draw(top_band)
    for y in range(320):
        fade = 1 - (y / 320)
        alpha = int(72 * fade)
        tb_draw.line([(0, y), (W, y)], fill=(255, 230, 180, alpha))
    img.paste(top_band, (0, 0), top_band)

    # Top-left: Partiqule wordmark (180px wide) ────────────────
    wm = wordmark(180)
    img.paste(wm, (72, 64), wm)

    # Bottom domain stamp ─────────────────────────────────────
    sans18 = load_sans(18)
    dom = "PARTIQULE.COM"
    dbox = draw.textbbox((0, 0), dom, font=sans18)
    draw.text((W - (dbox[2] - dbox[0]) - 72, H - 54), dom, font=sans18, fill=INK_SOFT)

    # Category stamp (top-right) ───────────────────────────────
    sans20 = load_sans(20)
    cat_label = category.replace("_", " ").upper()
    cb = draw.textbbox((0, 0), cat_label, font=sans20)
    draw.text((W - (cb[2] - cb[0]) - 72, 76), cat_label, font=sans20, fill=MOSS)
    # Hairline rule to the left of the category label
    cat_x = W - (cb[2] - cb[0]) - 72
    draw.rectangle([(cat_x - 32, 86), (cat_x - 10, 88)], fill=MOSS)

    # ── Left block: product name + verdict + subtitle ──────────
    left_x = 72
    name_top = 200
    text_max_w = 680  # leave room for the score box on the right

    # Product name in Lora-ish serif, up to 2 lines
    name_font = load_serif(60)
    lines = wrap_lines(draw, name, name_font, text_max_w, max_lines=2)
    # If the name overflows to a truncated 2nd line, shrink the font once
    if len(" ".join(lines).split()) < len(name.split()):
        name_font = load_serif(52)
        lines = wrap_lines(draw, name, name_font, text_max_w, max_lines=2)
    for i, line in enumerate(lines):
        draw.text((left_x, name_top + i * 72), line, font=name_font, fill=INK)

    # Verdict directly below the name
    verdict_top = name_top + len(lines) * 72 + 16
    verdict_font = load_serif(36)
    draw.text((left_x, verdict_top), verdict(score), font=verdict_font, fill=INK_SOFT)

    # Subtitle (e.g. "GOTS certified · OEKO-TEX Standard 100")
    if subtitle:
        sub_top = verdict_top + 62
        sub_font = load_sans(22)
        draw.text((left_x, sub_top), subtitle, font=sub_font, fill=INK_FAINT)

    # ── Right block: score badge ───────────────────────────────
    # Rounded rect is drawn on the RGB canvas directly (opaque color from the
    # pre-blended palette). Score number uses anchor="mm" for centering —
    # eliminates the bbox math and handles ascender slack cleanly.
    box_w, box_h = 280, 280
    box_x = W - box_w - 96
    box_y = (H - box_h) // 2 - 20
    rounded_rect(img, (box_x, box_y, box_x + box_w, box_y + box_h), radius=36, fill=score_bg(score))

    # Score number — centered inside the box via "mm" anchor
    score_font = load_serif_bold(200)
    score_cx = box_x + box_w // 2
    score_cy = box_y + box_h // 2 - 10
    draw.text((score_cx, score_cy), str(score), font=score_font, fill=score_color(score), anchor="mm")

    # "out of 10" suffix, horizontally centered via anchor="mm"
    out_font = load_sans(22)
    draw.text((score_cx, box_y + box_h - 30), "out of 10", font=out_font, fill=score_color(score), anchor="mm")

    return img


def main(manifest_path: str) -> int:
    manifest = json.loads(Path(manifest_path).read_text())
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for product in manifest:
        slug = product["slug"]
        img = compose(product)
        out = OUT_DIR / f"{slug}.png"
        img.save(out, "PNG", optimize=True)
        print(f"[og-product] {out.relative_to(ROOT)}  ({product['name']}, score {product['score']})")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: build-product-og-images.py <manifest.json>", file=sys.stderr)
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
