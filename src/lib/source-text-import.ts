/**
 * 视频源「文本导入」的统一识别层：把一段贴进来的文本（或一个 JSON 文件的内容）
 * 认成我们认识的几种源清单格式，输出**统一的候选列表 + 跳过说明**，供前端预览勾选。
 *
 * 为什么要这一层：
 * - 订阅导入只吃 URL，用户手里往往是一段 JSON（群里转发的 TVBox 配置、LunaTV 的
 *   api_site 表、我们自己导出的 LibreTV-SourceList），贴都没地方贴。
 * - 各家格式字段名与语义都不一样（`api` vs `url`，`sites` vs `api_site` vs `sources`），
 *   分散在三个页面各写一遍解析必然走样，所以统一收敛到这里，纯函数、无 IO。
 *
 * 支持识别（按特征自动判定，不需要用户选格式）：
 * 1. `libretv`   —— 本站 `{ name?, sources[], liveSources[] }`，也接受 `data.sources` 包装与裸数组；
 * 2. `tvbox`     —— TVBox / CatVod 的 `{ sites[], lives[] }`（复用 `parseTvboxPayload` 的跳过语义）；
 * 3. `luna`      —— LunaTV-config 的 `{ api_site: { "域名": { name, api, detail } } }`；
 * 4. `single`    —— 单个 `{ name, api|url }` 对象（用户只贴了一个源）。
 *
 * 判定顺序很重要：TVBox 的 `sites` 与 Luna 的 `api_site` 不可能同时出现，但 LibreTV 风格
 * 的 `{sources}` 与裸数组都可能出现在别的包装里，所以先按「最具体的键」判定，再兜底。
 */

import type { SourceListPayload, SubscriptionParseStats } from './types';
import { hostnameOf, normalizeUrl, optionalString } from './source-list';
import { parseSourceListPayload } from './source-list';
import { describeParseStats, parseSubscriptionPayload, parseTvboxPayload } from './tvbox-parser';

/** 识别出的格式标识：比 SubscriptionParseStats.format 多了 luna / single */
export type ImportFormat = 'libretv' | 'tvbox' | 'source-catalog' | 'luna' | 'single';

export const IMPORT_FORMAT_LABEL: Record<ImportFormat, string> = {
  libretv: 'LibreTV 源列表',
  tvbox: 'TVBox 配置',
  'source-catalog': '接口目录',
  luna: 'LunaTV 配置（api_site）',
  single: '单个源',
};

/** 预览列表里的一条点播源 */
export interface ImportedVodSource {
  name: string;
  url: string;
  detail?: string;
}

/** 预览列表里的一条直播源 */
export interface ImportedLiveSource {
  name: string;
  url: string;
  epg?: string;
}

/** 解析结果：能导入的条目 + 跳过说明 + 原始统计 */
export interface TextImportResult {
  format: ImportFormat;
  name?: string;
  sources: ImportedVodSource[];
  liveSources: ImportedLiveSource[];
  stats?: SubscriptionParseStats;
  /** 给用户看的一句话补充说明（跳过 / 截断），没有异常时为空串 */
  note: string;
}

/** 常见长度上限，防止用户贴了 10MB 的配置把页面卡死 */
export const MAX_IMPORT_TEXT_BYTES = 2 * 1024 * 1024;

/**
 * 宽松解析 JSON：真实配置文件里常见注释、尾随逗号、BOM，
 * 直接 `JSON.parse` 会失败，而这些内容本身是完全可用的。
 */
export function parseLooseJson(text: string): unknown {
  const source = text.replace(/^\uFEFF/, '').trim();
  try {
    return JSON.parse(source);
  } catch {
    const stripped = stripJsonNoise(source);
    return JSON.parse(stripped);
  }
}

