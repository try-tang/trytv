'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, removeHistory, clearAllHistory, type HistoryEntry } from '@/lib/db';
import { Icon } from './icon';
import { cn } from '@/lib/utils';
import { schedulePush, writeLocalWatchlist } from '@/lib/watch-sync';
import { EmptyState } from './states';
import { SmartImage } from './smart-image';
import { useAppStore } from '@/lib/store';

/**
 * 「我的」页的两个列表。
 *
 * - 观看记录：直接读 LibreTV 原有的 IndexedDB history 表（本来就是本地存储、
 *   不上传服务器，与目标站「记录只存在这台设备」的承诺一致）。
 * - 待看：原站用 localStorage 存一个数组；这里同样落在本地，但放进 IndexedDB，
 *   免得清缓存之外的情况丢数据，也便于和播放页共享。
 */

const WATCHLIST_KEY = 'watchlist_items';

export interface WatchItem {
  id: string;
  title: string;
  pic?: string;
  sourceKey?: string;
  vodId?: string;
  addedAt: number;
}

/** 待看列表：读写本地 localStorage（键名与原站一致，方便迁移） */
export function readWatchlist(): WatchItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(WATCHLIST_KEY) || '[]';
    const parsed = JSON.parse(raw) as WatchItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeWatchlist(items: WatchItem[]): void {
  // 与 src/lib/watch-sync.ts 共用同一份实现（同一个 localStorage 键），
  // 避免两边格式漂移导致「登录同步后本地反而读不到」。
  writeLocalWatchlist(items);
}

/** 加入/移出待看，返回加入后的状态 */
export function toggleWatch(item: Omit<WatchItem, 'addedAt'>): boolean {
  const list = readWatchlist();
  const idx = list.findIndex((i) => i.id === item.id);
  if (idx >= 0) {
    list.splice(idx, 1);
    writeWatchlist(list);
    // 已登录时顺手推一份到服务端（未登录时 syncer 会静默跳过）
    schedulePush();
    return false;
  }
  list.unshift({ ...item, addedAt: Date.now() });
  writeWatchlist(list);
  schedulePush();
  return true;
}

export function inWatchlist(id: string): boolean {
  return readWatchlist().some((i) => i.id === id);
}

// —— 观看记录 ——

export function WatchHistoryList() {
  const entries = useLiveQuery(() => db.history.orderBy('timestamp').reverse().toArray(), []);

  if (entries === undefined) {
    return <div className="h-40 rounded-lg bg-card animate-pulse" />;
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        icon="clock"
        title="还没有观看记录"
        description="随便点一部片开始看，进度会自动记在这台设备上。"
        action={
          <Link href="/" className="btn-primary btn-sm">
            去首页看看
          </Link>
        }
      />
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-faint">{entries.length} 条记录</span>
        <button
          type="button"
          onClick={() => {
            if (window.confirm('确定清空全部观看记录？')) void clearAllHistory();
          }}
          className="text-xs text-faint hover:text-danger transition-colors"
        >
          清空
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        {entries.map((entry) => (
          <HistoryCard key={entry.id} entry={entry} />
        ))}
      </div>
    </>
  );
}

