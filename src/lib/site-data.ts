/**
 * 站点互动数据的存储层（求片 / 赞赏留言 / 站长通知）。
 *
 * 设计取向和原站一致：**不引入数据库**。数据落到一个 JSON 文件里，
 * 读写走进程内串行队列，避免并发写坏文件。文件默认在 .data/site.json，
 * 用 SITE_DATA_DIR 可以换目录（容器里挂卷即可持久化）。
 *
 * 与原站的区别：原站把「求片」和「赞赏」当成纯前端 localStorage + 后台手工核对，
 * 这里上移到服务端，多端可见、后台可管理，管理员鉴别由现有 PASSWORD 机制承担。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export interface RequestEntry {
  id: string;
  title: string;
  note?: string;
  nick?: string;
  /** pending=待处理 / done=已收录 / rejected=不做 */
  status: 'pending' | 'done' | 'rejected';
  createdAt: number;
  updatedAt: number;
  /** 处理备注（后台可见） */
  reply?: string;
}

export interface TipEntry {
  id: string;
  nick?: string;
  amount: number;
  content?: string;
  /** pending=待核对 / shown=已上墙 / hidden=隐藏 */
  status: 'pending' | 'shown' | 'hidden';
  createdAt: number;
}

export interface NoticeEntry {
  /** 站长通知正文（纯文本，支持换行） */
  body: string;
  /** 版本号：前端记住已读版本，只在变化时弹窗 */
  version: number;
  updatedAt: number;
  /** 默认展示的弹窗开关 */
  enabled: boolean;
}

/**
 * 私密短剧条目（/shorts 用）。
 * 片源地址不放代码里：站长在 .data/site.json 的 shorts 数组里维护，
 * 只有在 /api/shorts 校验口令通过后才下发给前端。
 */
export interface ShortEntry {
  id: string;
  title: string;
  /** 直链视频地址（mp4 / m3u8） */
  url: string;
  poster?: string;
  desc?: string;
  /** 分集；不填则整条当一集播 */
  episodes?: { t: string; u: string }[];
}

/**
 * 访客访问策略（后台「站点设置」可改，立即生效）：
 * - open：所有人可看，不需要任何账号（默认，和上游 LibreTV 一致）
 * - login：必须登录后才能看（注册用户 或 站长密码）
 * - members：必须持有本站账号（仅注册用户，站长密码不算）
 */
export type AccessMode = 'open' | 'login' | 'members';

export interface SiteSettings {
  /** 访问模式 */
  accessMode: AccessMode;
  /** 是否开放注册（关闭后只有站长能在后台建号） */
  allowRegister: boolean;
  /** 站名（留空则用代码里的 SITE.name / 环境变量） */
  siteName?: string;
  /** 首页轮播口号 */
  slogan?: string;
  /** 通知弹窗之外再给一句顶部提示条（留空不显示） */
  banner?: string;
  /** 私密短剧入口是否显示（默认开） */
  shortsEnabled?: boolean;
  /**
   * 短剧口令的 scrypt 哈希（格式与用户密码一致）。
   * 只存哈希不存明文；环境变量 SHORTS_PASSWORD 仍然有效，两者任一匹配即放行。
   */
  shortsPasswordHash?: string;
  /** 短剧口令的更新时间，便于面板显示「上次改动」 */
  shortsPasswordAt?: number;
  /** 是否过滤成人内容（伦理片等分类），默认放开 —— 与上游 LibreTV 设置项对应 */
  adultFilter?: boolean;
  updatedAt: number;
}

/**
 * 单个账号的观影记录 / 待看清单（/api/library 云同步）。
 * 只按注册用户的 uid 存；站长密码会话不带这份数据。
 */
export interface LibraryEntry {
  history: {
    id: string;
    sourceKey: string;
    sourceUrl?: string;
    vodId: string;
    title: string;
    pic?: string;
    episodeIndex: number;
    totalEpisodes: number;
    playbackPosition: number;
    duration: number;
    timestamp: number;
  }[];
  watchlist: {
    id: string;
    title: string;
    pic?: string;
    sourceKey?: string;
    vodId?: string;
    addedAt: number;
  }[];
  updatedAt: number;
}

export interface SiteData {
  requests: RequestEntry[];
  tips: TipEntry[];
  notice: NoticeEntry;
  shorts: ShortEntry[];
  settings: SiteSettings;
  /** uid -> 该账号的观影记录与待看清单 */
  library?: Record<string, LibraryEntry>;
}

