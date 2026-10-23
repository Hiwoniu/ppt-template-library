#!/usr/bin/env python3
"""把 categories/raw 里的封面合成为统一尺寸的分类卡片。

用法：python3 scripts/build-cards.py
"""

from __future__ import annotations

import json
import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "docs", "images", "categories", "raw")
OUT = os.path.join(ROOT, "docs", "images", "categories")
CATALOG = os.path.join(ROOT, "data", "catalog.json")
MANIFEST = os.path.join(OUT, "manifest.json")

FONT_BOLD = "/System/Library/Fonts/PingFang.ttc"
W, H = 240, 150
S = 3  # 超采样倍数
PPT_EXT = {".ppt", ".pptx", ".pps", ".ppsx", ".potx", ".key"}


def font(size, bold=True):
    return ImageFont.truetype(FONT_BOLD, size * S, index=1 if bold else 0)


def count_ppt(node):
    if node["type"] == "file":
        return 1 if os.path.splitext(node["name"])[1].lower() in PPT_EXT else 0
    return sum(count_ppt(c) for c in node.get("children") or [])


def cover_crop(im: Image.Image, w: int, h: int) -> Image.Image:
    im = im.convert("RGB")
    sw, sh = im.size
    target = w / h
    if sw / sh > target:
        nw = int(sh * target)
        im = im.crop(((sw - nw) // 2, 0, (sw + nw) // 2, sh))
    else:
        nh = int(sw / target)
        im = im.crop((0, (sh - nh) // 2, sw, (sh + nh) // 2))
    return im.resize((w, h), Image.LANCZOS)


def rounded_mask(w, h, r):
    m = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=r, fill=255)
    return m


def main():
    with open(CATALOG, encoding="utf-8") as f:
        catalog = json.load(f)
    with open(MANIFEST, encoding="utf-8") as f:
        manifest = json.load(f)

    cats = catalog["tree"][0]["children"]
    counts = {i + 1: count_ppt(c) for i, c in enumerate(cats)}

    os.makedirs(OUT, exist_ok=True)
    done = 0
    for item in manifest:
        if item.get("error"):
            continue
        idx = item["index"]
        raw_path = os.path.join(RAW, item["image"])
        if not os.path.exists(raw_path):
            print("missing raw", raw_path)
            continue

        W2, H2 = W * S, H * S
        card = cover_crop(Image.open(raw_path), W2, H2)

        # 底部渐变 + 信息条
        grad = Image.new("RGBA", (W2, H2), (0, 0, 0, 0))
        gd = ImageDraw.Draw(grad)
        fade_start = int(H2 * 0.62)
        for y in range(fade_start, H2):
            t = (y - fade_start) / max(1, H2 - fade_start)
            gd.line([(0, y), (W2, y)], fill=(4, 7, 14, int(190 * (t ** 1.2))))
        strip_top = int(H2 * 0.70)
        gd.rectangle([0, strip_top, W2, H2], fill=(6, 10, 18, 214))
        card = Image.alpha_composite(card.convert("RGBA"), grad)

        d = ImageDraw.Draw(card)

        # 序号徽标
        badge = f"{idx:02d}"
        bf = font(11, False)
        bw = d.textlength(badge, font=bf)
        d.rounded_rectangle([14 * S, 14 * S, 14 * S + bw + 16 * S, 14 * S + 20 * S],
                            radius=13 * S, fill=(255, 255, 255, 215))
        d.text((14 * S + 8 * S, 14 * S + 3 * S), badge, font=bf, fill=(17, 24, 39))

        # 分类名 + 数量
        name = item["name"]
        nf = font(20, True)
        name_size = 20 * S
        while d.textlength(name, font=nf) > W2 - 34 * S and name_size > 10 * S:
            name_size -= 1 * S
            nf = ImageFont.truetype(FONT_BOLD, name_size, index=1)
        d.text((16 * S + 1 * S, H2 - 50 * S + 1 * S), name, font=nf, fill=(0, 0, 0, 160))
        d.text((16 * S, H2 - 50 * S), name, font=nf, fill="#FFFFFF")
        d.text((16 * S + 1 * S, H2 - 26 * S + 1 * S), f"{counts.get(idx, 0)} 套模板", font=font(11, False), fill=(0, 0, 0, 140))
        d.text((16 * S, H2 - 26 * S), f"{counts.get(idx, 0)} 套模板", font=font(11, False), fill="#D5DEEC")

        # 圆角 + 描边
        mask = rounded_mask(W2, H2, 18 * S)
        out = Image.new("RGBA", (W2, H2), (0, 0, 0, 0))
        out.paste(card, (0, 0), mask)
        border = ImageDraw.Draw(out)
        border.rounded_rectangle([0, 0, W2 - 1, H2 - 1], radius=18 * S,
                                 outline=(255, 255, 255, 40), width=2 * S)

        out = out.resize((W, H), Image.LANCZOS)
        out.save(os.path.join(OUT, f"c{idx:02d}.webp"), "WEBP", quality=84, method=6)
        done += 1

    print(f"生成卡片 {done} 张 → docs/images/categories/")


if __name__ == "__main__":
    main()
