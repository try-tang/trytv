#!/usr/bin/env node
/**
 * 把 monaco-editor 的运行时从 node_modules 里「裁剪」到 public/monaco/vs。
 *
 * 为什么不用 CDN：
 * `@monaco-editor/loader` 默认指向 https://cdn.jsdelivr.net/npm/monaco-editor@0.43.0/min/vs ，
 * 国内网络经常连不上或极慢，后台「配置」页签会一直停在「正在读取配置」。
 * 自托管后离线 / 内网部署也能用。
 *
 * 为什么只搬子集：
 * 完整 vs 目录 14MB（其中 language/ 7MB 是 TS/CSS/HTML/Markdown，
 * basic-languages 640KB 是 60 多种语言定义）。这里只编辑 JSON，
 * 保留 loader + base + editor + language/json + 中英文 NLP（约 4.5MB）。
 *
 * 用法（只在升级 monaco-editor 时需要重跑）：
 *   node scripts/sync-monaco.mjs
 * 产物 public/monaco/vs 需要提交进仓库 —— 部署环境不会执行这个脚本。
 */

import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'monaco-editor', 'min', 'vs');
const dst = join(root, 'public', 'monaco', 'vs');

/** 需要的顶层条目（文件或目录） */
const KEEP = [
  'loader.js',
  'editor',
  'base',
  'nls.messages.zh-cn.js',
  // 只留 JSON 语法服务；TS/CSS/HTML/Markdown 全丢
  'language/json',
];

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(src))) {
    console.error(`找不到 ${src}，先跑一次 npm ci 装上 monaco-editor`);
    process.exit(1);
  }

  await rm(dst, { recursive: true, force: true });
  await mkdir(dst, { recursive: true });

  let copied = 0;
  for (const item of KEEP) {
    const from = join(src, item);
    if (!(await exists(from))) {
      console.warn(`跳过不存在的条目：${item}`);
      continue;
    }
    await cp(from, join(dst, item), { recursive: true });
    copied += 1;
  }

  console.log(`已复制 ${copied} 个条目到 public/monaco/vs`);
  console.log('提示：这个目录要提交进仓库，容器里不会执行本脚本。');
}

await main();
