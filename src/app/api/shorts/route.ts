import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getSiteData } from '@/lib/site-data';

export const runtime = 'nodejs';

/**
 * 私密短剧（/shorts）口令校验 + 内容下发。
 *
 * 为什么独立于 PASSWORD：
 * 短剧是「给特定人看的补充内容」，普通访客不该被它拦住主站；反过来站长也不想
 * 让拿到主站密码的人自动看到短剧。所以单独一个 SHORTS_PASSWORD，独立签名 cookie。
 *
 * 安全要点：
 * - 口令只在服务端比对（timingSafeEqual，避免长度/字节差异泄露）；
 * - 校验通过后下发 HMAC 签名 cookie（httpOnly + sameSite=lax + 7 天），
 *   cookie 里只有过期时间戳和签名，不含口令本身；
 * - 视频地址仅在 cookie 有效时才随响应返回，页面 HTML 里没有任何片源。
 */

const COOKIE = 'ltv_shorts';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

function secret(): string {
  // 用独立密钥；没配就退化到主密码，保证「配了 SHORTS_PASSWORD 就能用」
  return process.env.SHORTS_SECRET || process.env.SHORTS_PASSWORD || process.env.PASSWORD || 'ltv-shorts';
}

function sign(exp: number): string {
  return createHmac('sha256', secret()).update(`shorts:${exp}`).digest('hex');
}

function verifyCookie(raw: string | undefined): boolean {
  if (!raw) return false;
  const [expStr, sig] = raw.split('.');
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const expect = sign(exp);
  if (!sig || sig.length !== expect.length) return false;
  try {
    return timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expect, 'hex'));
  } catch {
    return false;
  }
}

function sameSecret(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** 内容清单：站长在 .data/site.json 的 shorts 字段维护（可选扩展字段） */
function readItems(): unknown[] {
  const data = getSiteData() as unknown as { shorts?: unknown };
  return Array.isArray(data.shorts) ? (data.shorts as unknown[]) : [];
}

export async function GET() {
  const configured = Boolean(process.env.SHORTS_PASSWORD);
  if (!configured) {
    return NextResponse.json({ error: '站长还没配置短剧口令（SHORTS_PASSWORD）' }, { status: 503 });
  }
  const jar = await cookies();
  if (!verifyCookie(jar.get(COOKIE)?.value)) {
    return NextResponse.json({ error: '需要口令' }, { status: 401 });
  }
  return NextResponse.json({ ok: true, items: readItems() });
}

export async function POST(req: Request) {
  const expected = process.env.SHORTS_PASSWORD;
  if (!expected) {
    return NextResponse.json({ error: '站长还没配置短剧口令（SHORTS_PASSWORD）' }, { status: 503 });
  }

  let body: { password?: unknown };
  try {
    body = (await req.json()) as { password?: unknown };
  } catch {
    return NextResponse.json({ error: '请求格式不正确' }, { status: 400 });
  }

  const input = typeof body.password === 'string' ? body.password : '';
  if (!input || !sameSecret(input, expected)) {
    // 简单的失败延迟，压一下暴力猜测
    await new Promise((r) => setTimeout(r, 400));
    return NextResponse.json({ error: '口令不对' }, { status: 401 });
  }

  const exp = Date.now() + TTL_MS;
  const res = NextResponse.json({ ok: true, items: readItems() });
  res.cookies.set(COOKIE, `${exp}.${sign(exp)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(TTL_MS / 1000),
  });
  return res;
}