const MAX_REQUESTS = 5000;
const MAX_TIPS = 2000;

const DEFAULT_SETTINGS: SiteSettings = {
  accessMode: 'open',
  allowRegister: true,
  updatedAt: 0,
};

const DEFAULT_DATA: SiteData = {
  requests: [],
  tips: [],
  shorts: [],
  settings: { ...DEFAULT_SETTINGS },
  notice: {
    body: '',
    version: 0,
    updatedAt: 0,
    enabled: false,
  },
};

function dataFile(): string {
  const dir = process.env.SITE_DATA_DIR || path.join(process.cwd(), '.data');
  return path.join(dir, 'site.json');
}

let cache: SiteData | null = null;
/** 串行写队列：所有写操作排队执行，避免 read-modify-write 竞态 */
let writeChain: Promise<unknown> = Promise.resolve();

/** 宽松归一化：配置文件可能被手工编辑过，非法值一律退回默认 */
export function normalizeSettings(input: unknown): SiteSettings {
  const raw = (input || {}) as Partial<SiteSettings>;
  const mode: AccessMode =
    raw.accessMode === 'login' || raw.accessMode === 'members' ? raw.accessMode : 'open';
  return {
    accessMode: mode,
    allowRegister: raw.allowRegister !== false,
    siteName: typeof raw.siteName === 'string' ? raw.siteName.slice(0, 40) : undefined,
    slogan: typeof raw.slogan === 'string' ? raw.slogan.slice(0, 60) : undefined,
    banner: typeof raw.banner === 'string' ? raw.banner.slice(0, 200) : undefined,
    shortsEnabled: raw.shortsEnabled !== false,
    shortsPasswordHash:
      typeof raw.shortsPasswordHash === 'string' && raw.shortsPasswordHash
        ? raw.shortsPasswordHash
        : undefined,
    shortsPasswordAt: Number(raw.shortsPasswordAt) || undefined,
    adultFilter: raw.adultFilter === true,
    updatedAt: Number(raw.updatedAt) || 0,
  };
}

