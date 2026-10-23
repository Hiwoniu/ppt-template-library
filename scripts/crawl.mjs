#!/usr/bin/env node
/**
 * crawl.mjs — 只读抓取网盘分享的目录结构，生成 data/catalog.json
 *
 * 特点：
 *  - 只调用「分享页详情」接口，读取文件名/大小/层级；不下载任何 PPT、图片。
 *  - 每次运行现取 stoken，不写死凭据。
 *  - 失败分支记入 errors[]，不中断其它分类。
 *  - 先写临时文件再 rename，失败时保留上一版 catalog.json。
 *
 * 用法：
 *   node scripts/crawl.mjs
 *   QUARK_PWD_ID=xxxx node scripts/crawl.mjs
 */

import { mkdir, rename, writeFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'catalog.json');

const PWD_ID = process.env.QUARK_PWD_ID || '180767425d31';
const PASSCODE = process.env.QUARK_PASSCODE || '';
const SHARE_URL = `https://pan.quark.cn/s/${PWD_ID}`;
const API = 'https://drive-h.quark.cn/1/clouddrive/share/sharepage';
const PAGE_SIZE = 100;
const CONCURRENCY = 4;
const RETRIES = 3;
const LEVEL_LIMIT = 8; // 保护：最多下钻 8 层

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, init = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: {
          'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36',
          accept: 'application/json, text/plain, */*',
          ...(init.headers || {}),
        },
      });
      if (res.status === 429) throw new Error('HTTP 429 限流');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.code !== 0) throw new Error(`接口返回 code=${json.code} ${json.message || ''}`.trim());
      return json;
    } catch (err) {
      lastErr = err;
      if (attempt < RETRIES) await sleep(600 * attempt * attempt);
    }
  }
  throw lastErr;
}

async function getStoken() {
  const json = await fetchJson(`${API}/token?pr=ucpro&fr=pc`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pwd_id: PWD_ID, passcode: PASSCODE }),
  });
  return json.data;
}

async function listPage(stoken, pdirFid, page) {
  const params = new URLSearchParams({
    pr: 'ucpro',
    fr: 'pc',
    ver: '2',
    pwd_id: PWD_ID,
    stoken,
    pdir_fid: pdirFid,
    force: '0',
    _page: String(page),
    _size: String(PAGE_SIZE),
    _fetch_banner: '0',
    _fetch_share: '0',
    fetch_relate_conversation: '0',
    _fetch_total: '1',
    _sort: 'file_type:asc,file_name:asc',
  });
  const json = await fetchJson(`${API}/detail?${params}`);
  return {
    list: json.data?.list || [],
    total: json.metadata?._total ?? (json.data?.list || []).length,
  };
}

async function listAll(stoken, pdirFid) {
  const first = await listPage(stoken, pdirFid, 1);
  const items = [...first.list];
  for (let page = 2; items.length < first.total && first.list.length === PAGE_SIZE; page++) {
    const next = await listPage(stoken, pdirFid, page);
    items.push(...next.list);
    if (next.list.length < PAGE_SIZE) break;
  }
  return items;
}

async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

const isExternalDir = (name) => /点击进入下载/.test(name);

/** 去掉内部字段（fetched），保持 JSON 稳定。 */
function stripInternal(node) {
  const { fetched, children, ...rest } = node;
  return children ? { ...rest, children: children.map(stripInternal) } : rest;
}

function toNode(raw) {
  const dir = Boolean(raw.dir);
  return {
    name: raw.file_name,
    fid: raw.fid,
    type: dir ? 'dir' : 'file',
    ...(dir
      ? { childCount: raw.include_items ?? null }
      : {
          ext: (raw.file_name.match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase(),
          sizeBytes: raw.size ?? 0,
          updatedAt: raw.l_updated_at ? new Date(raw.l_updated_at).toISOString() : null,
        }),
    ...(dir && isExternalDir(raw.file_name) ? { external: true } : {}),
    children: dir ? [] : undefined,
    ...(dir ? { fetched: false } : {}),
  };
}

async function main() {
  console.log(`分享：${SHARE_URL}`);
  const token = await getStoken();
  console.log(`分享标题：${token.title}｜作者：${token.author?.nick_name ?? '未知'}`);
  const stoken = token.stoken;

  const errors = [];
  const rootPage = await listPage(stoken, '0', 1);
  const rootEntries = rootPage.list;
  if (rootEntries.length === 0) throw new Error('分享根目录为空');

  let level = rootEntries.map(toNode);
  const tree = level;

  for (let depth = 0; depth < LEVEL_LIMIT; depth++) {
    const folders = [];
    const walk = (nodes) => {
      for (const n of nodes) {
        if (n.type !== 'dir') continue;
        if (!n.fetched) folders.push(n);
        walk(n.children);
      }
    };
    walk(tree);
    if (folders.length === 0) break;

    console.log(`第 ${depth + 1} 层：待展开 ${folders.length} 个目录`);
    const results = await pool(folders, CONCURRENCY, async (folder) => {
      try {
        const raws = await listAll(stoken, folder.fid);
        return raws.map(toNode);
      } catch (err) {
        errors.push({ path: folder.name, fid: folder.fid, error: String(err && err.message ? err.message : err) });
        return [];
      }
    });

    let expanded = 0;
    folders.forEach((folder, i) => {
      folder.fetched = true;
      if (!results[i].length) return;
      folder.children = results[i];
      expanded++;
    });
    if (expanded === 0) break;
  }

  const stats = { dirs: 0, files: 0, bytes: 0 };
  const count = (node) => {
    if (node.type === 'dir') {
      stats.dirs++;
      for (const child of node.children) count(child);
    } else {
      stats.files++;
      stats.bytes += node.sizeBytes || 0;
    }
  };
  for (const node of tree) count(node);

  const payload = {
    source: {
      shareUrl: SHARE_URL,
      pwdId: PWD_ID,
      title: token.title,
      owner: token.author?.nick_name ?? null,
      expiredType: token.expired_type,
      expiredAt: token.expired_at ?? null,
      totalFiles: stats.files,
      totalDirs: stats.dirs,
      totalEntries: stats.files + stats.dirs,
      totalBytes: stats.bytes,
      crawledAt: new Date().toISOString(),
      note: '本文件仅记录目录结构（文件名/大小/层级），不包含任何文件内容；点击链接需自行到分享页浏览。',
    },
    errors,
    tree: tree.map(stripInternal),
  };

  await mkdir(dirname(OUT), { recursive: true });
  const tmp = `${OUT}.tmp`;
  await writeFile(tmp, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  await rename(tmp, OUT);

  const gb = (stats.bytes / 1024 ** 3).toFixed(1);
  console.log(`完成：${stats.dirs} 个目录，${stats.files} 个文件，${gb} GB，errors=${errors.length}`);
  console.log(`分享页口径（文件+目录）：${stats.files + stats.dirs}`);
  console.log(`输出：${OUT}`);

  if (stats.files + stats.dirs !== 7166) {
    console.warn(`⚠️ 条目数与分享页展示的 7166 不一致（${stats.files + stats.dirs}），请检查 errors`);
  }
  try {
    await readFile(OUT);
  } catch {
    /* noop */
  }
}

main().catch((err) => {
  console.error('抓取失败：', err);
  process.exitCode = 1;
});