/** 去掉 // 与 /* *\/ 注释和尾随逗号（字符串内部不动） */
function stripJsonNoise(input: string): string {
  let out = '';
  let inString = false;
  let quote = '';
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const next = input[i + 1];
    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false;
        out += ch;
      }
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }
    if (inString) {
      out += ch;
      if (ch === '\\') {
        out += next ?? '';
        i += 1;
      } else if (ch === quote) {
        inString = false;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === '/' && next === '/') {
      inLineComment = true;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i += 1;
      continue;
    }
    out += ch;
  }
  // 尾随逗号：`}` 或 `]` 前面多余的 `,`
  return out.replace(/,(\s*[}\]])/g, '$1');
}

/**
 * 让 `{ name, sources, liveSources }` 这种「没有 data 包装」的写法也能被
 * `parseSubscriptionPayload` 认出来：它会先判 TVBOX、再判接口目录，最后才当源列表，
 * 而接口目录要求数组，所以这里显式指定按源列表解析，避免被误判。
 */
function parseFlatSourceList(json: Record<string, unknown>): SourceListPayload {
  const envelope = json.data;
  if (isRecord(envelope)) {
    // 兼容 `{ data: { name, sources, liveSources } }` 这种外包一层信封的写法
    return { ...parseSourceListPayload(envelope), stats: emptyStats('libretv') };
  }
  return { ...parseSourceListPayload(json), stats: emptyStats('libretv') };
}

