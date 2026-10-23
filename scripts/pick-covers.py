#!/usr/bin/env python3
"""为过暗的分类封面换一张更亮的模板截图。

用法：python3 scripts/pick-covers.py [--threshold 60]
"""

from __future__ import annotations

import json
import os
import sys
import urllib.parse
import urllib.request

from PIL import Image, ImageStat

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "docs", "images", "categories", "raw")
MANIFEST = os.path.join(ROOT, "docs", "images", "categories", "manifest.json")
CATALOG = os.path.join(ROOT, "data", "catalog.json")

PWD_ID = "180767425d31"
API = "https://drive-h.quark.cn/1/clouddrive/share/sharepage"
PPT_EXT = (".ppt", ".pptx", ".pps", ".ppsx", ".potx", ".key")
CANDIDATES = 6


def get_stoken() -> str:
    req = urllib.request.Request(
        f"{API}/token?pr=ucpro&fr=pc",
        data=json.dumps({"pwd_id": PWD_ID, "passcode": ""}).encode(),
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as r:
        return json.load(r)["data"]["stoken"]


def list_dir(stoken: str, fid: str) -> list[dict]:
    out = []
    for page in range(1, 8):
        q = urllib.parse.urlencode({
            "pr": "ucpro", "fr": "pc", "ver": "2", "pwd_id": PWD_ID,
            "stoken": stoken, "pdir_fid": fid, "force": "0",
            "_page": page, "_size": 100, "_fetch_total": 1,
            "_fetch_banner": 0, "_fetch_share": 0, "fetch_relate_conversation": 0,
        })
        with urllib.request.urlopen(f"{API}/detail?{q}") as r:
            data = json.load(r)
        items = (data.get("data") or {}).get("list") or []
        out.extend(items)
        if len(items) < 100:
            break
    return out


def brightness(im: Image.Image) -> float:
    return ImageStat.Stat(im.convert("L").resize((60, 34))).mean[0]


def candidates(node, stoken, depth=0):
    items = list_dir(stoken, node["fid"])
    hits = [i for i in items if i["file_name"].lower().endswith(PPT_EXT) and (i.get("preview_url") or i.get("big_thumbnail"))]
    if hits or depth >= 2:
        return hits
    for child in [i for i in items if i.get("dir")]:
        got = candidates(child, stoken, depth + 1)
        if got:
            return got
    return []


def main():
    threshold = 60.0
    if "--threshold" in sys.argv:
        threshold = float(sys.argv[sys.argv.index("--threshold") + 1])

    catalog = json.load(open(CATALOG, encoding="utf-8"))
    manifest = json.load(open(MANIFEST, encoding="utf-8"))
    cats = catalog["tree"][0]["children"]
    stoken = get_stoken()

    changed = 0
    for item in manifest:
        if item.get("error"):
            continue
        idx = item["index"]
        raw_path = os.path.join(RAW, item["image"])
        if not os.path.exists(raw_path):
            continue
        if brightness(Image.open(raw_path)) >= threshold:
            continue

        cat = cats[idx - 1]
        files = candidates(cat, stoken)
        if not files:
            continue

        best, best_img, best_bytes = None, None, None
        for f in files[:CANDIDATES]:
            url = f.get("preview_url") or f.get("big_thumbnail")
            try:
                req = urllib.request.Request(url, headers={"user-agent": "Mozilla/5.0", "referer": "https://pan.quark.cn/"})
                with urllib.request.urlopen(req) as r:
                    blob = r.read()
                    ext = "webp" if "webp" in (r.headers.get("content-type") or "") else "png"
                im = Image.open(__import__("io").BytesIO(blob))
                score = brightness(im)
                if best is None or score > best:
                    best, best_img, best_bytes, best_ext, best_file = score, im, blob, ext, f["file_name"]
            except Exception:
                continue

        if best_bytes is None or best <= brightness(Image.open(raw_path)):
            continue

        new_name = f"c{idx:02d}.{best_ext}"
        old_path = os.path.join(RAW, item["image"])
        new_path = os.path.join(RAW, new_name)
        with open(new_path, "wb") as fh:
            fh.write(best_bytes)
        if new_path != old_path and os.path.exists(old_path):
            os.remove(old_path)
        item["image"] = new_name
        item["samples"] = best_file
        item["brightness"] = round(best, 1)
        changed += 1
        print(f"✓ {idx:02d} {item['name']}: {best_file} (亮度 {best:.0f})")

    json.dump(manifest, open(MANIFEST, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"换图 {changed} 个")


if __name__ == "__main__":
    main()
