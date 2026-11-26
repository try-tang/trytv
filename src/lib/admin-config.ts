/**
 * 后台「配置」页签用的纯逻辑：把站点数据序列化成能编辑的 JSON，
 * 应用编辑后的 JSON 时做**严格校验 + 只回写允许的字段**。
 *
 * 为什么要单独一层：
 * - `.data/site.json` 里混着「站长可以手改的配置」（站点设置、短剧清单）
 *   和「业务数据」（求片、赞赏、通知），后者有各自的表单页签，不应该在
 *   配置编辑器里被整体覆盖（一次手滑就会清空全部留言）。
 * - 口令类字段只存 scrypt 哈希，明文不可回显；编辑器里显示为 `<已设置>`，
 *   写回时若值未变就保留原哈希，写空则清除。
 * - 数据源清单（sources / liveSources）是「一台实例的点播与直播源」，
 *   和站点数据不是一回事，所以单独成一个文件 `sources.json`。
 *
 * 这个模块前后端都能跑（纯函数，无 IO），所以放在 lib 下由 API 与页面共用同一份规则。
 */

import type { ShortEntry, SiteSettings } from './site-data';

/** 口令占位：编辑器里看到这个字符串表示「已设置，但没有回显明文」 */
export const SECRET_PLACEHOLDER = '<已设置>';

/* ────────────────────────── 文件一：site.json ────────────────────────── */

/** site.json 里允许编辑的顶层键（顺序即格式化的展示顺序） */
export const CONFIG_KEYS = ['settings', 'shorts'] as const;

export type ConfigKey = (typeof CONFIG_KEYS)[number];

export interface EditableConfig {
  settings: SiteSettings;
  shorts: ShortEntry[];
}

/**
 * 解析出来的配置。与 EditableConfig 的唯一区别是 shorts 可以是 undefined ——
 * 用户只粘贴了 settings 片段时，不该把线上短剧清单清空。
 */
export interface ParsedConfig {
  settings: SiteSettings;
  shorts?: ShortEntry[];
}

/** 把站点设置 + 短剧清单整理成编辑用的对象（口令换占位符） */
export function toEditableConfig(settings: SiteSettings, shorts: ShortEntry[]): EditableConfig {
  const out = { ...settings } as Record<string, unknown>;
  // 用字符串占位而不是删字段：删掉后站长看不见「已经设过口令」，容易误以为没生效
  out.shortsPasswordHash = settings.shortsPasswordHash ? SECRET_PLACEHOLDER : '';
  if (!settings.shortsPasswordAt) delete out.shortsPasswordAt;
  return {
    // JSON 三态：占位符（已设置）/ 空串（未设置）/ 别的字符串（要换成这个新口令）
    settings: out as unknown as SiteSettings,
    shorts: shorts.map((s) => ({ ...s })),
  };
}

export function stringifyConfig(config: EditableConfig | ParsedConfig | EditableSourceConfig): string {
  return JSON.stringify(config, null, 2);
}

export type ParseResult<T = ParsedConfig> =
  | { ok: true; value: T }
  | { ok: false; error: string; line?: number; column?: number };

/** 只做 JSON.parse + 行列号定位，业务校验交给调用方 */
function parseJsonWithPosition(text: string): ParseResult<unknown> {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const pos = /at position (\d+)/.exec(message);
    const lineCol = /line (\d+) column (\d+)/.exec(message);
    let line: number | undefined;
    let column: number | undefined;
    if (lineCol) {
      line = Number(lineCol[1]);
      column = Number(lineCol[2]);
    } else if (pos) {
      const offset = Number(pos[1]);
      const before = text.slice(0, offset);
      line = before.split('\n').length;
      column = offset - before.lastIndexOf('\n');
    }
    return { ok: false, error: `JSON 格式错误：${message}`, line, column };
  }
}

/**
 * 解析编辑器里的文本。报错带上行列号：JSON.parse 的 V8 报错形如
 * `... at position 123 (line 4 column 5)`，不同 Node 版本措辞不完全一致，
 * 所以优先用正则抓 `line X column Y`，抓不到就退回 position。
 */
