'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Header } from '@/components/header';
import { BottomTabs } from '@/components/bottom-tabs';
import { SiteFooter } from '@/components/site-footer';
import { ServiceSheet } from '@/components/service-sheet';
import { HomeRowSection } from '@/components/home-hero';
import { useSearchHistory } from '@/components/search-history';
import { SITE, HOME_ROWS } from '@/lib/site';
import { cn } from '@/lib/utils';

/**
 * 独立搜索页（对应原站 view-search）。
 *
 * 首页的 `?s=` 已经是完整搜索结果页，这里做的是「搜索入口页」：
 * - 没有关键词时：搜索历史 + 热门搜索词 + 片单引流，顶栏放大镜跳过来不会是空白页；
 * - 有关键词时：直接跳转到首页的 `?s=`，搜索结果 UI 只维护一套，避免两边走样。
 */

const HOT_WORDS = ['沙丘', '庆余年', '三体', '繁花', '流浪地球', '琅琊榜', '请回答1988', '进击的巨人'];

export default function SearchPage() {
  return (
    <Suspense>
      <SearchContent />
    </Suspense>
  );
}

function SearchContent() {
  const params = useSearchParams();
  const router = useRouter();
  const urlQuery = (params.get('q') || params.get('s') || '').trim();

  const [input, setInput] = useState(urlQuery);
  const searchHistory = useSearchHistory(input);
  // 历史是异步查询：直接读 matches，不再拷一份到本地 state（少一次同步、少一个 effect）
  const historyList = searchHistory.matches;

  // 带关键词进来 → 交给首页结果页
  useEffect(() => {
    if (urlQuery) router.replace(`/?s=${encodeURIComponent(urlQuery)}`);
  }, [urlQuery, router]);

  // 只依赖稳定的几个方法，避免把整个 searchHistory 对象塞进依赖数组
  const { close: closeHistory, record: recordHistory } = searchHistory;
  const go = useCallback(
    (text: string) => {
      const q = text.trim().slice(0, 100);
      if (!q) return;
      closeHistory();
      recordHistory(q);
      router.push(`/?s=${encodeURIComponent(q)}`);
    },
    [router, closeHistory, recordHistory],
  );

  if (urlQuery) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-faint">正在跳转到搜索结果…</div>;
  }

  return (
    <div className="min-h-screen pb-16 sm:pb-0">
      <Header showSearch />

      <main className="max-w-6xl mx-auto px-4 pt-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            go(input);
          }}
          className="flex items-center gap-2"
        >
          <input
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              searchHistory.resetActive();
            }}
            onFocus={searchHistory.onFocus}
            placeholder={SITE.searchPlaceholder}
            className="input flex-1"
            enterKeyHint="search"
            autoFocus
          />
          <button type="submit" className="btn-primary">
            搜索
          </button>
        </form>

        {historyList.length > 0 && (
          <section className="mt-5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-content">最近搜索</h2>
              <button
                type="button"
                onClick={() => void searchHistory.clearAll()}
                className="text-xs text-faint hover:text-danger transition-colors"
              >
                清空
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {historyList.map((h) => (
                <button
                  key={h.text}
                  type="button"
                  onClick={() => go(h.text)}
                  className="chip bg-chip text-muted hover:text-content hover:bg-hover border border-line py-1.5 px-3"
                >
                  {h.text}
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="mt-5">
          <h2 className="text-sm font-semibold text-content mb-2">热门搜索</h2>
          <div className="flex flex-wrap gap-2">
            {HOT_WORDS.map((w, i) => (
              <button
                key={w}
                type="button"
                onClick={() => go(w)}
                className={cn(
                  'chip border py-1.5 px-3',
                  i < 3
                    ? 'border-accent/40 bg-accent/10 text-accent'
                    : 'border-line bg-chip text-muted hover:text-content hover:bg-hover',
                )}
              >
                {w}
              </button>
            ))}
          </div>
        </section>

        <div className="mt-6">
          {HOME_ROWS.map((row) => (
            <HomeRowSection key={row.key} row={row} onPick={go} />
          ))}
        </div>

        <div className="mt-8">
          <ServiceSheet />
        </div>
      </main>

      <SiteFooter />
      <BottomTabs />
    </div>
  );
}
