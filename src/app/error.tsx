'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ErrorState } from '@/components/states';
import { SITE } from '@/lib/site';

/**
 * 路由段级错误边界：捕获页面渲染/数据异常，避免落到 Next 默认英文白屏。
 * 刻意不放 Header——它依赖 zustand store，若异常源正是 store 会二次崩溃。
 *
 * 把错误原文显示出来：线上「页面出了点问题」这种一句话提示等于没提示，
 * 站长截图就能定位，不用再让用户去开控制台。
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [detail, setDetail] = useState(false);

  console.error(`[${SITE.name}] 页面渲染异常:`, error);

  const message = error instanceof Error ? error.message : String(error || '');
  const chunkError = /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module/i.test(
    message
  );

  /**
   * 重新部署后 chunk 哈希全变，旧的 index.html 引用的 JS 已经 404，
   * 客户端路由到新页面就会抛 ChunkLoadError。这种错误重试 `reset()` 没用
   * （同一个旧 chunk 还是取不到），必须整页硬刷新。这里自动做一次，并记标记防循环。
   */
  useEffect(() => {
    if (!chunkError) return;
    const KEY = 'ltv-chunk-reload';
    try {
      const last = Number(sessionStorage.getItem(KEY) || 0);
      if (Date.now() - last < 10_000) return; // 刚刷过还错，说明不是版本错位，别刷成死循环
      sessionStorage.setItem(KEY, String(Date.now()));
    } catch {
      /* 隐私模式忽略 */
    }
    window.location.reload();
  }, [chunkError]);

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <ErrorState
            message={
              chunkError
                ? '页面代码没加载全，请刷新一次（若反复出现，请清掉缓存或联系站长）'
                : '页面出了点问题，请重试。若持续失败请返回首页。'
            }
            onRetry={reset}
            retryLabel="重试"
          />
          <div className="mt-2 text-center">
            <button
              type="button"
              onClick={() => setDetail((v) => !v)}
              className="text-[11px] text-faint hover:text-muted transition-colors"
            >
              {detail ? '收起原因' : '查看原因'}
            </button>
            {detail && (
              <pre className="mt-2 text-left text-[11px] leading-relaxed text-faint bg-card border border-line rounded-lg p-3 whitespace-pre-wrap break-all">
                {message || '(没有错误信息)'}
                {error.digest ? `\n\ndigest: ${error.digest}` : ''}
              </pre>
            )}
          </div>
        </div>
      </main>
      <footer className="border-t border-line py-4">
        <p className="text-center text-xs text-faint">
          问题持续存在？{' '}
          <Link href="/" className="hover:text-accent">
            返回首页
          </Link>
        </p>
      </footer>
    </div>
  );
}
