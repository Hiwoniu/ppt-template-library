# 图片资源说明

本目录的封面图来自分享页**自动生成的缩略图**（`preview_url` / `big_thumbnail`），仅用于索引展示，版权归原作者。

## 目录

| 文件 | 用途 | 基准尺寸 |
|---|---|---|
| `hero.png` | README 顶部横幅（由 4 张精选封面拼贴 + 文案合成） | 1600×560 |
| `featured-01.webp` … `featured-06.webp` | 6 套精选模板的封面 | 750×422 |
| `styles/*.png` | 「风格掠影」12 张分类代表封面 | 533×300 |

## 重新抓取

封面地址带签名、会过期，但 README 里存的是图片文件，不受影响。需要更新时：

```bash
node scripts/fetch-covers.mjs            # 精选 + 风格掠影全部刷新
node scripts/fetch-covers.mjs --only=featured
node scripts/fetch-covers.mjs --only=styles
```

脚本只请求网盘返回的缩略图地址，**不下载 pptx/jpg 原件**。

## 用真实截图替换（可选）

如果某套模板你截了实际页面，可以直接覆盖同名文件，README 无需改动：

```bash
# 精选第 1 套
cp ~/Desktop/莫兰迪.png docs/images/featured-01.webp   # 注意扩展名一致
```

建议：

- 保持 16:9（1600×900 或 750×422），避免 README 里变形；
- 单张控制在 500 KB 内；
- 若截图是 PNG，也可以改名为 `.png` 并同步修改 README 中的引用路径。

## 版权

封面图的著作权属于对应模板的作者。若你是权利人并希望移除某张图，请提交 issue，我们会删除对应文件并在 README 中去掉引用。
