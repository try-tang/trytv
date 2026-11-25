import { NextResponse } from 'next/server';
import { guardRequest } from '@/lib/api-guard';
import { checkLiveUrlAllowed, checkUpstreamAllowed, isValidProxyUrl } from '@/lib/ssrf';
import { fetchUpstream } from '@/lib/fetch-utils';
import { MAX_IMPORT_TEXT_BYTES, parseSourceText } from '@/lib/source-text-import';
import type { SourceListPayload, SubscriptionParseStats } from '@/lib/types';
import { withSkipped } from '@/lib/tvbox-parser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 视频源「文本/URL 导入」的解析接口。
 *
 * - POST { text }：贴进来的一段 JSON（TVBox 配置、LunaTV 的 api_site、我们导出的源列表、
 *   裸数组、单个源），只解析、不入库，返回候选清单给前端做预览勾选。
 * - GET ?url=…：先拉远程再按同一套规则解析。
 *
 * 为什么要走服务端：
 * 1. 前端跨域拉订阅会被 CORS 拦，只有服务端能拉；
 * 2. 解析结果要经过 SSRF 校验（内网地址、非 http 协议），这层判断必须放在能看见 DNS 的进程里；
 * 3. 解析器是纯函数，放服务端也方便以后做定时订阅刷新复用。
 *
 * 与 /api/source-list 的区别：那个是「订阅」入口（拉 URL 后直接入库），
 * 这个是「导入预览」入口（可贴文本、可文件），所以用 guardRequest（按站点访问策略）而不是 guardAdmin。
 */

/** 被 SSRF 校验拦下的条目也要计数，用户才知道「解析出 20 条却只返回 15 条」的原因 */
function rejectBlocked(
  sources: SourceListPayload['sources'],
  liveSources: SourceListPayload['liveSources']
): { sources: SourceListPayload['sources']; liveSources: SourceListPayload['liveSources']; dropped: number } {
  const okSources = sources.filter((s) => isValidProxyUrl(s.url));
  const okLive = liveSources.filter((s) => {
    // 同步过滤只做「形状」判断；真正的 DNS 校验在 URL 拉取阶段完成
    return /^https?:\/\//i.test(s.url);
  });
  return {
    sources: okSources,
    liveSources: okLive,
    dropped: sources.length - okSources.length + (liveSources.length - okLive.length),
  };
}

export async function POST(req: Request) {
  const guarded = guardRequest(req);
  if (guarded) return guarded;

  let body: { text?: unknown } = {};
  try {
    body = (await req.json()) as { text?: unknown };
  } catch {
    return NextResponse.json({ error: '请求体不是合法 JSON' }, { status: 400 });
  }
  const text = typeof body.text === 'string' ? body.text : '';
  if (!text.trim()) {
    return NextResponse.json({ error: '内容是空的，先粘贴或选择一个文件' }, { status: 400 });
  }
  if (Buffer.byteLength(text, 'utf8') > MAX_IMPORT_TEXT_BYTES) {
    return NextResponse.json({ error: '内容超过 2MB，请拆分后再导入' }, { status: 400 });
  }

  try {
    const parsed = parseSourceText(text);
    const checked = rejectBlocked(parsed.sources, parsed.liveSources);
    const stats: SubscriptionParseStats | undefined = withSkipped(
      parsed.stats,
      'invalidUrl',
      checked.dropped
    );
    if (checked.sources.length === 0 && checked.liveSources.length === 0) {
      return NextResponse.json(
        { error: `没有可导入的源：${parsed.note || '全部条目都被地址校验拦下了'}` },
        { status: 400 }
      );
    }
    return NextResponse.json({
      ok: true,
      format: parsed.format,
      name: parsed.name,
      note: parsed.note,
      sources: checked.sources,
      liveSources: checked.liveSources,
      stats,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '解析失败' },
      { status: 400 }
    );
  }
}

export async function GET(req: Request) {
  const guarded = guardRequest(req);
  if (guarded) return guarded;

  const target = (new URL(req.url).searchParams.get('url') || '').trim();
  if (!/^https?:\/\//i.test(target)) {
    return NextResponse.json({ error: '请输入 http(s) 开头的订阅地址' }, { status: 400 });
  }

  const verdict = await checkUpstreamAllowed(target);
  if (!verdict.ok) return NextResponse.json({ error: verdict.reason }, { status: 403 });

  try {
    const res = await fetchUpstream(target, {
      timeoutMs: 10_000,
      headers: { Accept: 'application/json, text/plain, */*' },
    });
    if (!res.ok) {
      return NextResponse.json({ error: `订阅地址返回 HTTP ${res.status}` }, { status: 502 });
    }
    const text = await res.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_IMPORT_TEXT_BYTES) {
      return NextResponse.json({ error: '订阅内容超过 2MB，请拆分后再导入' }, { status: 400 });
    }

    const parsed = parseSourceText(text);
    // 远程来源要真做 DNS 层校验（文本粘贴的来源也做，代价不高且更安全）
    const okSources: SourceListPayload['sources'] = [];
    for (const s of parsed.sources) {
      if (isValidProxyUrl(s.url)) okSources.push(s);
    }
    const okLive: SourceListPayload['liveSources'] = [];
    for (const s of parsed.liveSources) {
      if (!(await checkLiveUrlAllowed(s.url)).ok) continue;
      const epgOk = s.epg ? (await checkLiveUrlAllowed(s.epg)).ok : true;
      okLive.push(epgOk ? s : { ...s, epg: undefined });
    }

    const dropped =
      parsed.sources.length - okSources.length + (parsed.liveSources.length - okLive.length);
    const stats = withSkipped(parsed.stats, 'invalidUrl', dropped);
    if (okSources.length === 0 && okLive.length === 0) {
      return NextResponse.json(
        { error: `没有可导入的源：${parsed.note || '全部条目都被地址校验拦下了'}` },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      format: parsed.format,
      name: parsed.name,
      note: parsed.note,
      sources: okSources,
      liveSources: okLive,
      stats,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '订阅拉取失败' },
      { status: 502 }
    );
  }
}
