import { NextResponse } from 'next/server';
import {
  USER_SESSION_COOKIE,
  createUser,
  findUserByName,
  signUserSession,
  toPublic,
  touchLogin,
  verifyPassword,
  currentUserFromRequest,
} from '@/lib/users';
import { getSettings } from '@/lib/site-data';
import { checkRateLimit, clearRateLimit, sessionFromCookieHeader } from '@/lib/auth';

export const runtime = 'nodejs';


/**
 * 本站账号（注册用户）接口。
 *
 * POST   { action: 'register' | 'login', username, password, nick? }
 * GET    → 当前登录用户 + 站点访问策略（注册开关 / 访问模式）
 * DELETE → 登出（清 cookie）
 *
 * 与 /api/auth（站长密码）是两套独立机制：
 * - 这里发的 cookie 是 ltv_user，只代表「普通注册用户」；
 * - 后台仍只认 ltv_session（PASSWORD）。
 */

function clientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

function cookieSecure(req: Request): boolean {
  if (process.env.COOKIE_SECURE === 'true') return true;
  if (process.env.COOKIE_SECURE === 'false') return false;
  return (req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ?? 'http') === 'https';
}

function attachSession(
  res: NextResponse,
  req: Request,
  user: { id: string; role: 'user' | 'admin' }
): NextResponse {
  const { token, expiresAt } = signUserSession(user);
  res.cookies.set(USER_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure(req),
    maxAge: Math.floor((expiresAt - Date.now()) / 1000),
    path: '/',
  });
  return res;
}

export async function GET(req: Request) {
  const settings = getSettings();
  const cur = currentUserFromRequest(req);
  /**
   * 站长态必须在这里一起下发。
   *
   * AccessProvider 的 refresh() 打的就是这个接口，之前它拿不到站长登录态，
   * 于是「站长登录成功」只活在弹窗的 toast 里：顶栏还显示「登录」、
   * 设置抽屉还要再登一次、/admin 的 AdminGate 又弹一遍密码。
   * 站长 cookie 是 ltv_session，这里用同一套签名校验判定。
   */
  const adminLoggedIn = Boolean(sessionFromCookieHeader(req.headers.get('cookie')));
  return NextResponse.json({
    ok: true,
    loggedIn: Boolean(cur),
    user: cur ? toPublic(cur.user) : null,
    adminLoggedIn,
    accessMode: settings.accessMode,
    allowRegister: settings.allowRegister,
    siteName: settings.siteName || null,
    slogan: settings.slogan || null,
    banner: settings.banner || null,
  });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: '请求格式不正确' }, { status: 400 });
  }

  const action = String(body.action || '');
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const ip = clientIp(req);

  // 登录与注册共用同一套限流（按 IP，10 次 / 10 分钟）
  if (!checkRateLimit(`user:${ip}`)) {
    return NextResponse.json({ error: '尝试次数过多，请 10 分钟后再试' }, { status: 429 });
  }

  if (action === 'register') {
    const settings = getSettings();
    if (!settings.allowRegister) {
      return NextResponse.json({ error: '本站当前未开放注册，请联系站长开通账号' }, { status: 403 });
    }
    const created = await createUser({
      username,
      password,
      nick: typeof body.nick === 'string' ? body.nick : undefined,
      role: 'user',
      ip,
    });
    if (!created.ok) {
      return NextResponse.json({ error: created.error }, { status: 400 });
    }
    clearRateLimit(`user:${ip}`);
    const full = findUserByName(created.user.username);
    const res = NextResponse.json({ ok: true, user: created.user });
    // 注册即登录，省一次输入
    return attachSession(res, req, full ?? { id: created.user.id, role: 'user' });
  }

  if (action === 'login') {
    const user = findUserByName(username);
    // 统一错误文案，避免暴露「用户名是否存在」
    const invalid = NextResponse.json({ error: '用户名或密码不正确' }, { status: 401 });
    if (!user || !verifyPassword(password, user.hash)) return invalid;
    if (user.disabled) {
      return NextResponse.json({ error: '这个账号已被停用，请联系站长' }, { status: 403 });
    }
    clearRateLimit(`user:${ip}`);
    await touchLogin(user.id, ip);
    const res = NextResponse.json({ ok: true, user: toPublic(user) });
    return attachSession(res, req, user);
  }

  return NextResponse.json({ error: `未知操作：${action}` }, { status: 400 });
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(USER_SESSION_COOKIE, '', { httpOnly: true, maxAge: 0, path: '/' });
  return res;
}