export function parseConfig(text: string): ParseResult<ParsedConfig> {
  const parsed = parseJsonWithPosition(text);
  if (!parsed.ok) return parsed;
  const raw = parsed.value;

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: '顶层必须是一个对象，形如 { "settings": {…}, "shorts": [ … ] }' };
  }

  const obj = raw as Record<string, unknown>;
  const unknownKeys = Object.keys(obj).filter(
    (k) => !(CONFIG_KEYS as readonly string[]).includes(k)
  );
  if (unknownKeys.length > 0) {
    return {
      ok: false,
      error: `不认识的顶层字段：${unknownKeys.join('、')}。这里只接受 settings 与 shorts 两个字段（求片、赞赏、通知请用各自的页签管理；数据源在 sources.json）。`,
    };
  }

  const settingsRaw = obj.settings;
  if (!settingsRaw || typeof settingsRaw !== 'object' || Array.isArray(settingsRaw)) {
    return { ok: false, error: 'settings 必须是一个对象' };
  }
  const settingsObj = settingsRaw as Record<string, unknown>;
  const mode = settingsObj.accessMode;
  if (mode !== undefined && mode !== 'open' && mode !== 'login' && mode !== 'members') {
    return { ok: false, error: 'settings.accessMode 只能是 "open" / "login" / "members"' };
  }
  if (settingsObj.allowRegister !== undefined && typeof settingsObj.allowRegister !== 'boolean') {
    return { ok: false, error: 'settings.allowRegister 必须是 true 或 false' };
  }
  for (const key of ['siteName', 'slogan', 'banner'] as const) {
    const v = settingsObj[key];
    if (v !== undefined && v !== null && typeof v !== 'string') {
      return { ok: false, error: `settings.${key} 必须是字符串` };
    }
  }
  for (const key of ['adultFilter', 'shortsEnabled'] as const) {
    const v = settingsObj[key];
    if (v !== undefined && typeof v !== 'boolean') {
      return { ok: false, error: `settings.${key} 必须是 true 或 false` };
    }
  }

  const shortsRaw = obj.shorts;
  if (shortsRaw !== undefined && !Array.isArray(shortsRaw)) {
    return { ok: false, error: 'shorts 必须是数组' };
  }
  // 缺失时保持 undefined，让调用方知道「这次没打算改短剧」，而不是把它当成清空
  const shorts = shortsRaw as unknown[] | undefined;
  for (let i = 0; i < (shorts?.length ?? 0); i++) {
    const item = shorts![i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { ok: false, error: `shorts[${i}] 必须是对象` };
    }
    const it = item as Record<string, unknown>;
    if (typeof it.title !== 'string' || !it.title.trim()) {
      return { ok: false, error: `shorts[${i}].title 必须是填了内容的字符串` };
    }
    const hasUrl = typeof it.url === 'string' && it.url.trim().length > 0;
    const hasEps = Array.isArray(it.episodes) && it.episodes.length > 0;
    if (!hasUrl && !hasEps) {
      return { ok: false, error: `shorts[${i}] 需要 url，或者给一个非空的 episodes 数组` };
    }
    if (it.episodes !== undefined && !Array.isArray(it.episodes)) {
      return { ok: false, error: `shorts[${i}].episodes 必须是数组` };
    }
  }

  return {
    ok: true,
    value: { settings: settingsObj as unknown as SiteSettings, shorts: shorts as ShortEntry[] | undefined },
  };
}

/* ───────────────────────── sources.json ───────────────────────── */

/**
 * 站点预置数据源文件。字段名沿用订阅格式（LibreTV-SourceList），
 * 这样同一份文件既能给「导入源」用，也能直接写进这里。
 */
export interface EditableSourceConfig {
  name: string;
  version: number;
  updatedAt?: number;
  sources: { name: string; url: string; detail?: string; isAdult?: boolean }[];
  liveSources: { name: string; url: string; epg?: string }[];
}

/** 预置源的数量上限：和订阅导入的限制保持一致，避免一次粘贴几千条把首页拖死 */
export const MAX_PRESET_VOD = 200;
export const MAX_PRESET_LIVE = 100;

export function toEditableSources(
  sources: EditableSourceConfig['sources'],
  liveSources: EditableSourceConfig['liveSources'],
  updatedAt?: number
): EditableSourceConfig {
  return {
    name: '站点预置数据源',
    version: 1,
    ...(updatedAt ? { updatedAt } : {}),
    sources: sources.map((s) => ({ ...s })),
    liveSources: liveSources.map((s) => ({ ...s })),
  };
}

export interface ParsedSourceConfig {
  sources: EditableSourceConfig['sources'];
  liveSources: EditableSourceConfig['liveSources'];
}

/**
 * 解析 sources.json。同时接受三种写法，方便站长从别处复制：
 * 1. `{ sources: [...], liveSources: [...] }`（本文件格式）
 * 2. `{ api_site: { "https://…": { name, api, detail } } }`（LunaTV-config 导出）
 * 3. 裸数组 `[{ name, url|api, detail }]`（只当点播源）
 */
