import { NextResponse, type NextRequest } from 'next/server';

/**
 * 访问门槛（对应后台「站点设置 → 谁可以看」）。
 *
 * 为什么用 middleware 而不是在每个页面里判断：
 * 门槛要拦的是「整站」，包括首页、播放页、榜单、搜索——分散判断一定会漏。
 * middleware 跑在 Edge runtime，读不到 Node 的 fs，所以策略值由一个轻量接口
 * /api/access 下发；同时把用户 token 的解析下沉到 Web Crypto（HMAC-SHA256），
 * 保证 Edge 侧也能独立校验签名，不需要 Node 运行时。
 *
 * 白名单（永远放行）：
 * - /login、/api/user、/api/auth、/api/status、/api/access、/api/notice、/api/tip（留言墙公开）
 * - /_next/*、/icons/*、/img/*、静态资源、manifest、favicon、robots
 */

const USER_COOKIE = 'ltv_user';
const ADMIN_COOKIE = 'ltv_session';

const PUBLIC_PATHS = [
  '/login',
  '/api/user',
  '/api/auth',
  '/api/status',
  '/api/access',
  '/api/notice',
  '/api/tip',
];

const ASSET_RE = /^\/(_next\/|icons\/|img\/|favicon\.ico|manifest\.webmanifest|robots\.txt|sw\.js)/;

function isPublic(pathname: string): boolean {
  if (ASSET_RE.test(pathname)) return true;
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * 与 src/lib/users.ts 的 sessionSecret() 逐字节一致：
 * 有 PROXY_SECRET 用 `${PROXY_SECRET}::user`；否则用 `sha256(PASSWORD + ':libretv::user-session-salt')`。
 * 站点换了 PASSWORD 之后旧会话自然会失效，这是期望行为。
 */
async function userSecret(): Promise<string> {
  if (process.env.PROXY_SECRET) return `${process.env.PROXY_SECRET}::user`;
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${process.env.PASSWORD ?? 'admin'}:libretv::user-session-salt`)
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function base64UrlToBytes(input: string): Uint8Array {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/** 与 src/lib/users.ts 的 parseUserSession 同构，但用 Web Crypto 实现（Edge 可用） */
async function verifyUserToken(token: string): Promise<boolean> {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(await userSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  // 服务端（src/lib/users.ts 的 hmac()）用的是 `digest('hex')`，56/64 位十六进制字符串，
  // 不是 base64url 或原始字节；这里必须逐字符比对，长度也要一致（64）。
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) return false;

  try {
    const raw = new TextDecoder().decode(base64UrlToBytes(payload));
    const exp = Number(raw.split('|')[2]);
    return Number.isFinite(exp) && Date.now() < exp;
  } catch {
    return false;
  }
}

/**
 * 让服务端判定身份：/api/access 内部转发当前 cookie，返回 { actor }。
 * Edge 侧的 verifyUserToken 只是兜底（同一套 HMAC，但实现路径不同），
 * 默认以服务端结论为准，这样密钥派生只有 src/lib/users.ts 一处。
 */
async function fetchActor(req: NextRequest): Promise<'admin' | 'user' | 'guest' | null> {
  try {
    const url = new URL('/api/access', req.nextUrl.origin);
    const cookie = req.headers.get('cookie');
    const res = await fetch(url, {
      cache: 'no-store',
      headers: cookie ? { cookie } : undefined,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { actor?: string };
    const kind = data.actor;
    return kind === 'admin' || kind === 'user' ? kind : 'guest';
  } catch {
    return null;
  }
}

function roughlyValidAdminToken(token: string): boolean {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return false;
  const exp = Number(token.slice(0, dot));
  return Number.isFinite(exp) && Date.now() < exp;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  // 策略：读同源 /api/access（内部 fetch，带 cache 打散，避免边缘缓存串味）
  let accessMode: 'open' | 'login' | 'members' = 'open';
  try {
    const url = new URL('/api/access', req.nextUrl.origin);
    const res = await fetch(url, { cache: 'no-store' });
    if (res.ok) {
      const data = (await res.json()) as { accessMode?: string };
      if (data.accessMode === 'login' || data.accessMode === 'members') {
        accessMode = data.accessMode;
      }
    }
  } catch {
    // 策略读不到时按 open 处理：宁可放开，也不要因为内部请求失败把整站锁死
    return NextResponse.next();
  }

  // 后台页面永远只认站长密码（注册用户在哪个模式下都进不了 /admin）
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    const adminToken = req.cookies.get(ADMIN_COOKIE)?.value;
    if (adminToken && roughlyValidAdminToken(adminToken)) return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('next', pathname);
    url.searchParams.set('tab', 'admin');
    return NextResponse.redirect(url);
  }

  if (accessMode === 'open') return NextResponse.next();

  const admin = req.cookies.get(ADMIN_COOKIE)?.value;
  if (admin && roughlyValidAdminToken(admin)) return NextResponse.next();
  // login / members 都要求「已登录」：login 认站长 + 注册用户，members 认注册用户。
  // 身份优先由服务端判定（会话密钥只有 src/lib/users.ts 一份实现，避免 Edge 与 Node 漂移）。
  const actor = await fetchActor(req);
  if (actor === 'user') return NextResponse.next();
  if (actor === 'admin' && accessMode === 'login') return NextResponse.next();
  const userToken = req.cookies.get(USER_COOKIE)?.value;
  if (userToken && (await verifyUserToken(userToken))) {
    const kind = await fetchActor(req);
    if (kind === null || kind === 'user') return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
