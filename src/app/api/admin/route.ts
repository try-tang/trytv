import { NextResponse } from 'next/server';
import { guardRequest } from '@/lib/api-guard';
import {
  listAllTips,
  listRequests,
  removeRequest,
  removeTip,
  setNotice,
  stats,
  updateRequest,
  updateTip,
} from '@/lib/site-data';

export const runtime = 'nodejs';

/**
 * 管理端互动数据接口（/admin 页面用）。
 *
 * 鉴权复用 LibreTV 原有的 PASSWORD + httpOnly 签名 cookie（guardRequest），
 * 不额外引一套用户体系——单站长场景这就够了。
 *
 * GET  ?res=stats|requests|tips|all
 * POST { action: 'request.status' | 'request.reply' | 'request.delete'
 *              | 'tip.status' | 'tip.delete'
 *              | 'notice.save', ... }
 */

export async function GET(req: Request) {
  const guarded = guardRequest(req);
  if (guarded) return guarded;

  const res = new URL(req.url).searchParams.get('res') || 'all';

  if (res === 'stats') return NextResponse.json({ ok: true, stats: stats() });
  if (res === 'requests') return NextResponse.json({ ok: true, requests: listRequests() });
  if (res === 'tips') return NextResponse.json({ ok: true, tips: listAllTips() });

  return NextResponse.json({
    ok: true,
    stats: stats(),
    requests: listRequests(),
    tips: listAllTips(),
  });
}

export async function POST(req: Request) {
  const guarded = guardRequest(req);
  if (guarded) return guarded;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: '请求格式不正确' }, { status: 400 });
  }

  const action = String(body.action || '');
  const id = typeof body.id === 'string' ? body.id : '';

  switch (action) {
    case 'request.status': {
      const status = body.status;
      if (status !== 'pending' && status !== 'done' && status !== 'rejected') {
        return NextResponse.json({ error: '状态不合法' }, { status: 400 });
      }
      const item = await updateRequest(id, { status });
      return item ? NextResponse.json({ ok: true, item }) : NextResponse.json({ error: '没找到这条求片' }, { status: 404 });
    }

    case 'request.reply': {
      const item = await updateRequest(id, { reply: String(body.reply ?? '') });
      return item ? NextResponse.json({ ok: true, item }) : NextResponse.json({ error: '没找到这条求片' }, { status: 404 });
    }

    case 'request.delete': {
      const ok = await removeRequest(id);
      return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: '没找到这条求片' }, { status: 404 });
    }

    case 'tip.status': {
      const status = body.status;
      if (status !== 'pending' && status !== 'shown' && status !== 'hidden') {
        return NextResponse.json({ error: '状态不合法' }, { status: 400 });
      }
      const item = await updateTip(id, status);
      return item ? NextResponse.json({ ok: true, item }) : NextResponse.json({ error: '没找到这条留言' }, { status: 404 });
    }

    case 'tip.delete': {
      const ok = await removeTip(id);
      return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: '没找到这条留言' }, { status: 404 });
    }

    case 'notice.save': {
      const notice = await setNotice({
        body: typeof body.body === 'string' ? body.body : undefined,
        enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
      });
      return NextResponse.json({ ok: true, notice });
    }

    default:
      return NextResponse.json({ error: `未知操作：${action}` }, { status: 400 });
  }
}