export function parseSourceConfig(text: string): ParseResult<ParsedSourceConfig> {
  const parsed = parseJsonWithPosition(text);
  if (!parsed.ok) return parsed;
  const raw = parsed.value;

  const readVod = (list: unknown[], label: string): ParseResult<EditableSourceConfig['sources']> => {
    const out: EditableSourceConfig['sources'] = [];
    const seen = new Set<string>();
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return { ok: false, error: `${label}[${i}] 必须是对象` };
      }
      const it = item as Record<string, unknown>;
      const url = typeof it.url === 'string' ? it.url.trim() : typeof it.api === 'string' ? it.api.trim() : '';
      if (!url) return { ok: false, error: `${label}[${i}] 缺少 url（或 api）` };
      if (!/^https?:\/\//i.test(url)) {
        return { ok: false, error: `${label}[${i}].url 必须是以 http:// 或 https:// 开头` };
      }
      const key = url.replace(/\/+$/, '');
      if (seen.has(key)) continue;
      seen.add(key);
      const name = typeof it.name === 'string' && it.name.trim() ? it.name.trim() : url;
      const detail = typeof it.detail === 'string' && it.detail.trim() ? it.detail.trim() : undefined;
      out.push({ name, url, ...(detail ? { detail } : {}), ...(it.isAdult === true ? { isAdult: true } : {}) });
    }
    return { ok: true, value: out };
  };

  const readLive = (list: unknown[]): ParseResult<EditableSourceConfig['liveSources']> => {
    const out: EditableSourceConfig['liveSources'] = [];
    const seen = new Set<string>();
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return { ok: false, error: `liveSources[${i}] 必须是对象` };
      }
      const it = item as Record<string, unknown>;
      const url = typeof it.url === 'string' ? it.url.trim() : '';
      if (!url) return { ok: false, error: `liveSources[${i}] 缺少 url` };
      if (!/^https?:\/\//i.test(url)) {
        return { ok: false, error: `liveSources[${i}].url 必须是以 http:// 或 https:// 开头` };
      }
      const key = url.replace(/\/+$/, '');
      if (seen.has(key)) continue;
      seen.add(key);
      const name = typeof it.name === 'string' && it.name.trim() ? it.name.trim() : url;
      const epg = typeof it.epg === 'string' && it.epg.trim() ? it.epg.trim() : undefined;
      out.push({ name, url, ...(epg ? { epg } : {}) });
    }
    return { ok: true, value: out };
  };

  // 1) 数组：只当点播源
  if (Array.isArray(raw)) {
    const vod = readVod(raw, '$');
    if (!vod.ok) return vod;
    if (vod.value.length === 0) return { ok: false, error: '数组是空的，没有可导入的源' };
    return { ok: true, value: { sources: vod.value, liveSources: [] } };
  }

  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: '顶层必须是对象或数组' };
  }
  const obj = raw as Record<string, unknown>;

  // 2) LunaTV 的 api_site
  if (obj.api_site && typeof obj.api_site === 'object' && !Array.isArray(obj.api_site)) {
    const entries = Object.entries(obj.api_site as Record<string, unknown>).map(([key, v]) => {
      const it = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
      return {
        name: typeof it.name === 'string' ? it.name : key,
        api: typeof it.api === 'string' ? it.api : key,
        detail: it.detail,
      };
    });
    const vod = readVod(entries, 'api_site');
    if (!vod.ok) return vod;
    if (vod.value.length === 0) return { ok: false, error: 'api_site 里没有可用的源' };
    return { ok: true, value: { sources: vod.value, liveSources: [] } };
  }

  // 3) 本文件格式
  const vodRaw = obj.sources ?? obj.data;
  const liveRaw = obj.liveSources;
  if (vodRaw === undefined && liveRaw === undefined) {
    return { ok: false, error: '认不出这个格式：需要 sources / liveSources（或 api_site、或直接给数组）' };
  }
  if (vodRaw !== undefined && !Array.isArray(vodRaw)) {
    return { ok: false, error: 'sources 必须是数组' };
  }
  if (liveRaw !== undefined && !Array.isArray(liveRaw)) {
    return { ok: false, error: 'liveSources 必须是数组' };
  }
  const vod = readVod((vodRaw as unknown[] | undefined) ?? [], 'sources');
  if (!vod.ok) return vod;
  const live = readLive((liveRaw as unknown[] | undefined) ?? []);
  if (!live.ok) return live;
  if (vod.value.length > MAX_PRESET_VOD) {
    return { ok: false, error: `点播源最多 ${MAX_PRESET_VOD} 个（现在 ${vod.value.length} 个）` };
  }
  if (live.value.length > MAX_PRESET_LIVE) {
    return { ok: false, error: `直播源最多 ${MAX_PRESET_LIVE} 个（现在 ${live.value.length} 个）` };
  }
  if (vod.value.length === 0 && live.value.length === 0) {
    return { ok: false, error: '点播源与直播源都是空的' };
  }
  return { ok: true, value: { sources: vod.value, liveSources: live.value } };
}
