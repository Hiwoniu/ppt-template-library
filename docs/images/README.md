# 截图占位说明

README 里 6 张精选模板图目前是**占位图**（1600×900 灰底 + 说明文字）。等真实截图到位后，直接覆盖同名文件即可，**不需要改 README**。

## 替换方法

| 序号 | 文件 | 对应模板 |
|---|---|---|
| 01 | `featured-01.png` | 09莫兰迪 / 莫兰迪工作总结.pptx |
| 02 | `featured-02.png` | 8-中国风格 / 中国风格(01).pptx |
| 03 | `featured-03.png` | 01高端PPT / 白金极简工作汇报年中工作总结PPT模板宣传PPT动态PPT.pptx |
| 04 | `featured-04.png` | 15-年会颁奖 / 年会颁奖盛典晚会 (1).pptx |
| 05 | `featured-05.png` | 30-扁平风格 / 扁平风格(1).ppt |
| 06 | `featured-06.png` | 17-快闪PPT模板-竖版03 / 【模板1】模仿苹果107秒制作的137秒快闪PPT模板.pptx |

```bash
# 例：把截屏覆盖到 01
cp ~/Desktop/莫兰迪.png docs/images/featured-01.png
```

## 规格建议

- 尺寸：**1600×900**（16:9），与占位图一致，README 里不会变形；
- 内容：优先截**封面页**；想展示版式可拼 2–4 页（横向 2×2）；
- 格式：PNG（截图导出的 JPG 也可以，但文件名必须保持 `.png`，否则要改 README 路径）；
- 体积：单张控制在 500 KB 以内，避免仓库变大。

替换完成后执行：

```bash
git add docs/images
git commit -m "docs: 补充精选模板截图"
```
