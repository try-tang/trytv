import { NextResponse } from 'next/server';
import { addRequest, listRequests } from '@/lib/site-data';

export const runtime = 'nodejs';

/**
 * 求片接口。
 * POST 提交（片名必填），GET 查进度：
 *  - ?nick=xxx 查自己提交过的
 *  - ?scope=latest 取最新若干条（首页/我的页的「大家都在求」）
 *
 * 与 LibreTV 其它接口不同，这里**不需要登录**：求片是匿名用户的核心诉求，
 * 加登录墙等于没人用。防滥用靠字段裁剪 + 长度上限 + 客户端友好提示。
 */
export async function POST(req: Request) {
  let body: { title?: unknown; note?: unknown; nick?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: '请求格式不正确' }, { status: 400 });
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return NextResponse.json({ error: '片名不能为空' }, { status: 400 });
  if (title.length > 60) return NextResponse.json({ error: '片名太长' }, { status: 400 });

  const note = typeof body.note === 'string' ? body.note.trim() : '';
  const nick = typeof body.nick === 'string' ? body.nick.trim() : '';

  const item = await addRequest({ title, note: note || undefined, nick: nick || undefined });
  return NextResponse.json({ ok: true, item });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const nick = (url.searchParams.get('nick') || '').trim();
  const scope = url.searchParams.get('scope');
  const all = listRequests();

  if (scope === 'latest') {
    // 公开列表只给片名/状态/时间，不泄露昵称与备注
    return NextResponse.json({
      ok: true,
      items: all.slice(0, 20).map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        createdAt: r.createdAt,
      })),
    });
  }

  if (!nick) return NextResponse.json({ error: '缺少昵称' }, { status: 400 });

  const mine = all.filter((r) => r.nick === nick).slice(0, 50);
  return NextResponse.json({ ok: true, items: mine });
}
