#!/usr/bin/env python3
"""由 data/catalog.json 重新生成站点文件，并把 README 里的旧链接迁移到新分享。

生成：
  - docs/categories.md  52 行文字版分类表
  - docs/gallery.html   可搜索的可视化分类墙

迁移：
  - README.md / DISCLAIMER.md 中的分享链接按“分类路径”映射到新分享的 fid
"""

from __future__ import annotations

import json
import os
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CATALOG = os.path.join(ROOT, "data", "catalog.json")
README = os.path.join(ROOT, "README.md")
DISCLAIMER = os.path.join(ROOT, "DISCLAIMER.md")
GALLERY = os.path.join(ROOT, "docs", "gallery.html")
CATEGORIES_MD = os.path.join(ROOT, "docs", "categories.md")

PPT_EXT = {".ppt", ".pptx", ".pps", ".ppsx", ".potx", ".key"}


def count_ppt(node):
    if node["type"] == "file":
        return 1 if os.path.splitext(node["name"])[1].lower() in PPT_EXT else 0
    return sum(count_ppt(c) for c in node.get("children") or [])


def walk(node, path=()):
    yield node, path
    for child in node.get("children") or []:
        yield from walk(child, path + (child["name"],))


def fid_map(old_tree, new_tree):
    old_by_path = {p: n["fid"] for n, p in walk(old_tree) if n["type"] == "dir"}
    new_by_path = {p: n["fid"] for n, p in walk(new_tree) if n["type"] == "dir"}
    mapping = {old_by_path[p]: new_by_path[p] for p in old_by_path if p in new_by_path}
    return mapping


def main():
    catalog = json.load(open(CATALOG, encoding="utf-8"))
    share = catalog["source"]["shareUrl"]
    cats = catalog["tree"][0]["children"]

    # 旧目录（git HEAD）
    try:
        old_raw = subprocess.check_output(
            ["git", "show", "HEAD:data/catalog.json"], cwd=ROOT
        )
        old_catalog = json.loads(old_raw)
        old_share = old_catalog["source"]["shareUrl"]
        mapping = fid_map(old_catalog["tree"][0], catalog["tree"][0])
    except Exception as exc:  # 首次运行时没有历史版本
        print("跳过链接迁移：", exc)
        old_share, mapping = None, {}

    def migrate(text):
        if not old_share:
            return text
        for old_fid, new_fid in mapping.items():
            text = text.replace(f"{old_share}#/list/share/{old_fid}", f"{share}#/list/share/{new_fid}")
        text = text.replace(old_share, share)
        return text

    # README / DISCLAIMER
    for path in (README, DISCLAIMER):
        src = open(path, encoding="utf-8").read()
        out = migrate(src)
        if out != src:
            open(path, "w", encoding="utf-8").write(out)
            print("已迁移", os.path.relpath(path, ROOT))

    # 文字版分类表
    lines = ["# 分类总表", "", "共 52 个分类，点击分类名直达对应目录。", "",
             "| # | 分类 | PPT 模板 | 直达 |", "|---|------|---------:|:----:|"]
    for i, cat in enumerate(cats, 1):
        lines.append(f"| {i} | {cat['name']} | {count_ppt(cat)} | [打开]({share}#/list/share/{cat['fid']}) |")
    lines.append("")
    open(CATEGORIES_MD, "w", encoding="utf-8").write("\n".join(lines))
    print("生成 docs/categories.md")

    # 可视化浏览页
    cards = []
    for i, cat in enumerate(cats, 1):
        cards.append(
            f'<a class="card" href="{share}#/list/share/{cat["fid"]}" target="_blank" rel="noreferrer" data-name="{cat["name"]}">'
            f'<img loading="lazy" src="images/categories/c{i:02d}.webp" alt="{cat["name"]}">'
            f'<span class="meta"><b>{cat["name"]}</b><em>{count_ppt(cat)} 套</em></span></a>'
        )
    template = open(GALLERY, encoding="utf-8").read()
    start = template.index('<main class="grid" id="grid">') + len('<main class="grid" id="grid">')
    end = template.index("</main>", start)
    template = template[:start] + "\n    " + "".join(cards) + "\n  " + template[end:]
    open(GALLERY, "w", encoding="utf-8").write(template)
    print("生成 docs/gallery.html")


if __name__ == "__main__":
    main()
