'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Header } from '@/components/header';
import { BottomTabs } from '@/components/bottom-tabs';
import { SiteFooter } from '@/components/site-footer';
import { Icon } from '@/components/icon';
import { EmptyState } from '@/components/states';
import { SmartImage } from '@/components/smart-image';
import { api, ApiError } from '@/lib/client-api';
import { useToast } from '@/components/toast';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import type { DoubanItem } from '@/lib/types';

/**
 * 榜单页（对应原站 view-rank）。
 *
 * 数据口径：
 * - 「周榜」走 LibreTV 已有的 `/api/hot-list`（60s 聚合的豆瓣周榜 + 百度热播剧），
 *   一次返回整榜、天然带名次，适合做 Top N；
 * - 「豆瓣分类」走 `/api/douban`，支持翻页，适合做长列表。
 *
 * 原站自己爬了一份 doubanGroups（9 个电影 list + 12 个题材 chart），这里不重复造轮子：
 * 两种口径在同一页用 tab 呈现，用户感知一致，维护成本低得多。
 */

interface WeeklyTab {
  key: string;
  label: string;
  /** /api/hot-list 的 id */
  listId: string;
}

interface TagTab {
  key: string;
  label: string;
  type: 'movie' | 'tv';
  tag: string;
}

const WEEKLY_TABS: WeeklyTab[] = [
  { key: 'w-movie', label: '豆瓣电影周榜', listId: 'douban_movie_weekly' },
  { key: 'w-tv-cn', label: '华语剧集榜', listId: 'douban_tv_chinese' },
  { key: 'w-tv-global', label: '海外剧集榜', listId: 'douban_tv_global' },
  { key: 'w-show-cn', label: '华语综艺榜', listId: 'douban_show_chinese' },
  { key: 'w-show-global', label: '海外综艺榜', listId: 'douban_show_global' },
  { key: 'w-baidu', label: '百度热播剧', listId: 'baidu_teleplay' },
];

const TAG_TABS: TagTab[] = [
  { key: 't-movie-hot', label: '电影热门', type: 'movie', tag: '热门' },
  { key: 't-movie-score', label: '电影高分', type: 'movie', tag: '豆瓣高分' },
  { key: 't-movie-new', label: '电影最新', type: 'movie', tag: '最新' },
  { key: 't-movie-classic', label: '经典影片', type: 'movie', tag: '经典' },
  { key: 't-tv-hot', label: '剧集热门', type: 'tv', tag: '热门' },
  { key: 't-tv-cn', label: '国产剧', type: 'tv', tag: '国产剧' },
  { key: 't-tv-us', label: '美剧', type: 'tv', tag: '美剧' },
  { key: 't-tv-kr', label: '韩剧', type: 'tv', tag: '韩剧' },
  { key: 't-tv-anime', label: '日本动画', type: 'tv', tag: '日本动画' },
  { key: 't-tv-variety', label: '综艺', type: 'tv', tag: '综艺' },
];

const PAGE_SIZE = 24;

export default function RankPage() {
  return (
    <Suspense>
      <RankContent />
    </Suspense>
  );
}

