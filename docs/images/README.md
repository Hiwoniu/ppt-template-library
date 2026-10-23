# 图片资源说明

本目录的封面图来自分享页**自动生成的缩略图**（`preview_url` / `big_thumbnail`），仅用于索引展示，版权归原作者。

## 目录

| 路径 | 用途 | 尺寸 |
|---|---|---|
| `hero.png` | README 顶部横幅（6 张精选封面错落拼贴 + 文案） | 1600×620 |
| `featured-01.webp` … `featured-06.webp` | 精选六套的封面 | 750×422 |
| `styles/*.webp` | 「风格掠影」12 张分类代表封面 | 750×422 |
| `categories/c01.webp` … `c52.webp` | 「分类墙」52 张卡片（封面 + 名称 + 数量） | 480×300 |
| `categories/manifest.json` | 卡片清单：序号、分类名、fid、取样文件 | — |
| `categories/raw/` | 原始缩略图（中间产物，已 gitignore） | — |

## 重新生成

```bash
# 1. 抓取：精选 + 风格
node scripts/fetch-covers.mjs
# 2. 抓取：52 个分类（写入 categories/raw/）
node scripts/fetch-covers.mjs --all
# 3. 合成卡片（需要 Pillow）
python3 scripts/build-cards.py
```

脚本只请求分享页返回的缩略图地址，**不下载 pptx/jpg 原件**。

## 用真实截图替换（可选）

截图后直接覆盖同名文件即可，README 无需改动：

```bash
cp ~/Desktop/莫兰迪.webp docs/images/featured-01.webp
```

建议：

- 保持 16:9，精选建议 750×422、卡片建议 480×300；
- 单张控制在 200 KB 内；
- 若换成 `.png`，需要同步改 README 里的引用路径。

## 版权

封面图的著作权属于对应模板的作者。若你是权利人并希望移除某张图，请提交 issue，我们会删除对应文件并在 README 中去掉引用。
