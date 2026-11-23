'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icon';
import { useAccess } from '@/components/access';
import { SITE } from '@/lib/site';
import { cn } from '@/lib/utils';

/**
 * 登录 / 注册页（/login）。
 *
 * 两个入口共用一页：
 * - 本站账号：注册用户登录，或新用户注册（是否允许由后台「站点设置」控制）；
 * - 站长密码：与弹窗里的访问验证是同一套 /api/auth，登录后能看内容 + 进后台。
 *
 * 访问模式是 open 时这个页面只是「可选登录」，登录后能记住观看记录归属；
 * 是 login / members 时，middleware 会把未登录访客重定向到这里。
 */

type Mode = 'login' | 'register' | 'admin';

function readParam(name: string): string | null {
  // 不用 useSearchParams：它会把整棵树推进 Suspense 降级，服务端渲染出来是空壳，
  // 未登录用户首屏看不到页签和表单。window 只在浏览器端存在，SSR 时返回 null。
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(name);
}

export default function LoginPage() {
  const router = useRouter();
  const [next, setNext] = useState('/');
  const { accessMode, allowRegister, user, admin, loginUser, registerUser, ready } = useAccess();

  // ?tab=admin 直接落在站长页签（后台「需要先登录」按钮带过来）
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nick, setNick] = useState('');
  const [adminPwd, setAdminPwd] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // 首帧后再读 URL 参数，避免 SSR 与客户端首次渲染不一致
  useEffect(() => {
    setNext(readParam('next') || '/');
    const tab = readParam('tab');
    if (tab === 'admin') setMode('admin');
    else if (tab === 'register') setMode('register');
  }, []);

  // 已是登录态（或整站不需要登录）就直接回目标页
  useEffect(() => {
    if (!ready) return;
    if (user || admin) router.replace(next);
  }, [ready, user, admin, next, router]);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (busy) return;
      setError('');
      setBusy(true);
      try {
        if (mode === 'admin') {
          const res = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: adminPwd }),
          });
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          if (!res.ok) throw new Error(data?.error || '密码错误');
          router.replace(next);
          router.refresh();
          return;
        }
        if (mode === 'register') {
          await registerUser(username, password, nick || undefined);
        } else {
          await loginUser(username, password);
        }
        router.replace(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : '操作失败');
      } finally {
        setBusy(false);
      }
    },
    [busy, mode, adminPwd, username, password, nick, next, router, registerUser, loginUser]
  );

  const tabs: { key: Mode; label: string; show: boolean }[] = [
    { key: 'login', label: '账号登录', show: true },
    { key: 'register', label: '注册', show: allowRegister },
    { key: 'admin', label: '站长密码', show: true },
  ];

  return (
    <div className="min-h-[100dvh] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl brand-gradient text-on-accent flex items-center justify-center text-xl font-bold mx-auto">
            {SITE.mark}
          </div>
          <h1 className="mt-3 text-lg font-semibold text-content">{SITE.name}</h1>
          <p className="mt-1 text-xs text-muted">
            {accessMode === 'open'
              ? '本站免登录即可观看，登录后可跨设备记住记录'
              : accessMode === 'members'
                ? '本站为会员制，请使用本站账号登录'
                : '请登录后观看'}
          </p>
        </div>

        <div className="rounded-xl border border-line bg-card p-4">
          <div className="flex gap-1.5 mb-4">
            {tabs
              .filter((t) => t.show)
              .map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => {
                    setMode(t.key);
                    setError('');
                  }}
                  className={cn(
                    'flex-1 rounded-lg px-2 py-1.5 text-xs transition-colors',
                    mode === t.key
                      ? 'bg-accent text-on-accent font-medium'
                      : 'bg-chip text-muted hover:text-content'
                  )}
                >
                  {t.label}
                </button>
              ))}
          </div>

          <form onSubmit={submit} className="space-y-2.5">
            {mode === 'admin' ? (
              <input
                type="password"
                value={adminPwd}
                onChange={(e) => setAdminPwd(e.target.value)}
                placeholder="站长密码（默认 admin）"
                autoComplete="current-password"
                className="input w-full"
              />
            ) : (
              <>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="用户名（3-20 位，小写字母/数字/_- .）"
                  autoComplete="username"
                  autoCapitalize="none"
                  className="input w-full"
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="密码（至少 6 位）"
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  className="input w-full"
                />
                {mode === 'register' && (
                  <input
                    value={nick}
                    onChange={(e) => setNick(e.target.value)}
                    placeholder="昵称（可选，用于留言墙显示）"
                    className="input w-full"
                  />
                )}
              </>
            )}

            {error && <p className="text-xs text-danger">{error}</p>}

            <button
              type="submit"
              className="btn-primary w-full"
              disabled={busy || (mode === 'admin' ? !adminPwd : !username || !password)}
            >
              {busy ? '处理中…' : mode === 'admin' ? '以站长身份进入' : mode === 'register' ? '注册并登录' : '登录'}
            </button>
          </form>

          {mode !== 'admin' && !allowRegister && (
            <p className="mt-3 text-[11px] text-faint leading-relaxed">
              本站当前未开放注册。需要账号请联系站长。
            </p>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between text-xs text-muted">
          <Link href="/" className="hover:text-content inline-flex items-center gap-1">
            <Icon name="arrowLeft" className="w-3.5 h-3.5" />
            返回首页
          </Link>
          <span>{accessMode === 'open' ? '免登录可用' : '需要登录'}</span>
        </div>
      </div>
    </div>
  );
}


