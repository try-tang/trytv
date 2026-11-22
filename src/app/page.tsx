'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Header } from '@/components/header';
import { SectionBoundary } from '@/components/section-boundary';
import { HomeHero, HomeRowSection } from '@/components/home-hero';
import { DetailModal } from '@/components/detail-modal';
import { AggregatedCard, aggregateResults } from '@/components/video-card';
import { useAppStore, isInDisabledSubscription, isSourceDisabled } from '@/lib/store';
import { api } from '@/lib/client-api';
import type { SearchResultItem, SourceSearchOutcome } from '@/lib/types';
import { useSearchHistory } from '@/components/search-history';
import { HOME_ROWS } from '@/lib/site';
import { validateSourceUrl } from '@/lib/utils';
import { EmptyState } from '@/components/states';
import { SiteFooter } from '@/components/site-footer';
import { BottomTabs } from '@/components/bottom-tabs';

/**
 * 首页：大 banner 轮播 + 豆瓣横滑榜单 + 搜索。
 *
 * 改造自 LibreTV 的 page.tsx：原有搜索逻辑（URL ?s= 驱动、服务端流式聚合、
 * 失败源提示、分批渲染）全部保留，在此基础上按目标站补了 hero 轮播与横滑板块，
 * 并把「搜索」当成首页内的一个状态（?s= 有值即展示结果），与原站一致。
 */
/** 搜索结果分批渲染的批大小：一次挂载上千张卡片会明显掉帧 */
const RESULT_PAGE_SIZE = 60;

export default function HomePage() {
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  );
}

function HomeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlQuery = searchParams.get('s') || '';
  // 精确订阅所需字段（对齐 live 页的做法）：搜索流式期间逐源写健康度、
  // 打开设置抽屉/历史面板等无关 store 变化，都不应触发首页整树重渲染
  const customAPIs = useAppStore((s) => s.customAPIs);
  const envSources = useAppStore((s) => s.envSources);
  const yellowFilter = useAppStore((s) => s.yellowFilter);
  const [input, setInput] = useState(urlQuery);
  const [detailItem, setDetailItem] = useState<SearchResultItem | null>(null);
  /** 流式搜索中已结算的源：全部源 settle 之前先给用户一个「几个源已回」的进度 */
  const [streamedOutcomes, setStreamedOutcomes] = useState<SourceSearchOutcome[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // URL 驱动搜索：?s= 变化时回填输入框
  useEffect(() => {
    if (urlQuery) setInput(urlQuery);
  }, [urlQuery]);

  // 源名回显：失败/停用提示里显示友好名称而非裸 key
  const sourceName = (key: string) => {
    const all = [...customAPIs, ...envSources];
    return all.find((s) => s.key === key)?.name || key;
  };

  // 生效源：勾选且有地址，且满足「订阅归属/单源停用/黄色过滤」三类约束
  const activeSources = useAppStore((s) => {
    const all = [...s.customAPIs, ...s.envSources];
    const byKey = new Map(all.map((src) => [src.key, src]));
    return s.selectedKeys
      .map((k) => byKey.get(k))
      .filter((src): src is NonNullable<typeof src> => Boolean(src && validateSourceUrl(src.url)))
      .filter(
        (src) =>
          !isInDisabledSubscription(s, src.key) &&
          !isSourceDisabled(s, src.key) &&
          (!s.yellowFilter || !src.isAdult)
      );
  });

  const searchQuery = useQuery({
    queryKey: ['search', urlQuery, activeSources.map((s) => s.key).join(','), yellowFilter],
    enabled: Boolean(urlQuery) && activeSources.length > 0,
    queryFn: async ({ signal }) => {
      // api.search(wd, sources, filterAdult, opts)：源逐条回流时用 onSource 增量渲染
      return api.search(urlQuery, activeSources, yellowFilter, {
        signal,
        onSource: (outcome) => setStreamedOutcomes((prev) => [...prev, outcome]),
      });
    },
    retry: false,
  });

  useEffect(() => {
    if (!urlQuery) setStreamedOutcomes([]);
  }, [urlQuery]);

  // 搜索历史：与顶栏共用同一套逻辑（最近 10 条）
  const searchHistory = useSearchHistory(input);

  // 按「/」聚焦搜索框（与原站一致），输入法组合期间不拦
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const submit = (text: string) => {
    const q = text.trim().slice(0, 100);
    if (!q) return;
    searchHistory.close();
    router.push(`/?s=${encodeURIComponent(q)}`, { scroll: false });
    searchHistory.record(q);
  };

  /** hero / 榜单卡片点击：直接把片名丢进搜索（原站也是这个行为） */
  const pickTitle = useCallback(
    (title: string) => {
      setInput(title);
      submit(title);
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const searching = Boolean(urlQuery);
  const failures = searchQuery.data?.failures ?? [];
  const allItems: SearchResultItem[] = searchQuery.data?.list ?? [];
  const [visible, setVisible] = useState(RESULT_PAGE_SIZE);

  useEffect(() => {
    setVisible(RESULT_PAGE_SIZE);
  }, [urlQuery]);

  useEffect(() => {
    if (!searching) return;
    const onScroll = () => {
      if (visible >= allItems.length) return;
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 900) {
        setVisible((v) => Math.min(v + RESULT_PAGE_SIZE, allItems.length));
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [searching, visible, allItems.length]);

  const aggregated = aggregateResults(allItems.slice(0, visible));

  return (
    <div className="min-h-screen pb-16 sm:pb-0">
      <Header showSearch searchInputRef={inputRef} />

      {!searching && (
        <main className="pb-6">
          {/* 每个区块单独兜底：豆瓣接口抖动只影响自己那一段，不再整页报错 */}
          <SectionBoundary name="首页轮播">
            <HomeHero onPick={pickTitle} />
          </SectionBoundary>

          <div className="max-w-6xl mx-auto">
            {HOME_ROWS.map((row) => (
              <SectionBoundary key={row.key} name={row.label}>
                <HomeRowSection row={row} onPick={pickTitle} />
              </SectionBoundary>
            ))}
          </div>
        </main>
      )}

      {searching && (
        <main className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-base font-semibold text-content">
              「{urlQuery}」的搜索结果
              {searchQuery.isSuccess && (
                <span className="ml-2 text-xs font-normal text-faint">
                  共 {aggregated.length} 条
                </span>
              )}
            </h2>
            <button
              type="button"
              onClick={() => {
                setInput('');
                router.push('/', { scroll: false });
              }}
              className="btn-ghost btn-sm"
            >
              收起
            </button>
          </div>

          {/* 失败源提示：非阻塞，单个源挂掉不影响其它源的结果 */}
          {failures.length > 0 && (
            <div className="mb-3 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
              {failures.length} 个源暂时不可用：
              {failures.slice(0, 4).map((f) => sourceName(f.sourceKey)).join('、')}
              {failures.length > 4 && ` 等 ${failures.length} 个`}
            </div>
          )}

          {activeSources.length === 0 && (
            <EmptyState
              icon="link"
              title="还没有可用的片源"
              description="到设置里勾选数据源，或者添加你自己的采集站接口。"
            />
          )}

          {searchQuery.isLoading && streamedOutcomes.length > 0 && (
            <p className="mb-2 text-xs text-faint">
              已回 {streamedOutcomes.length}/{activeSources.length} 个源，边回边显示…
            </p>
          )}

          {searchQuery.isLoading && (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="aspect-[2/3] rounded-lg bg-card animate-pulse" />
              ))}
            </div>
          )}

          {!searchQuery.isLoading && aggregated.length === 0 && activeSources.length > 0 && (
            <EmptyState
              icon="search"
              title="没搜到这个片"
              description="可以换个别名再试，或者点下面的「求片」告诉站长。"
            />
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {aggregated.map((group) => (
              <AggregatedCard
                key={group.key}
                group={group}
                onOpen={(detail) => setDetailItem(detail)}
                sources={activeSources}
              />
            ))}
          </div>

          {visible < allItems.length && (
            <div className="py-6 text-center text-xs text-faint">
              滚动加载更多（{visible}/{allItems.length}）
            </div>
          )}
        </main>
      )}

      <DetailModal item={detailItem} onClose={() => setDetailItem(null)} />

      <SiteFooter />
      <BottomTabs />
    </div>
  );
}
