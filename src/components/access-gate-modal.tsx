'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useFocusTrap } from './use-focus-trap';
import { useAccess } from './access';
import { useToast } from './toast';
import { Icon } from './icon';
import { cn } from '@/lib/utils';

/**
 * 站内登录 / 注册 / 站长密码弹窗。
 *
 * 三种模式同一套 UI：
 * - user     ：本站账号登录（后台「站点设置」里开了注册才显示注册页签）
 * - register ：注册并自动登录
 * - admin    ：站长密码（/api/auth，与 /login 页、访问验证共用同一套 cookie）
 *
 * 为什么要一个弹窗而不是只留 /login 页：
 * 顶栏齿轮、我的页「管理员登录」这类入口是随时可能点开的，
 * 跳整页会丢掉当前浏览位置，弹窗可以「登录完接着干刚才的事」。
 */

type Mode = 'user' | 'register' | 'admin';

export function AccessGateModal({
  open,
  onClose,
  onSuccess,
  reason,
  defaultMode = 'user',
  onSkip,
}: {
  open: boolean;
  onClose: () => void;
  /** 登录成功后回调（一般用来继续原本要做的动作，比如打开设置抽屉） */
  onSuccess?: () => void;
  reason?: string;
  defaultMode?: Mode;
  /**
   * 「先不登录，继续」——只有站点是「所有人可看」这种不拦人的模式才给这个出口，
   * 否则访客会被自己的弹窗锁在门外（设置只是偏好，不是权限）。
   */
  onSkip?: () => void;
}) {
  const { accessMode, allowRegister, admin, user, loginUser, registerUser, refresh } = useAccess();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(open, panelRef);

  const [mode, setMode] = useState<Mode>(defaultMode);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nick, setNick] = useState('');
  const [adminPwd, setAdminPwd] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // 每次打开都重置表单：上次的错误提示/密码不该带进新一次
  useEffect(() => {
    if (!open) return;
    setMode(allowRegister ? defaultMode : 'user');
    setError('');
    setPassword('');
    setAdminPwd('');
  }, [open, allowRegister, defaultMode]);

  if (!open) return null;

  const canRegister = allowRegister && accessMode !== 'open';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      if (mode === 'admin') {
        if (!adminPwd) throw new Error('请输入站长密码');
        const res = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: adminPwd }),
        });
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        if (!res.ok) throw new Error(data?.error || '站长密码不正确');
        await queryClient.invalidateQueries();
        toast('站长已登录', 'success');
      } else if (mode === 'register') {
        if (!username.trim() || !password) throw new Error('请填写用户名和密码');
        await registerUser(username.trim(), password, nick.trim() || undefined);
      } else {
        if (!username.trim() || !password) throw new Error('请填写用户名和密码');
        await loginUser(username.trim(), password);
      }
      await refresh();
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败，请重试');
    } finally {
      setBusy(false);
    }
  };

  const tabs: { id: Mode; label: string }[] = [
    { id: 'user', label: '登录' },
    ...(canRegister ? [{ id: 'register' as Mode, label: '注册' }] : []),
    { id: 'admin', label: '站长' },
  ];

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="登录"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-line bg-surface shadow-2xl shadow-black/50 pb-[env(safe-area-inset-bottom)] sm:pb-0"
      >
        <div className="flex items-center justify-between px-4 h-12 border-b border-line">
          <h2 className="text-sm font-semibold text-content">
            {admin ? '已登录' : mode === 'admin' ? '站长登录' : mode === 'register' ? '注册账号' : '登录'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="p-1.5 rounded-md text-muted hover:text-content hover:bg-hover transition-colors"
          >
            <Icon name="close" className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-3 space-y-3">
          {reason && <p className="text-xs text-faint leading-relaxed">{reason}</p>}

          {user && (
            <p className="text-xs text-accent">
              当前账号：{user.nick || user.username}
              {user.role === 'admin' ? '（管理员）' : ''}
            </p>
          )}

          {tabs.length > 1 && (
            <div className="flex gap-1 p-0.5 rounded-lg bg-chip" role="tablist">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={mode === t.id}
                  onClick={() => {
                    setMode(t.id);
                    setError('');
                  }}
                  className={cn(
                    'flex-1 rounded-md px-2 py-1.5 text-xs transition-colors',
                    mode === t.id
                      ? 'bg-accent text-on-accent font-medium'
                      : 'text-muted hover:text-content'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={submit} className="space-y-2.5">
            {mode === 'admin' ? (
              <input
                className="input w-full"
                type="password"
                autoComplete="current-password"
                placeholder="站长密码（默认 admin）"
                value={adminPwd}
                onChange={(e) => setAdminPwd(e.target.value)}
                autoFocus
              />
            ) : (
              <>
                <input
                  className="input w-full"
                  autoComplete="username"
                  placeholder="用户名（3-20 位，小写字母/数字/_ . -）"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoFocus
                />
                <input
                  className="input w-full"
                  type="password"
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  placeholder="密码（至少 6 位）"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {mode === 'register' && (
                  <input
                    className="input w-full"
                    placeholder="昵称（可选，随便填个好认的）"
                    value={nick}
                    onChange={(e) => setNick(e.target.value)}
                  />
                )}
              </>
            )}

            {error && <p className="text-xs text-danger">{error}</p>}

            <button type="submit" disabled={busy} className="btn-primary w-full h-9 rounded-lg text-sm">
              {busy ? '处理中…' : mode === 'admin' ? '站长登录' : mode === 'register' ? '注册并登录' : '登录'}
            </button>
          </form>

          {onSkip && (
            <button
              type="button"
              onClick={onSkip}
              className="w-full text-center text-xs text-faint hover:text-content transition-colors py-1"
            >
              先不登录，继续
            </button>
          )}

          <p className="text-[11px] text-faint leading-relaxed">
            {accessMode === 'open'
              ? '本站当前所有人可看，账号只用来保存你自己的偏好。'
              : '本站需要登录后才能浏览。'}
            {!allowRegister && accessMode !== 'open' && ' 当前未开放注册，需要账号请联系站长。'}
          </p>
        </div>
      </div>
    </div>
  );
}
