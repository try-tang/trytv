import { NextResponse } from 'next/server';
import { guardRequest, jsonError } from '@/lib/api-guard';
import { getLibrary, setLibrary } from '@/lib/site-data';
import { currentUserFromRequest } from '@/lib/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 观影记录 / 待看清单的账号云同步。
 *
 * 用注册账号（/api/user 的会话 cookie）作为归属，站长密码不算——
 * 站长密码是「管理站点」的凭据，不该顺便带上一份观影记录。
 *
 * GET  → { ok, library }：服务端还没存过就是 null（客户端据此判断「认领本地记录」）
 * POST → 整包覆盖，{ history: [...], watchlist: [...] }
 *
 * 数据落在 `.data/site.json` 的 `library.<uid>`，与站点其它业务数据同一个文件，
 * 备份这个文件就等于把所有账号的记录一起备了。
 */

const MAX_HISTORY = 500;
const MAX_WATCH = 300;

interface HistoryItem {
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
}

interface WatchItem {
  id: string;
  title: string;
  pic?: string;
  sourceKey?: string;
  vodId?: string;
  addedAt: number;
}

const str = (v: unknown, max = 200): string => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function normalizeHistory(input: unknown): HistoryItem[] {
  if (!Array.isArray(input)) return [];
  const out: HistoryItem[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const id = str(r.id, 300);
    const title = str(r.title, 200);
    if (!id || !title) continue;
    out.push({
      id,
      sourceKey: str(r.sourceKey, 80),
      sourceUrl: str(r.sourceUrl, 500) || undefined,
      vodId: str(r.vodId, 80),
      title,
      pic: str(r.pic, 800) || undefined,
      episodeIndex: Math.max(0, Math.floor(num(r.episodeIndex))),
      totalEpisodes: Math.max(0, Math.floor(num(r.totalEpisodes))),
      playbackPosition: Math.max(0, num(r.playbackPosition)),
      duration: Math.max(0, num(r.duration)),
      timestamp: Math.max(0, num(r.timestamp)),
    });
    if (out.length >= MAX_HISTORY) break;
  }
  return out;
}

function normalizeWatch(input: unknown): WatchItem[] {
  if (!Array.isArray(input)) return [];
  const out: WatchItem[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const id = str(r.id, 300);
    const title = str(r.title, 200);
    if (!id || !title) continue;
    out.push({
      id,
      title,
      pic: str(r.pic, 800) || undefined,
      sourceKey: str(r.sourceKey, 80) || undefined,
      vodId: str(r.vodId, 80) || undefined,
      addedAt: Math.max(0, num(r.addedAt)),
    });
    if (out.length >= MAX_WATCH) break;
  }
  return out;
}

export async function GET(req: Request) {
  // 开放浏览（open）模式下也允许读自己的记录，所以这里按访问策略放行即可
  const guard = guardRequest(req);
  if (guard) return guard;
  const cur = currentUserFromRequest(req);
  if (!cur) return NextResponse.json({ ok: true, library: null });
  return NextResponse.json(
    { ok: true, library: getLibrary(cur.user.id) },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(req: Request) {
  const guard = guardRequest(req);
  if (guard) return guard;
  const cur = currentUserFromRequest(req);
  if (!cur) return jsonError('登录后才能同步观影记录', 401);

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return jsonError('请求体不是合法 JSON', 400);
  }
  const raw = (body || {}) as Record<string, unknown>;
  const history = normalizeHistory(raw.history);
  const watchlist = normalizeWatch(raw.watchlist);
  const saved = await setLibrary(cur.user.id, { history, watchlist });
  return NextResponse.json({ ok: true, count: saved.history.length, watchlist: saved.watchlist.length });
}
