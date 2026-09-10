from __future__ import annotations

import html
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFont


ROOT = Path(__file__).resolve().parent.parent
SONGS = ROOT / "songs"
OUTPUT = ROOT / "assets" / "seo" / "songs"
BACKGROUND = ROOT / "assets" / "seo" / "bloody-hopes-remembrance-1200x630.jpg"
SERIF_BOLD = Path("C:/Windows/Fonts/georgiab.ttf")
SANS_BOLD = Path("C:/Windows/Fonts/arialbd.ttf")
SANS = Path("C:/Windows/Fonts/arial.ttf")


def text_content(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", html.unescape(value))).strip()


def match_text(source: str, pattern: str, fallback: str = "") -> str:
    match = re.search(pattern, source, re.I | re.S)
    return text_content(match.group(1)) if match else fallback


def fit_font(draw: ImageDraw.ImageDraw, text: str, font_path: Path, maximum: int, minimum: int, width: int) -> ImageFont.FreeTypeFont:
    for size in range(maximum, minimum - 1, -2):
        font = ImageFont.truetype(str(font_path), size)
        if draw.textbbox((0, 0), text, font=font)[2] <= width:
            return font
    return ImageFont.truetype(str(font_path), minimum)


def wrap(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if current and draw.textbbox((0, 0), candidate, font=font)[2] > width:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


def build_card(song_file: Path) -> None:
    source = song_file.read_text(encoding="utf-8")
    title = match_text(source, r"<h1[^>]*>([\s\S]*?)</h1>", song_file.stem.replace("-", " ").title())
    era = match_text(source, r'<span\s+class="eyebrow"[^>]*>([\s\S]*?)</span>', "Historical war ballad")
    lede = match_text(source, r'<p\s+class="lede"[^>]*>([\s\S]*?)</p>', "Lyrics, context and documented sources")

    image = Image.open(BACKGROUND).convert("RGB").resize((1200, 630), Image.Resampling.LANCZOS)
    image = ImageEnhance.Brightness(image).enhance(0.62)
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    gradient = ImageDraw.Draw(overlay)
    for x in range(1200):
        alpha = int(210 - (130 * x / 1200))
        gradient.line((x, 0, x, 630), fill=(7, 5, 4, max(alpha, 70)))
    gradient.rectangle((0, 0, 1200, 630), outline=(119, 30, 26, 115), width=10)
    image = Image.alpha_composite(image.convert("RGBA"), overlay)
    draw = ImageDraw.Draw(image)

    gold = (224, 181, 91, 255)
    paper = (245, 239, 229, 255)
    muted = (210, 199, 184, 255)
    red = (157, 49, 43, 255)

    label_font = ImageFont.truetype(str(SANS_BOLD), 23)
    era_font = fit_font(draw, era.upper(), SANS_BOLD, 25, 18, 850)
    title_font = ImageFont.truetype(str(SERIF_BOLD), 66)
    title_lines = wrap(draw, title, title_font, 830)
    if len(title_lines) > 3:
        title_font = ImageFont.truetype(str(SERIF_BOLD), 56)
        title_lines = wrap(draw, title, title_font, 830)
    lede_font = ImageFont.truetype(str(SANS), 26)
    lede_lines = wrap(draw, lede, lede_font, 760)[:2]

    draw.rectangle((76, 63, 82, 118), fill=red)
    draw.text((105, 62), "BLOODY HOPES", font=label_font, fill=paper)
    draw.text((105, 102), era.upper(), font=era_font, fill=gold)

    y = 182
    for line in title_lines:
        draw.text((76, y), line, font=title_font, fill=paper, stroke_width=1, stroke_fill=(0, 0, 0, 180))
        y += 78
    y += 16
    for line in lede_lines:
        draw.text((78, y), line, font=lede_font, fill=muted)
        y += 36

    draw.line((76, 552, 1124, 552), fill=(196, 168, 124, 130), width=2)
    draw.text((76, 570), "HISTORICAL BALLAD  ·  LYRICS  ·  CONTEXT  ·  SOURCES", font=ImageFont.truetype(str(SANS_BOLD), 18), fill=gold)
    draw.text((1005, 568), "BH", font=ImageFont.truetype(str(SERIF_BOLD), 25), fill=paper)

    OUTPUT.mkdir(parents=True, exist_ok=True)
    image.convert("RGB").save(OUTPUT / f"{song_file.stem}-1200x630.jpg", quality=91, optimize=True, progressive=True)


for path in sorted(SONGS.glob("*.html")):
    build_card(path)

print(f"Built {len(list(SONGS.glob('*.html')))} song Open Graph cards in {OUTPUT}.")
