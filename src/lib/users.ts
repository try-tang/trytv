/**
 * 用户体系（注册 / 登录 / 会话）。
 *
 * 设计取向与 site-data.ts 一致：**不引数据库**，落到 .data/users.json，进程内串行写。
 *
 * 安全要点：
 * - 口令用 scrypt（N=16384,r=8,p=1）加盐哈希，盐 16 字节、摘要 64 字节，格式 `scrypt$N$r$p$salt$hash`；
 * - 用户会话是 httpOnly 签名 cookie，payload 里带 uid / role / exp，用 HMAC-SHA256 签名
 *   （密钥与管理员会话同一套派生逻辑，见 sessionSecret()）；
 * - 用户与管理员是两套独立 cookie：管理员（站长）走 PASSWORD，不受「开放注册」影响。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export type UserRole = 'user' | 'admin';

export interface UserRecord {
  id: string;
  username: string;
  /** 展示昵称（不填就用 username） */
  nick?: string;
  /** scrypt 哈希串 */
  hash: string;
  role: UserRole;
  createdAt: number;
  lastLoginAt?: number;
  /** 管理员可禁用账号（禁用后不能登录，已签发的会话立即失效） */
  disabled?: boolean;
  /** 最近一次登录 IP，便于站长排查 */
  lastIp?: string;
}

/** 对外暴露（不含 hash） */
export interface PublicUser {
  id: string;
  username: string;
  nick?: string;
  role: UserRole;
  createdAt: number;
  lastLoginAt?: number;
  disabled?: boolean;
}

interface UsersFile {
  users: UserRecord[];
}

const MAX_USERS = 20000;

export function usersFile(): string {
  const dir = process.env.SITE_DATA_DIR || path.join(process.cwd(), '.data');
  return path.join(dir, 'users.json');
}

let cache: UsersFile | null = null;
let writeChain: Promise<unknown> = Promise.resolve();