/** 空统计：按给定格式生成一份 skipped 全零的 stats */
function emptyStats(format: SubscriptionParseStats['format']): SubscriptionParseStats {
  return { format, skipped: 0, skippedByReason: {}, truncated: 0 };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** LunaTV-config 的 api_site 表：{ "https://x.com/api.php/provide/vod": { name, api, detail } } */
function parseLunaPayload(json: unknown): TextImportResult {
  const record = json as Record<string, unknown>;
  const table = record.api_site;
  if (!isRecord(table)) {
    throw new Error('api_site 必须是一个对象：键为域名，值为 { name, api, detail }');
  }
  const sources: ImportedVodSource[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  const samples: string[] = [];

  for (const [key, raw] of Object.entries(table)) {
    const entry = isRecord(raw) ? raw : {};
    // api 优先，缺失时退回键名本身（Luna 的键就是完整接口地址）
    const rawUrl = optionalString(entry.api) || key;
    const url = normalizeUrl(rawUrl, true);
    const name = optionalString(entry.name) || (url ? hostnameOf(url) : key);
    if (!url || !/^https?:\/\//i.test(url)) {
      skipped += 1;
      if (name && samples.length < 3) samples.push(name);
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);
    sources.push({ name, url, detail: normalizeUrl(entry.detail, false) });
  }

  if (sources.length === 0) {
    throw new Error(skipped > 0 ? 'api_site 里没有可用的接口地址' : 'api_site 是空的');
  }

  const stats: SubscriptionParseStats = {
    format: 'libretv',
    skipped,
    skippedByReason: skipped > 0 ? { invalidUrl: skipped } : {},
    skippedSamples: samples.length > 0 ? samples : undefined,
    truncated: 0,
  };
  return { format: 'luna', sources, liveSources: [], stats, note: describeParseStats(stats) };
}

/** 单个源：{ name, api|url, detail } */
function parseSinglePayload(json: unknown): TextImportResult {
  const record = json as Record<string, unknown>;
  const url = normalizeUrl(optionalString(record.api) || record.url, true);
  if (!url) throw new Error('没有找到接口地址（找 api / url 字段都为空）');
  const name = optionalString(record.name) || hostnameOf(url);
  const detail = normalizeUrl(record.detail, false);
  return {
    format: 'single',
    sources: [{ name, url, detail }],
    liveSources: [],
    note: '',
  };
}

/** 把已有的 SourceListPayload（libretv / source-catalog / tvbox 解析结果）收敛成统一结果 */
function fromPayload(format: ImportFormat, payload: SourceListPayload): TextImportResult {
  const note = describeParseStats(payload.stats);
  if (payload.sources.length === 0 && payload.liveSources.length === 0) {
    throw new Error(note ? `没有可直接导入的源：${note}` : '内容里没有可用的源');
  }
  return {
    format,
    name: payload.name,
    sources: payload.sources.map((s) => ({ name: s.name, url: s.url, detail: s.detail })),
    liveSources: payload.liveSources.map((s) => ({ name: s.name, url: s.url, epg: s.epg })),
    stats: payload.stats,
    note,
  };
}

/**
 * 识别并解析一段文本。失败时抛错，错误文案直接面向用户（前端原样展示）。
 */
export function parseSourceText(text: string): TextImportResult {  const trimmed = text.trim();
  if (!trimmed) throw new Error('内容是空的，先粘贴或选择一个文件');
  if (Buffer.byteLength(trimmed, 'utf8') > MAX_IMPORT_TEXT_BYTES) {
    throw new Error('内容超过 2MB，请拆分后再导入');
  }

  let json: unknown;
  try {
    json = parseLooseJson(trimmed);
  } catch (err) {
    throw new Error(
      `不是合法的 JSON：${err instanceof Error ? err.message : String(err)}。如果这是一份订阅地址，请用「订阅 URL」方式导入`
    );
  }

  if (Array.isArray(json)) {
    // 裸数组：接口目录用 baseUrl，LibreTV 源列表用 url；只写 api 的（TVBox 写法）先归一成 url
    // 再交给现有解析器，避免为「同一件事的第三种字段名」再造一个分支
    return fromPayload('libretv', parseSubscriptionPayload(json.map(normalizeEntryField)));
  }
  if (!isRecord(json)) {
    throw new Error('顶层既不是对象也不是数组，认不出这是什么格式');
  }

  // 判定顺序：最具体的键优先，最后才当单源
  if (isRecord(json.api_site)) return parseLunaPayload(json);
  if (Array.isArray(json.sites) || Array.isArray(json.lives)) {
    return fromPayload('tvbox', parseTvboxPayload(json));
  }
  if (isRecord(json.data) || Array.isArray(json.sources) || Array.isArray(json.liveSources)) {
    return fromPayload('libretv', parseFlatSourceList(json));
  }
  if (optionalString(json.api) || optionalString(json.url)) return parseSinglePayload(json);

  throw new Error(
    '认不出这个格式：需要 sources / sites / api_site 之一，或者单个带 api/url 的对象'
  );
}

/** 单条候选的字段归一：`api` → `url`，其余原样返回（避免为第三种字段名再造解析分支） */
function normalizeEntryField(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  if (raw.url !== undefined || raw.baseUrl !== undefined) return raw;
  const api = optionalString(raw.api);
  return api ? { ...raw, url: api } : raw;
}

/**
 * 导出成 LunaTV-config 的 `api_site` 格式，方便贴到 LunaTV / 别的工具里用。
 * 键用接口地址本身（与 Luna 一致），detail 只在有值时才写，避免出现空字符串。
 */
export function toLunaConfig(sources: { name: string; url: string; detail?: string }[]): string {
  const apiSite: Record<string, { name: string; api: string; detail?: string }> = {};
  for (const s of sources) {
    const url = normalizeUrl(s.url, true);
    if (!url) continue;
    apiSite[url] = s.detail
      ? { name: s.name || hostnameOf(url), api: url, detail: s.detail }
      : { name: s.name || hostnameOf(url), api: url };
  }
  return JSON.stringify({ cache_time: 7200, api_site: apiSite }, null, 2);
}

/** 一条源记录（导入、导出、合并都用这个形状） */
export interface SourceEntry {
  name: string;
  url: string;
  detail?: string;
}

/** 把导入的条目并入现有列表：按 URL 去重，返回新列表与新增/重复条数 */
export function mergeSourceEntries(existing: SourceEntry[], incoming: SourceEntry[]) {
  const seen = new Set(existing.map((s) => normalizeUrl(s.url, true) ?? s.url));
  const list: SourceEntry[] = [...existing];
  let added = 0;
  let duplicated = 0;
  for (const item of incoming) {
    const url = normalizeUrl(item.url, true);
    if (!url) continue;
    if (seen.has(url)) {
      duplicated += 1;
      continue;
    }
    seen.add(url);
    list.push({ name: item.name || hostnameOf(url), url, detail: item.detail });
    added += 1;
  }
  return { list, added, duplicated };
}
