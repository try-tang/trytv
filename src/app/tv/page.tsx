'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState } from '@/components/states';
import { SmartImage } from '@/components/smart-image';
import { api } from '@/lib/client-api';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import type { DoubanItem } from '@/lib/types';

/**
 * 电视版（对应原站 /tv）。
 *
 * 目标站的 tv 版是给大屏/遥控器用的：超大字号、无滚动、方向键焦点、左右翻页。
 * 这里按同样的思路实现，但数据复用 `/api/douban`，点击后跳到普通搜索，
 * 需要播放再走常规播放页——大屏与移动端共用同一套播放能力，不做第二套播放器。
 *
 * 交互设计（键盘）：
 * - ← → 切换分类　↑ ↓ 换片　Enter 搜索该片　Esc 退出
 * 焦点用本地 state 管理，不依赖浏览器的默认 tab 顺序，遥控器体验更稳。
 */

const TV_TABS = [
  { key: 'movie-hot', label: '电影', type: 'movie' as const, tag: '热门' },
  { key: 'movie-score', label: '高分', type: 'movie' as const, tag: '豆瓣高分' },
  { key: 'tv-hot', label: '剧集', type: 'tv' as const, tag: '热门' },
  { key: 'tv-cn', label: '国剧', type: 'tv' as const, tag: '国产剧' },
  { key: 'tv-anime', label: '动画', type: 'tv' as const, tag: '日本动画' },
  { key: 'tv-variety', label: '综艺', type: 'tv' as const, tag: '综艺' },
];

const COLS = 6;
const ROWS = 2;
const PER_PAGE = COLS * ROWS;

export default function TvPage() {
  return (
    <Suspense>
      <TvContent />
    </Suspense>
  );
}

function TvContent() {
  const store = useAppStore();
  const [tabIdx, setTabIdx] = useState(0);
  const [focus, setFocus] = useState(0);
  const [page, setPage] = useState(0);
  const [pool, setPool] = useState<DoubanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [hint, setHint] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  const tab = TV_TABS[tabIdx] ?? TV_TABS[0];

  // 取 3 页做本地池子，翻页不必反复请求
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const pages = await Promise.all(
        [0, PER_PAGE, PER_PAGE * 2].map((start) => api.douban(tab.type, tab.tag, start, PER_PAGE)),
      );
      setPool(pages.flatMap((p) => p.items ?? []));
      setPage(0);
      setFocus(0);
      setFailedIds(new Set());
    } catch {
      setPool([]);
    } finally {
      setLoading(false);
    }
  }, [tab.type, tab.tag]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => pool.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE), [pool, page]);
  const totalPages = Math.max(1, Math.ceil(pool.length / PER_PAGE));

  const go = useCallback((title: string) => {
    window.location.href = `/?s=${encodeURIComponent(title)}`;
  }, []);

  const moveFocus = useCallback(
    (next: number) => {
      if (next < 0) {
        // 翻到上一页
        if (page > 0) {
          setPage((p) => p - 1);
          setFocus(visible.length - 1);
        }
        return;
      }
      if (next >= visible.length) {
        if (page < totalPages - 1) {
          setPage((p) => p + 1);
          setFocus(0);
        }
        return;
      }
      setFocus(next);
    },
    [page, totalPages, visible.length],
  );

  // 键盘 / 遥控器
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          moveFocus(focus + 1);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          moveFocus(focus - 1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          moveFocus(focus + COLS);
          break;
        case 'ArrowUp':
          e.preventDefault();
          moveFocus(focus - COLS);
          break;
        case 'Enter': {
          const item = visible[focus];
          if (item) go(item.title);
          break;
        }
        case 'PageDown':
        case ']':
          setPage((p) => Math.min(totalPages - 1, p + 1));
          setFocus(0);
          break;
        case 'PageUp':
        case '[':
          setPage((p) => Math.max(0, p - 1));
          setFocus(0);
          break;
        case 'q':
        case 'Q':
          setTabIdx((i) => (i + 1) % TV_TABS.length);
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focus, moveFocus, visible, go, totalPages]);

  // 焦点变化时把卡片滚进可视区
  useEffect(() => {
    const el = wrapRef.current?.querySelector<HTMLElement>(`[data-idx="${focus}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [focus]);

  // 顶部提示定时淡出
  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(''), 2600);
    return () => clearTimeout(t);
  }, [hint]);

  return (
    <div ref={wrapRef} className="min-h-screen flex flex-col">
      {/* 大屏顶栏：站名 + 分类 + 时钟 */}
      <div className="px-6 py-4 flex items-center gap-4 shrink-0">
        <span className="text-xl font-bold text-content tracking-tight">电视版</span>
        <div className="flex gap-2 overflow-x-auto scrollbar-thin">
          {TV_TABS.map((t, i) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setTabIdx(i);
                setPage(0);
                setFocus(0);
              }}
              className={cn(
                'shrink-0 rounded-full px-4 py-1.5 text-base transition-colors',
                i === tabIdx ? 'bg-accent text-on-accent font-semibold' : 'bg-chip text-muted',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-sm text-faint">
          第 {page + 1}/{totalPages} 页
        </span>
      </div>

      <main className="flex-1 px-6 pb-4">
        {loading ? (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
            {Array.from({ length: PER_PAGE }).map((_, i) => (
              <div key={i} className="aspect-[2/3] rounded-xl bg-card animate-pulse" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState icon="tv" title="这个分类暂时没有内容" description="换个分类看看？" />
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
            {visible.map((item, i) => (
              <button
                key={item.id}
                data-idx={i}
                type="button"
                onMouseEnter={() => setFocus(i)}
                onClick={() => go(item.title)}
                className={cn(
                  'group relative rounded-xl overflow-hidden outline-none transition-all',
                  i === focus ? 'ring-4 ring-accent scale-[1.02]' : 'ring-0',
                )}
              >
                <div className="relative aspect-[2/3] bg-chip">
                  {failedIds.has(item.id) ? (
                    <div className="w-full h-full flex items-center justify-center px-2 text-center text-sm text-faint">
                      {item.title}
                    </div>
                  ) : (
                    <SmartImage
                      url={item.cover}
                      mode={store.imageProxyMode}
                      customProxy={store.customImageProxy}
                      alt={item.title}
                      className="w-full h-full object-cover"
                      onExhausted={() => setFailedIds((prev) => new Set(prev).add(item.id))}
                    />
                  )}
                  {item.rating && (
                    <span className="absolute top-1.5 right-1.5 rounded bg-black/75 px-1.5 text-sm font-semibold text-warning">
                      {item.rating}
                    </span>
                  )}
                </div>
                <p
                  className={cn(
                    'mt-1.5 text-center text-base truncate transition-colors',
                    i === focus ? 'text-accent font-medium' : 'text-muted',
                  )}
                >
                  {item.title}
                </p>
              </button>
            ))}
          </div>
        )}
      </main>

      {hint && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-chip border border-line px-4 py-2 text-sm text-content shadow-lg">
          {hint}
        </div>
      )}

      <div className="px-6 pb-4 text-center text-xs text-faint shrink-0">
        ← → ↑ ↓ 选择 · Enter 搜索 · [ ] 翻页 · Q 换分类
      </div>
    </div>
  );
}