function read(): UsersFile {
  if (cache) return cache;
  const file = usersFile();
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<UsersFile>;
    cache = { users: Array.isArray(parsed.users) ? parsed.users : [] };
  } catch {
    try {
      if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`);
    } catch {
      /* 备份失败不影响主流程 */
    }
    cache = { users: [] };
  }
  return cache;
}

function persist(data: UsersFile): void {
  const file = usersFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function mutate<T>(fn: (data: UsersFile) => T): Promise<T> {
  const run = async (): Promise<T> => {
    const data = read();
    const result = fn(data);
    persist(data);
    return result;
  };
  const next = writeChain.then(run, run);
  writeChain = next.catch(() => undefined);
  return next;
}

// ——— 口令哈希 ———

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  const salt = Buffer.from(parts[4], 'base64');
  const expected = Buffer.from(parts[5], 'base64');
  let actual: Buffer;
  try {
    actual = crypto.scryptSync(password, salt, expected.length, { N, r, p });
  } catch {
    return false;
  }
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

// ——— 用户 CRUD ———

export function toPublic(u: UserRecord): PublicUser {
  return {
    id: u.id,
    username: u.username,
    nick: u.nick,
    role: u.role,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
    disabled: u.disabled,
  };
}

export function normalizeUsername(input: string): string {
  return String(input || '').trim().toLowerCase();
}

export function isValidUsername(name: string): boolean {
  return /^[a-z0-9_.-]{3,20}$/.test(name);
}

export interface CreateUserInput {
  username: string;
  password: string;
  nick?: string;
  role?: UserRole;
  /** 由后台创建时允许跳过「开放注册」检查 */
  ip?: string;
}

export type CreateUserResult =
  | { ok: true; user: PublicUser }
  | { ok: false; error: string };

export async function createUser(input: CreateUserInput): Promise<CreateUserResult> {
  const username = normalizeUsername(input.username);
  if (!isValidUsername(username)) {
    return { ok: false, error: '用户名需 3-20 位，仅限小写字母、数字、下划线、点和减号' };
  }
  if (String(input.password || '').length < 6) {
    return { ok: false, error: '密码至少 6 位' };
  }
  const hash = hashPassword(String(input.password));
  return mutate((data) => {
    if (data.users.some((u) => u.username === username)) {
      return { ok: false as const, error: '这个用户名已经被注册了' };
    }
    if (data.users.length >= MAX_USERS) {
      return { ok: false as const, error: '注册人数已达上限' };
    }
    const record: UserRecord = {
      id: `u_${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`,
      username,
      nick: input.nick?.trim().slice(0, 24) || undefined,
      hash,
      role: input.role === 'admin' ? 'admin' : 'user',
      createdAt: Date.now(),
      lastIp: input.ip,
    };
    data.users.push(record);
    return { ok: true as const, user: toPublic(record) };
  });
}

export function findUserByName(username: string): UserRecord | undefined {
  const name = normalizeUsername(username);
  return read().users.find((u) => u.username === name);
}

export function findUserById(id: string): UserRecord | undefined {
  return read().users.find((u) => u.id === id);
}

export function listUsers(): PublicUser[] {
  return read()
    .users.slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(toPublic);
}

export function countUsers(): { total: number; active: number } {
  const users = read().users;
  return { total: users.length, active: users.filter((u) => !u.disabled).length };
}

export async function touchLogin(id: string, ip?: string): Promise<void> {
  await mutate((data) => {
    const u = data.users.find((x) => x.id === id);
    if (u) {
      u.lastLoginAt = Date.now();
      u.lastIp = ip;
    }
  });
}

export async function setUserDisabled(id: string, disabled: boolean): Promise<PublicUser | null> {
  return mutate((data) => {
    const u = data.users.find((x) => x.id === id);
    if (!u) return null;
    u.disabled = disabled || undefined;
    return toPublic(u);
  });
}

export async function resetUserPassword(id: string, password: string): Promise<boolean> {
  if (String(password || '').length < 6) return false;
  const hash = hashPassword(password);
  return mutate((data) => {
    const u = data.users.find((x) => x.id === id);
    if (!u) return false;
    u.hash = hash;
    return true;
  });
}

export async function removeUser(id: string): Promise<boolean> {
  return mutate((data) => {
    const before = data.users.length;
    data.users = data.users.filter((u) => u.id !== id);
    return data.users.length !== before;
  });
}

// ——— 用户会话 token ———

export const USER_SESSION_COOKIE = 'ltv_user';
const USER_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 天

/**
 * 会话密钥的单一事实来源：所有调用方（服务端 `hmac()` 与 Edge `middleware.ts`
 * 的 `userSecret()`）都必须走这一套派生，任何一处不同都会导致签名判假、
 * 用户登录后被反复踢回 /login。
 */
export function sessionKey(): string {
  if (process.env.PROXY_SECRET) return `${process.env.PROXY_SECRET}::user`;
  // 与 src/lib/auth.ts 的 getPassword() 保持一致：没配 PASSWORD 时用内置默认密码
  return crypto
    .createHash('sha256')
    .update(`${process.env.PASSWORD || 'admin'}:libretv::user-session-salt`)
    .digest('hex');
}

function sessionSecret(): string {
  return sessionKey();
}

function hmac(payload: string): string {
  return crypto.createHmac('sha256', sessionSecret()).update(payload).digest('hex');
}

/** token 结构：`<base64url(payload)>.<hmac>`，payload = `uid|role|exp` */
export function signUserSession(user: Pick<UserRecord, 'id' | 'role'>): {
  token: string;
  expiresAt: number;
} {
  const expiresAt = Date.now() + USER_TTL_MS;
  const raw = `${user.id}|${user.role}|${expiresAt}`;
  const payload = Buffer.from(raw, 'utf8').toString('base64url');
  return { token: `${payload}.${hmac(payload)}`, expiresAt };
}

export interface UserSession {
  uid: string;
  role: UserRole;
  expiresAt: number;
}

export function parseUserSession(token: string | undefined | null): UserSession | null {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = hmac(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let raw: string;
  try {
    raw = Buffer.from(payload, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const [uid, role, exp] = raw.split('|');
  const expiresAt = Number(exp);
  if (!uid || !Number.isFinite(expiresAt) || Date.now() >= expiresAt) return null;
  return { uid, role: role === 'admin' ? 'admin' : 'user', expiresAt };
}

export function userSessionFromCookieHeader(cookieHeader: string | null): UserSession | null {
  if (!cookieHeader) return null;
  for (const c of cookieHeader.split(';')) {
    const eq = c.indexOf('=');
    if (eq === -1) continue;
    if (c.slice(0, eq).trim() === USER_SESSION_COOKIE) {
      return parseUserSession(decodeURIComponent(c.slice(eq + 1).trim()));
    }
  }
  return null;
}

/**
 * 当前访客（不读 cookie 之外的任何来源）：
 * 会校验用户是否仍存在 / 未被禁用，返回的记录带 role。
 */
export function currentUserFromRequest(
  req: Pick<Request, 'headers'>
): { session: UserSession; user: UserRecord } | null {
  const session = userSessionFromCookieHeader(req.headers.get('cookie'));
  if (!session) return null;
  const user = findUserById(session.uid);
  if (!user || user.disabled) return null;
  return { session, user };
}
