'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/header';
import { SiteFooter } from '@/components/site-footer';
import { BottomTabs } from '@/components/bottom-tabs';
import { ServiceSheet } from '@/components/service-sheet';
import { requestApi } from '@/lib/site-client';
import type { RequestEntry } from '@/lib/site-data';
import { cn } from '@/lib/utils';

/**
 * 「我的求片」页（/mine?tab=request）。
 *
 * 求片是匿名的，所以身份就是用户自己填的昵称：本地记住昵称（localStorage），
 * 打开页面自动按昵称拉一次，也能换昵称查别人提交的（站长不介意，反正内容公开可读）。
 *
 * 服务端 `/api/request?nick=` 只返回公开字段，不会把后台的处理备注透出去。
 */

const NICK_KEY = 'kan_kan_request_nick';

const STATUS_TEXT: Record<RequestEntry['status'], string> = {
  pending: '排队中',
  done: '已收录',
  rejected: '暂不提供',
};

const STATUS_CLASS: Record<RequestEntry['status'], string> = {
  pending: 'bg-chip text-muted',
  done: 'bg-accent/15 text-accent',
  rejected: 'bg-chip text-faint',
};

export default function MineRequestPage() {
  return <MineRequestContent />;
}

function MineRequestContent() {
  const router = useRouter();

  const [nick, setNick] = useState('');
  const [items, setItems] = useState<RequestEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const query = useCallback(async (target: string) => {
    const n = target.trim();
    if (!n) {
      setError('先填一个提交时用过的昵称');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await requestApi.mine(n);
      setItems(res.items);
      window.localStorage.setItem(NICK_KEY, n);
    } catch {
      setError('查询失败，稍后再试');
    } finally {
      setLoading(false);
    }
  }, []);

  // 首次：用上次记住的昵称自动查一次
  useEffect(() => {
    const saved = (typeof window !== 'undefined' && window.localStorage.getItem(NICK_KEY)) || '';
    if (saved) {
      setNick(saved);
      void query(saved);
    }
  }, [query]);

  return (
    <div className="min-h-screen pb-16 sm:pb-0">
      <Header />

      <main className="max-w-3xl mx-auto px-4 py-5">
        <div className="flex items-center gap-2 mb-4">
          <button
            type="button"
            className="chip"
            onClick={() => router.push('/mine', { scroll: false })}
          >
            ‹ 我的
          </button>
          <h1 className="text-base font-semibold text-content">我的求片</h1>
        </div>

        <form
          className="flex gap-2 mb-4"
          onSubmit={(e) => {
            e.preventDefault();
            void query(nick);
          }}
        >
          <input
            className="input flex-1"
            placeholder="提交求片时填的昵称"
            value={nick}
            maxLength={20}
            onChange={(e) => setNick(e.target.value)}
          />
          <button type="submit" className="btn-primary btn-sm" disabled={loading}>
            {loading ? '查询中…' : '查询'}
          </button>
        </form>

        {error && <p className="text-xs text-danger mb-3">{error}</p>}

        {items && items.length === 0 && (
          <div className="rounded-lg border border-line bg-card px-4 py-8 text-center">
            <p className="text-sm text-muted">这个昵称下还没有求片记录</p>
            <p className="text-xs text-faint mt-1">去「服务 → 求片」提交一条，回来就能看到进度</p>
          </div>
        )}

        {items && items.length > 0 && (
          <ul className="space-y-2">
            {items.map((it) => (
              <li key={it.id} className="rounded-lg border border-line bg-card px-3.5 py-3">
                <div className="flex items-start gap-2">
                  <span className="flex-1 text-sm text-content break-all">{it.title}</span>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-[11px]',
                      STATUS_CLASS[it.status]
                    )}
                  >
                    {STATUS_TEXT[it.status]}
                  </span>
                </div>
                {it.note && <p className="text-xs text-faint mt-1 break-all">{it.note}</p>}
                {it.reply && (
                  <p className="text-xs text-accent mt-1 break-all">站长回复：{it.reply}</p>
                )}
                <p className="text-[11px] text-faint mt-1.5">
                  {new Date(it.createdAt).toLocaleString('zh-CN', { hour12: false })}
                </p>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-8">
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
