'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Header } from '@/components/header';
import { BottomTabs } from '@/components/bottom-tabs';
import { ServiceSheet } from '@/components/service-sheet';
import { WatchHistoryList, WatchListPanel } from '@/components/mine-panels';
import { SiteFooter } from '@/components/site-footer';
import { cn } from '@/lib/utils';

/**
 * 「我的」页：对应原站 view-mine。
 * 上半是观看记录 / 待看 两个 tab（数据来自本地 IndexedDB，不上传服务器），
 * 下半是服务区（求片 / 赞赏 / 通知 / 短剧 / 下载 / 电视版 / 后台）。
 *
 * 原站这里用 localStorage（换设备就没了），LibreTV 本来就有 IndexedDB 历史库，
 * 直接复用，能力更强且不丢数据。
 */
export default function MinePage() {
  return (
    <Suspense>
      <MineContent />
    </Suspense>
  );
}

function MineContent() {
  const params = useSearchParams();
  const router = useRouter();
  const rawTab = params.get('tab');
  // 求片查询有独立页面（/mine/request），顶栏的 /mine?tab=request 直接转过去
  useEffect(() => {
    if (rawTab === 'request') router.replace('/mine/request');
  }, [rawTab, router]);
  const tab = rawTab === 'list' ? 'list' : 'history';

  return (
    <div className="min-h-screen pb-16 sm:pb-0">
      <Header />

      <main className="max-w-6xl mx-auto px-4 py-4">
        {/* 头像 + 标题：与原站 .mine-top 对齐 */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-accent to-[#0060ff] text-on-accent font-bold flex items-center justify-center text-lg">
            我
          </div>
          <div>
            <div className="text-base font-semibold text-content">我的观影</div>
            <div className="text-xs text-faint">记录只存在这台设备，不上传服务器</div>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-4">
          {[
            { key: 'history', label: '观看记录' },
            { key: 'list', label: '待看' },
          ].map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => router.push(`/mine?tab=${t.key}`, { scroll: false })}
              className={cn(
                'rounded-full px-3 py-1.5 text-sm transition-colors',
                tab === t.key
                  ? 'bg-accent text-on-accent font-medium'
                  : 'bg-chip text-muted hover:text-content'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'history' ? <WatchHistoryList /> : <WatchListPanel />}

        <div className="mt-6">
          <h2 className="text-sm font-semibold text-content mb-2.5 flex items-center gap-2">
            <i className="w-0.5 h-3.5 rounded-full bg-accent" aria-hidden />
            服务
          </h2>
          <ServiceSheet />
        </div>
      </main>

      <SiteFooter />
      <BottomTabs />
    </div>
  );
}
