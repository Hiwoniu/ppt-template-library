#!/usr/bin/env node
/**
 * fetch-covers.mjs — 从分享页自带的封面预览地址取图，保存到 docs/images/
 *
 * 说明：
 *  - 只请求分享详情接口返回的 `preview_url` / `big_thumbnail`（网盘自己生成的缩略图），
 *    不下载任何原始 pptx / jpg 文件。
 *  - 缩略图地址带签名，几小时后过期，因此每次运行都会重新解析。
 *  - 失败时保留已有图片，不影响 README。
 *
 * 用法：
 *   node scripts/fetch-covers.mjs            # 全部（精选 + 风格掠影）
 *   node scripts/fetch-covers.mjs --only=featured
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = join(ROOT, 'data', 'catalog.json');
const IMG_DIR = join(ROOT, 'docs', 'images');
const STYLE_DIR = join(IMG_DIR, 'styles');
const CAT_DIR = join(IMG_DIR, 'categories', 'raw');

const PWD_ID = '180767425d31';
const API = 'https://drive-h.quark.cn/1/clouddrive/share/sharepage';

/** 精选：6 套，写 featured-0X.* */
const FEATURED = [
  { out: 'featured-01', cat: '09莫兰迪', file: '莫兰迪工作总结.pptx' },
  { out: 'featured-02', cat: '8-中国风格', file: '中国风格(01).pptx' },
  { out: 'featured-03', cat: '01高端PPT', file: '白金极简工作汇报年中工作总结PPT模板宣传PPT动态PPT.pptx' },
  { out: 'featured-04', cat: '15-年会颁奖', file: '年会颁奖盛典晚会 (1).pptx' },
  { out: 'featured-05', cat: '30-扁平风格', file: '扁平风格(1).ppt' },
  { out: 'featured-06', cat: '17-快闪PPT模板-竖版03', file: '【模板1】模仿苹果107秒制作的137秒快闪PPT模板.pptx' },
];

/** 风格掠影：每个分类取第一套带封面的模板，写 styles/<slug>.png */
const STYLES = [
  { slug: 'minimal', cat: '0极简简约' },
  { slug: 'business', cat: '05商务' },
  { slug: 'thesis', cat: '03毕业答辩' },
  { slug: 'teaching', cat: '06教学课件' },
  { slug: 'resume', cat: '26-个人简历' },
  { slug: 'literary', cat: '9-文艺风格' },
  { slug: 'guochao', cat: '24国潮' },
  { slug: 'tech', cat: '11科技' },
  { slug: 'flash', cat: '19快闪' },
  { slug: 'wedding', cat: '15婚庆爱情' },
  { slug: 'roadshow', cat: '16-路演金融' },
  { slug: 'cartoon', cat: '16卡通' },
];

const PPT_EXT = /\.(pptx?|ppsx?|key)$/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getStoken() {
  const res = await fetch(`${API}/token?pr=ucpro&fr=pc`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pwd_id: PWD_ID, passcode: '' }),
  });
  const json = await res.json();
  if (json.code !== 0) throw new Error(`token 失败: ${json.message}`);
  return json.data.stoken;
}

async function listAll(stoken, pdirFid) {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const params = new URLSearchParams({
      pr: 'ucpro', fr: 'pc', ver: '2', pwd_id: PWD_ID, stoken, pdir_fid: pdirFid,
      force: '0', _page: String(page), _size: '100', _fetch_total: '1',
      _fetch_banner: '0', _fetch_share: '0', fetch_relate_conversation: '0',
    });
    const res = await fetch(`${API}/detail?${params}`);
    const json = await res.json();
    if (json.code !== 0) throw new Error(`detail 失败: ${json.message}`);
    const list = json.data?.list || [];
    out.push(...list);
    if (list.length < 100) break;
  }
  return out;
}

function extOf(url, contentType) {
  if (/webp/i.test(contentType || '')) return 'webp';
  if (/jpe?g/i.test(contentType || '')) return 'jpg';
  if (/png/i.test(contentType || '')) return 'png';
  const m = String(url).match(/\.(webp|png|jpe?g)(?:\?|$)/i);
  return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'png';
}

async function download(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0', referer: 'https://pan.quark.cn/' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return { buf, ext: extOf(url, res.headers.get('content-type')) };
}

