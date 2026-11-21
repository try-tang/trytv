import { NextResponse } from 'next/server';
import { isPasswordConfigured, sessionFromCookieHeader } from './auth';
import { currentUserFromRequest } from './users';
import { getSettings, type AccessMode } from './site-data';

/**
 * API Route 共享守卫。
 *
 * 与上游的差别：上游只有一个「PASSWORD 必填」的硬门槛；这里按后台的
 * 「站点设置 → 访问模式」决定放不放行：
 *
 * - open（默认）：所有人可看，和上游未设密码时的行为一致；
 * - login：注册用户 或 站长密码均可；
 * - members：只认本站账号，站长密码也不能替代（给「想做会员站但自己还能进后台」的场景）。
 *
 * 注意：无论哪种模式，**后台接口（/api/admin、/api/publish 等）仍然只认站长密码**，
 * 见 guardAdmin()。注册用户永远进不了后台。
 */

/** 当前请求的访问者身份 */
export type AccessActor =
  | { kind: 'admin' }
  | { kind: 'user'; uid: string; username: string }
  | { kind: 'guest' };

export function currentActor(req: Pick<Request, 'headers'>): AccessActor {
  if (sessionFromCookieHeader(req.headers.get('cookie'))) return { kind: 'admin' };
  const cur = currentUserFromRequest(req);
  if (cur) return { kind: 'user', uid: cur.user.id, username: cur.user.username };
  return { kind: 'guest' };
}

/** 该身份在指定访问策略下能不能看内容 */
export function actorAllowed(actor: AccessActor, mode: AccessMode): boolean {
  if (mode === 'open') return true;
  if (mode === 'login') return actor.kind !== 'guest';
  return actor.kind === 'user' || actor.kind === 'admin';
}

/** 内容接口守卫：按访问模式放行；未通过返回 401 */
export function guardRequest(req: Request): NextResponse | null {
  const mode = getSettings().accessMode;
  if (mode === 'open') return null;
  const actor = currentActor(req);
  if (actorAllowed(actor, mode)) return null;
  return NextResponse.json(
    {
      error: mode === 'members' ? '请先注册并登录本站账号' : '请先登录后再访问',
      need: mode === 'members' ? 'register' : 'login',
      accessMode: mode,
    },
    { status: 401 }
  );
}

/** 后台守卫：只认站长密码（PASSWORD），与访问模式无关 */
export function guardAdmin(req: Request): NextResponse | null {
  if (!isPasswordConfigured()) {
    return NextResponse.json(
      { error: '服务器未设置 PASSWORD 环境变量' },
      { status: 503 }
    );
  }
  if (!sessionFromCookieHeader(req.headers.get('cookie'))) {
    return NextResponse.json({ error: '未登录', need: 'admin' }, { status: 401 });
  }
  return null;
}

export function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}
