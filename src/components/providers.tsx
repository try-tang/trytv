'use client';

import { useQueryClient, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { ToastProvider } from './toast';
import { AuthProvider } from './auth';
import { AccessProvider } from './access';
import { ThemeProvider } from './theme';
import { GlobalDownloadManager } from './download-manager';
import { SectionBoundary } from './section-boundary';
import { useAppStore, hydrateLiveProbeResults } from '@/lib/store';
import { api, STATUS_QUERY_KEY } from '@/lib/client-api';
import { applyEnvPresets } from '@/lib/subscription-sync';

/**
 * 全局 Provider 树。
 *
 * 重要：这里给页面内容多包一层错误边界。AuthProvider / AccessProvider 内部
 * 任何一次未捕获异常都会把整页打成 error.tsx（用户看到的就是「页面出了点问题」），
 * 包一层之后至少能显示是哪个环节炸的，并且可以局部重试。
 */

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 60_000 },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          {/* 全站常驻：下载事件监听（enqueueDownload）依赖它存在——
              挂在 Header 里会让 /watch 等不渲染 Header 的页面派发的事件凭空丢失 */}
          <GlobalDownloadManager />
          <Boot />
          <AuthProvider>
            <AccessProvider>
              <SectionBoundary name="首屏初始化">{children}</SectionBoundary>
            </AccessProvider>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

/**
 * 首屏引导：恢复持久化配置 → 拉 /api/status → 应用环境变量预置的源。
 *
 * 全部 try/catch 兜住：任何一步失败都只是「预置数据没生效」，
 * 不应该让用户看到错误页。历史版本这里抛错会直接命中 error.tsx。
 * 渲染 null，不阻塞页面显示（不用等接口返回）。
 */
function Boot() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // store 配置了 skipHydration：等挂载后再读 localStorage，
      // 保证 hydration 阶段客户端与服务端渲染结果一致。
      try {
        await Promise.resolve(useAppStore.persist.rehydrate());
      } catch (err) {
        console.error('[首屏引导] 恢复本地配置失败，按默认值继续:', err);
      }
      if (cancelled) return;

      // 测活缓存从 IndexedDB 恢复（并顺带搬迁旧 localStorage 快照里的存量），
      // 与下方 /api/status 拉取互不依赖，失败静默
      void hydrateLiveProbeResults();

      // 拉取部署者通过 DEFAULT_SOURCES / DEFAULT_LIVE_SOURCES 预置的源（失败时静默忽略）
      // 与 AuthProvider 共用同一 query key，/api/status 全站只发一次
      try {
        const d = await queryClient.fetchQuery({
          queryKey: STATUS_QUERY_KEY,
          queryFn: () => api.status(),
        });
        if (!cancelled && d) await applyEnvPresets(d);
      } catch (err) {
        // 常见原因：站点切到 login/members 模式后部分接口 401、或首屏网络抖动。
        // 预置数据缺失不影响正常浏览与播放。
        console.warn('[首屏引导] 读取服务端状态失败（不影响页面浏览）:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [queryClient]);

  return null;
}
