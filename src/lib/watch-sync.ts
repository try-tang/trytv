'use client';

import { authFetch } from './auth-client';

/**
 * 观影记录 / 待看清单的「按账号同步」。
 *
 * 本站的观看记录与收藏一直存在浏览器（Dexie / localStorage），换设备或清缓存就没了。
 * 登录之后把它们整体同步到服务端（`.data/site.json` 的 `library.<uid>`），
 * 之后每次改动再增量推一次；换一台设备登录同一个账号，拉回来就是自己的记录。
 *
 * 设计取舍：
 * - 服务端只做「整包覆盖」，不做逐条 diff。记录条目量级是百级，整包几 KB，
 *   实现简单且不会因为时间戳漂移打架；
 * - 同步是「尽力而为」：任何网络/权限失败都只 console.warn，绝不影响本地使用；
 * - 没登录就没有 userId，所有写入都是本地行为（与原 LibreTV 一致）。
 */

export interface SyncHistoryItem {
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

export interface SyncWatchItem {
  id: string;
  title: string;
  pic?: string;
  sourceKey?: string;
  vodId?: string;
  addedAt: number;
}

export interface SyncBundle {
  history: SyncHistoryItem[];
  watchlist: SyncWatchItem[];
  updatedAt: number;
}

const WATCHLIST_KEY = 'watchlist_items';
const PUSH_DEBOUNCE_MS = 2500;

/** 本地待看清单（与 mine-panels.tsx 共用同一个 localStorage 键） */
export function readLocalWatchlist(): SyncWatchItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(WATCHLIST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as SyncWatchItem[]) : [];
  } catch {
    return [];
  }
}

export function writeLocalWatchlist(items: SyncWatchItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(items));
  } catch {
    /* 隐私模式下写不进去，忽略 */
  }
}

/** 本地观看记录（Dexie 的 history 表，按时间倒序） */
async function readLocalHistory(): Promise<SyncHistoryItem[]> {
  try {
    const { db } = await import('./db');
    const rows = await db.history.orderBy('timestamp').reverse().toArray();
    return rows.map((r) => ({
      id: r.id,
      sourceKey: r.sourceKey,
      sourceUrl: r.sourceUrl,
      vodId: r.vodId,
      title: r.title,
      pic: r.pic,
      episodeIndex: r.episodeIndex,
      totalEpisodes: r.totalEpisodes,
      playbackPosition: r.playbackPosition,
      duration: r.duration,
      timestamp: r.timestamp,
    }));
  } catch {
    return [];
  }
}

async function readLocalBundle(): Promise<SyncBundle> {
  return {
    history: await readLocalHistory(),
    watchlist: readLocalWatchlist(),
    updatedAt: Date.now(),
  };
}

/** 拉服务端已保存的同步包（未登录时服务端返回 null） */
export async function fetchRemoteBundle(): Promise<SyncBundle | null> {
  try {
    const data = await authFetch<{ ok: boolean; library: SyncBundle | null }>('/api/library');
    return data.library ?? null;
  } catch {
    return null;
  }
}

/** 把本地整包推到服务端 */
export async function pushBundle(bundle?: SyncBundle): Promise<boolean> {
  try {
    const payload = bundle ?? (await readLocalBundle());
    await authFetch<{ ok: boolean }>('/api/library', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return true;
  } catch (err) {
    console.warn('[同步] 上传观影记录失败（不影响本地使用）:', err);
    return false;
  }
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;

/** 改动后调用：2.5 秒内的多次改动合并成一次上传 */
export function schedulePush(): void {
  if (typeof window === 'undefined') return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void pushBundle();
  }, PUSH_DEBOUNCE_MS);
}

/**
 * 登录后调用一次：
 * - 服务端没有记录 → 把本地推上去（这次登录就是「认领」本地记录）；
 * - 服务端有记录 → 两边合并（按条目 id 去重，取时间戳更新的那条），
 *   合并结果同时写回服务端与本地，避免「换了设备就看不到老记录」。
 */
export async function syncAfterLogin(): Promise<{ merged: boolean; count: number }> {
  const local = await readLocalBundle();
  const remote = await fetchRemoteBundle();
  if (!remote) {
    const ok = await pushBundle(local);
    return { merged: false, count: ok ? local.history.length : 0 };
  }

  const historyMap = new Map<string, SyncHistoryItem>();
  for (const item of remote.history) historyMap.set(item.id, item);
  for (const item of local.history) {
    const prev = historyMap.get(item.id);
    if (!prev || item.timestamp >= prev.timestamp) historyMap.set(item.id, item);
  }
  const history = Array.from(historyMap.values())
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 500);

  const watchMap = new Map<string, SyncWatchItem>();
  for (const item of remote.watchlist) watchMap.set(item.id, item);
  for (const item of local.watchlist) {
    const prev = watchMap.get(item.id);
    if (!prev || (item.addedAt ?? 0) >= (prev.addedAt ?? 0)) watchMap.set(item.id, item);
  }
  const watchlist = Array.from(watchMap.values()).sort(
    (a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0)
  );

  writeLocalBundle(history, watchlist);
  await pushBundle({ history, watchlist, updatedAt: Date.now() });
  return { merged: true, count: history.length };
}

/** 把合并结果写回本地（Dexie + localStorage） */
function writeLocalBundle(history: SyncHistoryItem[], watchlist: SyncWatchItem[]): void {
  writeLocalWatchlist(watchlist);
  void (async () => {
    try {
      const { db } = await import('./db');
      await db.transaction('rw', db.history, async () => {
        for (const item of history) {
          await db.history.put({
            id: item.id,
            sourceKey: item.sourceKey,
            sourceUrl: item.sourceUrl,
            vodId: item.vodId,
            title: item.title,
            pic: item.pic,
            episodeIndex: item.episodeIndex,
            totalEpisodes: item.totalEpisodes,
            playbackPosition: item.playbackPosition,
            duration: item.duration,
            timestamp: item.timestamp,
          });
        }
      });
    } catch (err) {
      console.warn('[同步] 写回本地观看记录失败:', err);
    }
  })();
}
