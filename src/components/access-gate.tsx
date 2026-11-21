'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/icon';
import { useAccess } from '@/components/access';
import { useAuth } from '@/components/auth';
import { SITE } from '@/lib/site';

/**
 * 访问门槛提示（客户端兜底）。
 *
 * middleware 已经会把未登录访客重定向到 /login，这里的价值有两个：
 * 1. 站点被切成 login / members 的瞬间，已经打开的页面（SPA 内跳转）要立刻挡住；
 * 2. 后台接口改成 guardAdmin 之后，注册用户误入 /admin 需要一个清楚的说法。
 */
export function AccessGate({ children }: { children: React.ReactNode }) {
  const { ready, gated, accessMode } = useAccess();
  const pathname = usePathname();
  const { openLogin } = useAuth();

  // 未就绪时先渲染内容骨架，避免闪一下「请登录」再变回内容
  if (!ready) return <>{children}</>;
  if (!gated) return <>{children}</>;
  // /login 自己不能被挡
  if (pathname === '/login') return <>{children}</>;

  const members = accessMode === 'members';
  const next = encodeURIComponent(pathname || '/');

  return (
    <div className="min-h-[100dvh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <div className="w-14 h-14 rounded-2xl bg-chip flex items-center justify-center mx-auto">
          <Icon name="user" className="w-6 h-6 text-accent" />
        </div>
        <h1 className="mt-4 text-base font-semibold text-content">
          {members ? '本站仅对会员开放' : '请先登录'}
        </h1>
        <p className="mt-2 text-sm text-muted leading-relaxed">
          {members
            ? '站长把本站设置为「仅注册用户可看」，请注册账号后再来。'
            : '登录后即可观看，站长也可用站长密码直接进入。'}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Link href={`/login?next=${next}`} className="btn-primary">
            {members ? '去注册 / 登录' : '去登录'}
          </Link>
          <button type="button" className="btn-ghost" onClick={openLogin}>
            用站长密码登录
          </button>
        </div>
        <p className="mt-4 text-[11px] text-faint">{SITE.name}</p>
      </div>
    </div>
  );
}