function HistoryCard({ entry }: { entry: HistoryEntry }) {
  const imageProxyMode = useAppStore((s) => s.imageProxyMode);
  const customImageProxy = useAppStore((s) => s.customImageProxy);
  const percent =
    entry.duration > 0 ? Math.min(100, Math.round((entry.playbackPosition / entry.duration) * 100)) : 0;

  return (
    <div className="group relative">
      <Link
        href={`/watch?source=${encodeURIComponent(entry.sourceKey)}&id=${encodeURIComponent(entry.vodId)}${
          entry.sourceUrl ? `&url=${encodeURIComponent(entry.sourceUrl)}` : ''
        }&index=${entry.episodeIndex}`}
        className="block"
      >
        <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-chip">
          {entry.pic ? (
            <SmartImage
              url={entry.pic}
              mode={imageProxyMode}
              customProxy={customImageProxy}
              alt={entry.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[11px] text-faint px-1 text-center">
              {entry.title}
            </div>
          )}
          {percent > 0 && (
            <div className="absolute bottom-0 inset-x-0 h-1 bg-black/50">
              <div className="h-full bg-accent" style={{ width: `${percent}%` }} />
            </div>
          )}
          <span className="absolute top-1 right-1 rounded bg-black/70 text-white/85 text-[11px] px-1 py-0.5">
            第 {entry.episodeIndex + 1} 集
          </span>
        </div>
        <p className="mt-1.5 text-xs text-muted truncate group-hover:text-content transition-colors">
          {entry.title}
        </p>
      </Link>
      <button
        type="button"
        aria-label="删除这条记录"
        onClick={() => void removeHistory(entry.sourceKey, entry.vodId)}
        className="absolute top-1 left-1 w-6 h-6 rounded-full bg-black/60 text-white/80 text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
      >
        ✕
      </button>
    </div>
  );
}

// —— 待看 ——

export function WatchListPanel() {
  const [items, setItems] = useState<WatchItem[]>([]);
  const imageProxyMode = useAppStore((s) => s.imageProxyMode);
  const customImageProxy = useAppStore((s) => s.customImageProxy);

  const reload = useCallback(() => setItems(readWatchlist()), []);

  useEffect(() => {
    reload();
    // 其它标签页/组件改了待看，这里同步
    const onStorage = (e: StorageEvent) => {
      if (e.key === WATCHLIST_KEY) reload();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [reload]);

  if (items.length === 0) {
    return (
      <EmptyState
        icon="star"
        title="待看还是空的"
        description="在播放器里点「加入待看」，收藏的片子会出现在这里。"
      />
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-faint">{items.length} 部待看</span>
        <button
          type="button"
          onClick={() => {
            if (window.confirm('确定清空待看列表？')) {
              writeWatchlist([]);
              schedulePush();
              reload();
            }
          }}
          className="text-xs text-faint hover:text-danger transition-colors"
        >
          清空
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        {items.map((item) => (
          <div key={item.id} className="group relative">
            <Link
              href={
                item.sourceKey && item.vodId
                  ? `/watch?source=${encodeURIComponent(item.sourceKey)}&id=${encodeURIComponent(item.vodId)}&title=${encodeURIComponent(item.title)}`
                  : `/?s=${encodeURIComponent(item.title)}`
              }
              className="block"
            >
              <div className="aspect-[2/3] rounded-lg overflow-hidden bg-chip">
                {item.pic ? (
                  <SmartImage
                    url={item.pic}
                    mode={imageProxyMode}
                    customProxy={customImageProxy}
                    alt={item.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[11px] text-faint px-1 text-center">
                    {item.title}
                  </div>
                )}
              </div>
              <p className="mt-1.5 text-xs text-muted truncate group-hover:text-content transition-colors">
                {item.title}
              </p>
            </Link>
            <button
              type="button"
              aria-label="移出待看"
              onClick={() => {
                toggleWatch({ id: item.id, title: item.title });
                reload();
              }}
              className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
            >
              <Icon name="close" className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

/** 播放器里用的收藏按钮（原站 play-modal 的「☆ 加入待看」） */
export function WatchToggleButton({ item, className }: { item: Omit<WatchItem, 'addedAt'>; className?: string }) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(inWatchlist(item.id));
  }, [item.id]);

  return (
    <button
      type="button"
      onClick={() => setActive(toggleWatch(item))}
      className={cn('chip', active ? 'text-warning' : 'text-muted hover:text-content', className)}
      aria-pressed={active}
    >
      <Icon name={active ? 'starFilled' : 'star'} className="w-3.5 h-3.5" />
      {active ? '已加入待看' : '加入待看'}
    </button>
  );
}
