"""Draw the 1200 x 630 social card (`site/assets/og.png`) from `site/data/meta.json`.

Needs Pillow only for this one-off script: `uv run --no-sync --with pillow python scripts/make_social_card.py`.
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
BG, INK, MUTED, ACCENT = "#f7f6f2", "#14130f", "#5c5a52", "#2636d8"
OK, MID, BAD, LINE = "#0b6b5f", "#a24d00", "#b3261e", "#d9d6cc"
W, H = 1200, 630


def font(size: int, bold: bool = False):
    for name in (("consolab.ttf" if bold else "consola.ttf"), "DejaVuSansMono-Bold.ttf" if bold else "DejaVuSansMono.ttf"):
        for base in ("C:/Windows/Fonts/", "/usr/share/fonts/truetype/dejavu/", ""):
            try:
                return ImageFont.truetype(base + name, size)
            except OSError:
                continue
    return ImageFont.load_default(size)


def main() -> None:
    meta = json.loads((ROOT / "site" / "data" / "meta.json").read_text(encoding="utf-8"))
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    for x in range(0, W, 24):
        d.line([(x, 0), (x, 360)], fill="#eceae3")
    for y in range(0, 360, 24):
        d.line([(0, y), (W, y)], fill="#eceae3")
    d.rectangle([0, 360, W, H], fill=BG)
    # wordmark: 3 x 3 dots, centre dot in the accent colour
    for r in range(3):
        for c in range(3):
            cx, cy = 72 + c * 16, 72 + r * 16
            on = r == 1 and c == 1
            rad = 6 if on else 3
            d.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], fill=ACCENT if on else INK)
    d.text((136, 62), "JEV FIELD TEST", font=font(26, True), fill=INK)
    d.text((72, 150), "Can Jev make", font=font(84, True), fill=INK)
    d.text((72, 246), "this decision for you?", font=font(84, True), fill=ACCENT)
    v = meta["verdicts"]
    sub = f"{meta['datasets']} datasets  ·  {meta['domains']} domains  ·  {meta['requests_total']:,} requests  ·  {meta['model']}"
    d.text((72, 376), sub, font=font(28), fill=MUTED)
    total = sum(v.values())
    x, y, bw = 72, 440, W - 144
    for key, col, label in (("A", OK, "works as-is"), ("B", MID, "cut-off or review"), ("C", BAD, "not usable zero-shot")):
        w = int(bw * v[key] / total)
        d.rectangle([x, y, x + w - 4, y + 44], fill=col)
        d.text((x + 12, y + 8), f"{v[key]}", font=font(28, True), fill="#ffffff")
        d.text((x, y + 56), label, font=font(22), fill=MUTED)
        x += w
    d.text((72, 560), "Independent and unofficial. Not affiliated with TypeSafe AI.", font=font(22), fill=MUTED)
    out = ROOT / "site" / "assets" / "og.png"
    img.save(out, optimize=True)
    print(f"wrote {out} ({out.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