async function main() {
  const only = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1];
  const all = process.argv.includes('--all');
  const catalog = JSON.parse(await readFile(CATALOG, 'utf8'));
  const top = catalog.tree[0];
  const byName = new Map(top.children.map((c) => [c.name, c]));

  const stoken = await getStoken();
  const cache = new Map(); // cat name -> entries
  const listCat = async (name) => {
    if (cache.has(name)) return cache.get(name);
    const node = byName.get(name);
    if (!node) throw new Error(`分类不存在: ${name}`);
    const entries = await listAll(stoken, node.fid);
    cache.set(name, entries);
    return entries;
  };

  const results = [];

  if (!all && only !== 'styles') {
    await mkdir(IMG_DIR, { recursive: true });
    for (const item of FEATURED) {
      try {
        const entries = await listCat(item.cat);
        const entry = entries.find((e) => e.file_name === item.file);
        if (!entry) throw new Error('文件未找到');
        const url = entry.preview_url || entry.big_thumbnail;
        if (!url) throw new Error('无封面地址');
        const { buf, ext } = await download(url);
        const out = join(IMG_DIR, `${item.out}.${ext}`);
        await writeFile(out, buf);
        results.push({ kind: 'featured', out: `${item.out}.${ext}`, size: buf.length });
      } catch (err) {
        results.push({ kind: 'featured', out: item.out, error: String(err.message || err) });
      }
      await sleep(150);
    }
  }

  if (!all && only !== 'featured') {
    await mkdir(STYLE_DIR, { recursive: true });
    for (const item of STYLES) {
      try {
        const entries = await listCat(item.cat);
        const entry = entries.find((e) => PPT_EXT.test(e.file_name) && (e.big_thumbnail || e.preview_url));
        if (!entry) throw new Error('该分类没有可用封面');
        const url = entry.preview_url || entry.big_thumbnail;
        const { buf, ext } = await download(url);
        const out = join(STYLE_DIR, `${item.slug}.${ext}`);
        await writeFile(out, buf);
        results.push({ kind: 'style', out: `styles/${item.slug}.${ext}`, file: entry.file_name, size: buf.length });
      } catch (err) {
        results.push({ kind: 'style', out: item.slug, error: String(err.message || err) });
      }
      await sleep(150);
    }
  }

  // 全部分类：每个顶层分类取一张代表封面，落盘到 categories/raw/cNN.webp
  if (all) {
    await mkdir(CAT_DIR, { recursive: true });
    const manifest = [];
    const cats = top.children;

    const findCover = async (node, depth = 0) => {
      const entries = await listAll(stoken, node.fid);
      const hit = entries.find((e) => PPT_EXT.test(e.file_name) && (e.preview_url || e.big_thumbnail));
      if (hit) return hit;
      if (depth >= 3) return null;
      for (const child of entries.filter((e) => e.dir)) {
        const deeper = await findCover(child, depth + 1);
        if (deeper) return deeper;
      }
      return null;
    };

    for (let i = 0; i < cats.length; i++) {
      const cat = cats[i];
      const idx = String(i + 1).padStart(2, '0');
      try {
        const entry = await findCover(cat);
        if (!entry) throw new Error('未找到带封面的模板');
        const url = entry.big_thumbnail || entry.preview_url;
        const { buf, ext } = await download(url);
        const file = `c${idx}.${ext}`;
        await writeFile(join(CAT_DIR, file), buf);
        manifest.push({ index: i + 1, name: cat.name, fid: cat.fid, samples: entry.file_name, image: file });
        results.push({ kind: 'cat', out: `categories/raw/${file}`, file: entry.file_name, size: buf.length });
      } catch (err) {
        manifest.push({ index: i + 1, name: cat.name, fid: cat.fid, error: String(err.message || err) });
        results.push({ kind: 'cat', out: `categories/c${idx}`, error: String(err.message || err) });
      }
      await sleep(120);
    }
    await writeFile(join(CAT_DIR, '..', 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    console.log(`分类封面：${manifest.filter((m) => !m.error).length}/${cats.length} 成功`);
  }

  for (const r of results) {
    if (r.error) console.log(`✗ ${r.kind} ${r.out}: ${r.error}`);
    else console.log(`✓ ${r.kind} ${r.out} (${(r.size / 1024).toFixed(0)} KB)${r.file ? ' ← ' + r.file : ''}`);
  }
}

main().catch((err) => {
  console.error('取封面失败：', err);
  process.exitCode = 1;
});