function readFile(): SiteData {
  if (cache) return cache;
  const file = dataFile();
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw) as Partial<SiteData>;
    cache = {
      requests: Array.isArray(parsed.requests) ? parsed.requests : [],
      tips: Array.isArray(parsed.tips) ? parsed.tips : [],
      notice: { ...DEFAULT_DATA.notice, ...(parsed.notice || {}) },
      // 短剧是后加字段，旧文件里没有——按空数组处理，不影响已有数据
      shorts: Array.isArray(parsed.shorts) ? parsed.shorts : [],
      // 站点设置同理：旧文件没有就退回默认（所有人可看 + 开放注册）
      settings: normalizeSettings(parsed.settings),
      // 账号云同步数据：旧文件没有就是空对象
      library:
        parsed.library && typeof parsed.library === 'object'
          ? (parsed.library as Record<string, LibraryEntry>)
          : {},
    };
  } catch {
    // 文件不存在 / 内容损坏都退回默认值（损坏时保留一份 .bak 便于排查）
    try {
      if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`);
    } catch {
      /* 备份失败不影响主流程 */
    }
    cache = JSON.parse(JSON.stringify(DEFAULT_DATA)) as SiteData;
  }
  return cache;
}

function persist(data: SiteData): void {
  const file = dataFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

/** 读：返回深拷贝，调用方随便改都不会污染缓存 */
export function getSiteData(): SiteData {
  return JSON.parse(JSON.stringify(readFile())) as SiteData;
}

/** 写：串行执行 mutate + 落盘 */
function mutate<T>(fn: (data: SiteData) => T): Promise<T> {
  const run = async (): Promise<T> => {
    const data = readFile();
    const result = fn(data);
    persist(data);
    return result;
  };
  const next = writeChain.then(run, run);
  // 失败也不要打断链路：后续写操作继续排队
  writeChain = next.catch(() => undefined);
  return next;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
}

// —— 求片 ——

export function addRequest(input: { title: string; note?: string; nick?: string }): Promise<RequestEntry> {
  return mutate((data) => {
    const entry: RequestEntry = {
      id: newId('req'),
      title: input.title.slice(0, 60),
      note: input.note?.slice(0, 200) || undefined,
      nick: input.nick?.slice(0, 24) || undefined,
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    data.requests.unshift(entry);
    if (data.requests.length > MAX_REQUESTS) data.requests.length = MAX_REQUESTS;
    return entry;
  });
}

export function listRequests(): RequestEntry[] {
  return getSiteData().requests;
}

export function updateRequest(
  id: string,
  patch: { status?: RequestEntry['status']; reply?: string }
): Promise<RequestEntry | null> {
  return mutate((data) => {
    const entry = data.requests.find((r) => r.id === id);
    if (!entry) return null;
    if (patch.status) entry.status = patch.status;
    if (patch.reply !== undefined) entry.reply = patch.reply.slice(0, 200) || undefined;
    entry.updatedAt = Date.now();
    return entry;
  });
}

export function removeRequest(id: string): Promise<boolean> {
  return mutate((data) => {
    const before = data.requests.length;
    data.requests = data.requests.filter((r) => r.id !== id);
    return data.requests.length !== before;
  });
}

// —— 赞赏留言 ——

export function addTip(input: { amount: number; nick?: string; content?: string }): Promise<TipEntry> {
  return mutate((data) => {
    const entry: TipEntry = {
      id: newId('tip'),
      amount: input.amount,
      nick: input.nick?.slice(0, 24) || undefined,
      content: input.content?.slice(0, 200) || undefined,
      // 默认待核对：原站也是「站长核对后展示」，避免刷屏
      status: 'pending',
      createdAt: Date.now(),
    };
    data.tips.unshift(entry);
    if (data.tips.length > MAX_TIPS) data.tips.length = MAX_TIPS;
    return entry;
  });
}

/** 公开留言墙：只返回已上墙的，且不带金额以外任何审核字段 */
export function listPublicTips(): { total: number; items: TipEntry[] } {
  const data = getSiteData();
  const items = data.tips.filter((t) => t.status === 'shown');
  const total = data.tips
    .filter((t) => t.status !== 'hidden')
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  return { total, items };
}

export function listAllTips(): TipEntry[] {
  return getSiteData().tips;
}

export function updateTip(id: string, status: TipEntry['status']): Promise<TipEntry | null> {
  return mutate((data) => {
    const entry = data.tips.find((t) => t.id === id);
    if (!entry) return null;
    entry.status = status;
    return entry;
  });
}

export function removeTip(id: string): Promise<boolean> {
  return mutate((data) => {
    const before = data.tips.length;
    data.tips = data.tips.filter((t) => t.id !== id);
    return data.tips.length !== before;
  });
}

// —— 站长通知 ——

export function getNotice(): NoticeEntry {
  return getSiteData().notice;
}

export function setNotice(patch: { body?: string; enabled?: boolean }): Promise<NoticeEntry> {
  return mutate((data) => {
    if (patch.body !== undefined) {
      const body = patch.body.slice(0, 4000);
      // 只有正文变化才推版本号：前端靠版本号判断「有没有新通知」
      if (body !== data.notice.body) {
        data.notice.body = body;
        data.notice.version += 1;
      }
    }
    if (patch.enabled !== undefined) data.notice.enabled = patch.enabled;
    data.notice.updatedAt = Date.now();
    return data.notice;
  });
}

// —— 站点设置 ——

/**
 * 账号云同步：读某个 uid 的记录（没有就返回 null，客户端据此判断要不要「认领本地记录」）。
 */
export function getLibrary(uid: string): LibraryEntry | null {
  const data = readFile();
  const hit = data.library?.[uid];
  return hit ?? null;
}

/** 账号云同步：整包覆盖某个 uid 的记录 */
export async function setLibrary(
  uid: string,
  next: { history: LibraryEntry['history']; watchlist: LibraryEntry['watchlist'] }
): Promise<LibraryEntry> {
  const entry: LibraryEntry = {
    history: next.history,
    watchlist: next.watchlist,
    updatedAt: Date.now(),
  };
  await mutate((data) => {
    if (!data.library) data.library = {};
    data.library[uid] = entry;
  });
  return entry;
}

/** 删除某个账号的记录（后台删号时一并清掉） */
export async function removeLibrary(uid: string): Promise<void> {
  await mutate((data) => {
    if (data.library && data.library[uid]) delete data.library[uid];
  });
}

export function getSettings(): SiteSettings {
  return getSiteData().settings;
}

export function updateSettings(patch: Partial<Omit<SiteSettings, 'updatedAt'>>): Promise<SiteSettings> {
  return mutate((data) => {
    const next = normalizeSettings({ ...data.settings, ...patch });
    next.updatedAt = Date.now();
    data.settings = next;
    return next;
  });
}

// —— 私密短剧清单 ——

const MAX_SHORTS = 200;

export interface ShortInput {
  title?: string;
  url?: string;
  poster?: string;
  desc?: string;
  episodes?: { t: string; u: string }[];
}

function normalizeShort(input: ShortInput, base?: ShortEntry): ShortEntry | null {
  const title = String(input.title ?? base?.title ?? '').trim().slice(0, 80);
  const url = String(input.url ?? base?.url ?? '').trim();
  const poster = String(input.poster ?? base?.poster ?? '').trim().slice(0, 500);
  const desc = String(input.desc ?? base?.desc ?? '').trim().slice(0, 400);
  const episodes = Array.isArray(input.episodes)
    ? input.episodes
        .map((e) => ({ t: String(e?.t ?? '').slice(0, 40), u: String(e?.u ?? '').trim() }))
        .filter((e) => e.u)
        .slice(0, 500)
    : base?.episodes;
  // 有分集时 url 可留空；否则必须有 url
  if (!title || (!url && !(episodes && episodes.length))) return null;
  return {
    id: base?.id ?? newId('short'),
    title,
    url,
    poster: poster || undefined,
    desc: desc || undefined,
    episodes: episodes && episodes.length ? episodes : undefined,
  };
}

export function listShorts(): ShortEntry[] {
  return getSiteData().shorts;
}

export function addShort(input: ShortInput): Promise<ShortEntry | null> {
  return mutate((data) => {
    const entry = normalizeShort(input);
    if (!entry) return null;
    data.shorts.unshift(entry);
    if (data.shorts.length > MAX_SHORTS) data.shorts.length = MAX_SHORTS;
    return entry;
  });
}

export function updateShort(id: string, patch: ShortInput): Promise<ShortEntry | null> {
  return mutate((data) => {
    const idx = data.shorts.findIndex((s) => s.id === id);
    if (idx < 0) return null;
    const entry = normalizeShort(patch, data.shorts[idx]);
    if (!entry) return null;
    data.shorts[idx] = entry;
    return entry;
  });
}

/**
 * 整体替换短剧清单（后台「配置」页签保存 JSON 时用）。
 *
 * 与逐条 add/update 的区别：这里保留条目自带的 id（缺 id 的才新生成），
 * 所以顺序调整、批量改名都不会导致播放进度/收藏关联的 id 漂移。
 * 非法条目（缺 title 或既无 url 又无分集）会被丢掉，不阻断整次保存。
 */
export function replaceShorts(list: ShortInput[]): Promise<ShortEntry[]> {
  return mutate((data) => {
    const next: ShortEntry[] = [];
    for (const item of list) {
      const id = typeof (item as { id?: unknown }).id === 'string' ? (item as { id: string }).id : '';
      const base = id ? data.shorts.find((s) => s.id === id) : undefined;
      const entry = normalizeShort(item, base);
      if (entry) next.push(entry);
      if (next.length >= MAX_SHORTS) break;
    }
    data.shorts = next;
    return next;
  });
}

export function removeShort(id: string): Promise<boolean> {
  return mutate((data) => {
    const before = data.shorts.length;
    data.shorts = data.shorts.filter((s) => s.id !== id);
    return data.shorts.length !== before;
  });
}

// —— 汇总（后台仪表盘用） ——

export function stats() {
  const data = getSiteData();
  return {
    requests: {
      total: data.requests.length,
      pending: data.requests.filter((r) => r.status === 'pending').length,
      done: data.requests.filter((r) => r.status === 'done').length,
    },
    tips: {
      total: data.tips.length,
      pending: data.tips.filter((t) => t.status === 'pending').length,
      shown: data.tips.filter((t) => t.status === 'shown').length,
      amount: data.tips.reduce((s, t) => s + (Number(t.amount) || 0), 0),
    },
    notice: { enabled: data.notice.enabled, version: data.notice.version },
    settings: {
      accessMode: data.settings.accessMode,
      allowRegister: data.settings.allowRegister,
      shortsEnabled: data.settings.shortsEnabled !== false,
      shortsPasswordSet: Boolean(data.settings.shortsPasswordHash),
      adultFilter: data.settings.adultFilter === true,
    },
    shorts: { total: data.shorts.length },
  };
}
