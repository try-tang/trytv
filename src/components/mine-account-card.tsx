'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAccess } from './access';
import { AccessGateModal } from './access-gate-modal';
import { useToast } from './toast';
import { cn } from '@/lib/utils';

/**
 * 「我的」页顶部账号卡：
 * - 未登录 → 「登录 / 注册」+「管理员登录」两个按钮；
 * - 已登录 → 显示昵称与角色，可退出；站长还多一个「进入后台」。
 *
 * 管理员登录用的是站长密码（/api/auth），与 /login 页、访问验证、/admin 共用同一套
 * httpOnly cookie，所以在这儿登录后，设置抽屉和后台都直接认。
 */
export function MineAccountCard() {
  const { ready, user, admin, accessMode, allowRegister, logoutUser } = useAccess();
  const { toast } = useToast();
  const [gateOpen, setGateOpen] = useState(false);
  const [gateMode, setGateMode] = useState<'user' | 'admin'>('user');

  const openGate = (mode: 'user' | 'admin') => {
    setGateMode(mode);
    setGateOpen(true);
  };

  const logged = Boolean(user) || admin;
  const canRegister = allowRegister && accessMode !== 'open';

  const doLogout = async () => {
    if (user) await logoutUser();
    // 站长会话要和 /login 页一样清掉 ltv_session，然后整页刷新让服务端重新判定
    await fetch('/api/auth', { method: 'DELETE' }).catch(() => null);
    toast('已退出登录', 'info');
    window.location.reload();
  };

  return (
    <div className="rounded-xl border border-line bg-card px-3.5 py-3">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0',
            admin
              ? 'bg-gradient-to-br from-warning to-[#ff9d2e] text-black'
              : user
                ? 'bg-gradient-to-br from-accent to-[#0060ff] text-on-accent'
                : 'bg-chip text-faint'
          )}
        >
          {admin ? '站' : user ? (user.nick || user.username).slice(0, 1).toUpperCase() : '游'}
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-content truncate">
            {admin ? '站长（管理员）' : user ? user.nick || user.username : '未登录'}
          </div>
          <div className="text-[11px] text-faint truncate">
            {admin
              ? '已登录站长密码，可进入 /admin 管理站点'
              : user
                ? `账号 ${user.username}${user.role === 'admin' ? ' · 管理员组' : ''}`
                : accessMode === 'open'
                  ? '本站所有人可看，登录后能保存自己的偏好'
                  : '本站需要登录后才能浏览'}
          </div>
        </div>

        {ready && !logged && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => openGate('user')}
              className="btn-primary btn-sm rounded-full px-3"
            >
              {canRegister ? '登录 / 注册' : '登录'}
            </button>
            <button
              type="button"
              onClick={() => openGate('admin')}
              className="btn-ghost btn-sm rounded-full px-3"
            >
              管理员登录
            </button>
          </div>
        )}

        {ready && logged && (
          <div className="flex items-center gap-1.5 shrink-0">
            {admin && (
              <Link href="/admin" className="btn-ghost btn-sm rounded-full px-3">
                进入后台
              </Link>
            )}
            <button
              type="button"
              onClick={doLogout}
              className="btn-ghost btn-sm rounded-full px-3 text-danger"
            >
              退出
            </button>
          </div>
        )}
      </div>

      {ready && !logged && accessMode !== 'open' && (
        <p className="mt-2 pt-2 border-t border-line text-[11px] text-faint">
          {allowRegister
            ? '开放注册中，填个用户名和密码就能用。'
            : '当前未开放注册，需要账号请联系站长开通。'}
          {' '}
          <Link href="/login" className="text-accent hover:underline">
            完整登录页 ›
          </Link>
        </p>
      )}

      <AccessGateModal
        open={gateOpen}
        onClose={() => setGateOpen(false)}
        defaultMode={gateMode}
        reason={
          gateMode === 'admin'
            ? '请输入站长密码（部署时设的 PASSWORD，没设置过则默认 admin）。它和访客账号不是一回事，用来进后台。'
            : undefined
        }
      />
    </div>
  );
}