function RankContent() {
  const params = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const store = useAppStore();

  const activeKey = params.get('tab') || WEEKLY_TABS[0].key;
  const weekly = WEEKLY_TABS.find((t) => t.key === activeKey);
  const tagTab = TAG_TABS.find((t) => t.key === activeKey);
  const mode: 'weekly' | 'tag' = weekly ? 'weekly' : 'tag';
  const listId = weekly?.listId ?? '';
  const tagType = tagTab?.type ?? 'movie';
  const tagName = tagTab?.tag ?? '热门';

  const [items, setItems] = useState<DoubanItem[]>([]);
  const [pageStart, setPageStart] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());

  // 快速切 tab 时用序号丢弃过期响应
  const reqRef = useRef(0);

  const load = useCallback(
    async (start: number, replace: boolean) => {
      const seq = ++reqRef.current;
      if (replace) {
        setLoading(true);
        setError(null);
      } else {
        setLoadingMore(true);
      }
      try {
        if (mode === 'weekly') {
          const res = await api.hotList(listId);
          if (seq !== reqRef.current) return;
          setItems(res.items ?? []);
          setHasMore(false);
          setPageStart(0);
        } else {
          const res = await api.douban(tagType, tagName, start, PAGE_SIZE);
          if (seq !== reqRef.current) return;
          setPageStart(start + (res.items?.length ?? 0));
          // 豆瓣推荐接口不返回总数：这一页装满就认为还有下一页
          setHasMore((res.items?.length ?? 0) >= PAGE_SIZE);
          setItems((prev) => (replace ? res.items : [...prev, ...res.items]));
        }
      } catch (e) {
        if (seq !== reqRef.current) return;
        const msg = e instanceof ApiError ? e.message : '加载失败，请稍后重试';
        setError(msg);
        if (!replace) toast(msg, 'error');
      } finally {
        if (seq === reqRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [mode, listId, tagType, tagName, toast],
  );

  useEffect(() => {
    setItems([]);
    setPageStart(0);
    setHasMore(false);
    void load(0, true);
  }, [activeKey, load]);

  const selectTab = (key: string) => router.replace(`/rank?tab=${key}`, { scroll: false });

  /**
   * 点卡片 -> 直接把片名丢进首页搜索。
   * 这里不弹 DetailModal：豆瓣条目没有 sourceKey/vodId，详情弹窗拿它查不到任何源，
   * 必然报错，所以榜单条目一律跳搜索。
   */
  const pickTitle = useCallback(
    (title: string) => {
      router.push(`/?s=${encodeURIComponent(title)}`);
    },
    [router],
  );

  const tabs = useMemo(
    () => [
      ...WEEKLY_TABS.map((t) => ({ key: t.key, label: t.label })),
      ...TAG_TABS.map((t) => ({ key: t.key, label: t.label })),
    ],
    [],
  );

  return (
    <div className="min-h-screen pb-16 sm:pb-0">
      <Header />

      <main className="max-w-6xl mx-auto px-4 py-4">
        <div className="flex items-baseline justify-between mb-3">
          <h1 className="text-lg font-semibold text-content flex items-center gap-2">
            <i className="w-0.5 h-4 rounded-full bg-accent" aria-hidden />
            榜单
          </h1>
          {items.length > 0 && <span className="text-xs text-faint">已加载 {items.length} 部</span>}
        </div>

        <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-2 -mx-4 px-4">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => selectTab(tab.key)}
              className={cn(
                'shrink-0 rounded-full px-3 py-1.5 text-sm transition-colors',
                tab.key === activeKey
                  ? 'bg-accent text-on-accent font-medium'
                  : 'bg-chip text-muted hover:text-content',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-3">
          {loading ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="aspect-[2/3] rounded-lg bg-card animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <EmptyState
              icon="alert"
              title="榜单没拉下来"
              description={error}
              action={
                <button type="button" className="btn-primary btn-sm" onClick={() => void load(0, true)}>
                  重试
                </button>
              }
            />
          ) : items.length === 0 ? (
            <EmptyState icon="chart" title="这个榜单暂时没有内容" description="换个榜单看看？" />
          ) : (
            <>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                {items.map((item, idx) => (
                  <button
                    key={`${item.id}-${idx}`}
                    type="button"
                    onClick={() => pickTitle(item.title)}
                    className="group text-left"
                  >
                    <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-chip">
                      {failedIds.has(item.id) ? (
                        <div className="w-full h-full flex items-center justify-center px-1 text-center text-[11px] text-faint">
                          {item.title}
                        </div>
                      ) : (
                        <SmartImage
                          url={item.cover}
                          mode={store.imageProxyMode}
                          customProxy={store.customImageProxy}
                          alt={item.title}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                          onExhausted={() => setFailedIds((prev) => new Set(prev).add(item.id))}
                        />
                      )}
                      <span
                        className={cn(
                          'absolute top-1 left-1 min-w-[20px] h-5 px-1 rounded text-[11px] font-semibold flex items-center justify-center',
                          idx < 3 ? 'bg-warning text-black' : 'bg-black/70 text-white/85',
                        )}
                      >
                        {idx + 1}
                      </span>
                      {item.rating && (
                        <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[11px] font-semibold text-warning">
                          {item.rating}
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 text-xs text-muted truncate group-hover:text-content transition-colors">
                      {item.title}
                    </p>
                  </button>
                ))}
              </div>

              <div className="mt-5 flex justify-center">
                {mode === 'tag' &&
                  (hasMore ? (
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      disabled={loadingMore}
                      onClick={() => void load(pageStart, false)}
                    >
                      {loadingMore ? (
                        '加载中…'
                      ) : (
                        <>
                          加载更多
                          <Icon name="arrowDown" className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  ) : (
                    <span className="text-xs text-faint">已经到底了</span>
                  ))}
                {mode === 'weekly' && <span className="text-xs text-faint">周榜每周更新</span>}
              </div>
            </>
          )}
        </div>
      </main>

      <SiteFooter />
      <BottomTabs />
    </div>
  );
}
