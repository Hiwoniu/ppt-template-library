#!/usr/bin/env node
/**
 * build-docs.mjs — 由 data/catalog.json 生成 docs/CATALOG.md
 *
 * 用法：
 *   node scripts/build-docs.mjs            # 生成 docs/CATALOG.md
 *   node scripts/build-docs.mjs --table    # 打印「分类总表」Markdown，供 README 使用
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = join(ROOT, 'data', 'catalog.json');
const OUT = join(ROOT, 'docs', 'CATALOG.md');

const SHARE_BASE = 'https://pan.quark.cn/s';
const PPT_EXT = new Set(['ppt', 'pptx', 'pps', 'ppsx', 'potx', 'key']);

const catalog = JSON.parse(await readFile(CATALOG, 'utf8'));
const { shareUrl, pwdId, title, owner, totalFiles, totalDirs, totalBytes, crawledAt } = catalog.source;
const root = catalog.tree[0];

const folderUrl = (fid) => `${SHARE_BASE}/${pwdId}#/list/share/${fid}`;
const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escLink = (s) => String(s).replace(/\)/g, '%29').replace(/\(/g, '%28').replace(/ /g, '%20');
const fmtSize = (b) => {
  if (!b) return '—';
  const mb = b / 1024 / 1024;
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(b / 1024))} KB`;
};

const isPpt = (n) => n.type === 'file' && PPT_EXT.has(n.ext || '');
const pptOf = (node) => {
  const out = [];
  const walk = (n) => {
    if (n.type === 'file') {
      if (isPpt(n)) out.push(n);
      return;
    }
    for (const c of n.children || []) walk(c);
  };
  walk(node);
  return out;
};
const imgCount = (node) => {
  let n = 0;
  const walk = (x) => {
    if (x.type === 'file') {
      if (!isPpt(x)) n++;
      return;
    }
    for (const c of x.children || []) walk(c);
  };
  walk(node);
  return n;
};

if (process.argv.includes('--table')) {
  const rows = root.children.map((cat, i) => {
    const ppt = pptOf(cat).length;
    return `| ${i + 1} | [${esc(cat.name)}](${folderUrl(cat.fid)}) | ${ppt} |`;
  });
  console.log(`| # | 分类 | PPT 模板 |\n|---|------|---------:|\n${rows.join('\n')}`);
  process.exit(0);
}

function renderDir(dir, depth) {
  const pad = '  '.repeat(depth);
  const lines = [];
  const pptFiles = (dir.children || []).filter((c) => c.type === 'file' && isPpt(c));
  const otherFiles = (dir.children || []).filter((c) => c.type === 'file' && !isPpt(c));
  const subdirs = (dir.children || []).filter((c) => c.type === 'dir');

  if (pptFiles.length) {
    lines.push(`${pad}| # | 模板文件 | 大小 | 修改时间 |`, `${pad}|---|----------|-----:|----------|`);
    pptFiles.forEach((f, i) => {
      const date = f.updatedAt ? f.updatedAt.slice(0, 10) : '—';
      lines.push(`${pad}| ${i + 1} | ${esc(f.name)} | ${fmtSize(f.sizeBytes)} | ${date} |`);
    });
    lines.push('');
  }

  if (otherFiles.length) {
    lines.push(`${pad}> 同目录另有 ${otherFiles.length} 个非 PPT 文件（封面图、说明等），见 \`data/catalog.json\`。`, '');
  }

  for (const sub of subdirs) {
    const nestedPpt = pptOf(sub).length;
    const nestedImg = imgCount(sub);
    lines.push(
      `${pad}<details>`,
      `${pad}<summary>📁 ${esc(sub.name)} — ${nestedPpt} 个模板 / ${nestedImg} 张图 · <a href="${folderUrl(sub.fid)}">在夸克打开</a></summary>`,
      '',
    );
    lines.push(renderDir(sub, depth));
    lines.push(`${pad}</details>`, '');
  }
  return lines.join('\n');
}

const toc = root.children.map((c, i) => `${i + 1}. [${esc(c.name)}](#${i + 1}-${esc(c.name).replace(/[\s/]+/g, '-').toLowerCase()})`);

const header = `# 完整目录

> 由 \`scripts/build-docs.mjs\` 依据 \`data/catalog.json\` 自动生成，请勿手工修改。
>
> 来源：[${esc(title)}](${shareUrl})（分享者：${esc(owner ?? '未知')}） · 抓取时间：${crawledAt}
>
> 统计：**${root.children.length} 个分类**、**${totalFiles} 个文件**（其中 PPT ${pptOf(root).length} 个）、${totalDirs} 个目录、${(totalBytes / 1024 ** 3).toFixed(1)} GB。
>
> 说明：本页只列出**PPT 模板文件**；封面图与其他文件请见 [data/catalog.json](../data/catalog.json)。所有链接均指向夸克分享页，仓库不存储、不分发任何文件。

## 分类索引

${toc.join('\n')}

---
`;

const body = root.children
  .map((cat, i) => {
    const ppt = pptOf(cat);
    const imgs = imgCount(cat);
    return `## ${i + 1}. ${esc(cat.name)}

**${ppt.length} 个 PPT 模板** · 共 ${cat.childCount ?? '?'} 个条目${imgs ? ` · ${imgs} 张封面/图片` : ''} · [在夸克打开该分类](${folderUrl(cat.fid)})

${renderDir(cat, 0)}
`;
  })
  .join('\n---\n\n');

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, `${header}\n${body}`, 'utf8');

const pptTotal = pptOf(root).length;
console.log(`生成 ${OUT}`);
console.log(`分类 ${root.children.length} · 文件 ${totalFiles} · PPT ${pptTotal} · ${(totalBytes / 1024 ** 3).toFixed(1)} GB`);
