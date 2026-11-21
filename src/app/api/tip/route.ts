import { NextResponse } from 'next/server';
import { addTip, listPublicTips } from '@/lib/site-data';

export const runtime = 'nodejs';

/**
 * 赞赏留言接口（对应原站 tip-modal / tipwall-modal）。
 * POST 提交留言；GET 返回留言墙（只返回站长核对过、状态为 shown 的条目）。
 *
 * 说明：金额只是「用户自报」，不与支付网关对接——原站也是同样的做法
 * （扫码付款后在弹窗里填昵称/金额/留言，站长后台核对后上墙）。
 * 想接真实支付，把 POST 里的 status 改成由支付回调写入即可。
 */
export async function POST(req: Request) {
  let body: { amount?: unknown; nick?: unknown; content?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: '请求格式不正确' }, { status: 400 });
  }

  const amount = Math.floor(Number(body.amount));
  if (!Number.isFinite(amount) || amount < 1 || amount > 9999) {
    return NextResponse.json({ error: '金额需在 1 - 9999 之间' }, { status: 400 });
  }

  const nick = typeof body.nick === 'string' ? body.nick.trim() : '';
  const content = typeof body.content === 'string' ? body.content.trim() : '';

  const item = await addTip({ amount, nick: nick || undefined, content: content || undefined });
  return NextResponse.json({ ok: true, item });
}

export async function GET() {
  const { total, items } = listPublicTips();
  return NextResponse.json({
    ok: true,
    total,
    items: items.map((t) => ({
      id: t.id,
      nick: t.nick || '匿名',
      amount: t.amount,
      content: t.content || '',
      createdAt: t.createdAt,
    })),
  });
}
