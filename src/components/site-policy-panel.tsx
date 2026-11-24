/**
 * 设置抽屉的「站点」页：把后台做过的站点策略搬到设置里，登录态不同看到的东西不同。
 *
 * 为什么要有这一页：用户打开设置找不到「开登录 / 开注册 / 谁可以看」——
 * 这些原本只在 /admin 里，设置抽屉里完全没有入口，看起来就像功能被删掉了。
 *
 * - 未登录：只显示当前策略（只读）+「登录 / 注册」「站长登录」两个入口；
 * - 站长（PASSWORD 已登录）：直接改访问模式 / 是否开放注册 / 成人内容过滤，
 *   和后台「站点设置」是同一份数据（`.data/site.json` 的 settings）；
 * - 本条只是入口，真正的用户管理仍在 /admin。
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { STATUS_QUERY_KEY } from '@/lib/client-api';
import { authFetch } from '@/lib/auth-client';
import { useAccess } from './access';
import { AccessGateModal } from './access-gate-modal';
import { useToast } from './toast';
import { SectionTitle } from './settings-shared';
import { cn } from '@/lib/utils';

const ACCESS_LABEL: Record<string, string> = {
  open: '所有人可看',
  login: '登录后可看',
  members: '仅注册用户可看',
};

const ACCESS_HINT: Record<string, string> = {
  open: '谁都能打开首页和播放页，登录只是为了保存自己的偏好',
  login: '未登录访问任何页面都会跳到 /login，站长密码和本站账号都能过',
  members: '只有本站注册账号能看，站长密码也进得去；适合做会员制',
};

interface SiteSettings {
  accessMode: 'open' | 'login' | 'members';
  allowRegister: boolean;
  adultFilter: boolean;
}

export function SitePolicyPanel() {
  const access = useAccess();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [gate, setGate] = useState<false | 'admin' | 'user'>(false);
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await authFetch<{ settings: SiteSettings }>('/api/admin?res=settings');
      setSettings(data.settings);
    } catch {
      setSettings(null);
    }
  }, []);

  useEffect(() => {
    if (!access.admin) {
      setSettings(null);
      return;
    }
    void load();
  }, [access.admin, load]);

  const save = async (patch: Partial<SiteSettings>) => {
    setBusy(true);
    try {
      const data = await authFetch<{ ok: true; settings: SiteSettings }>('/api/admin', {
        method: 'POST',
        body: JSON.stringify({ action: 'settings.save', ...patch }),
      });
      setSettings(data.settings);
      // 门槛是服务端读的，这里失效缓存让 header/守卫立刻按新策略走
      await queryClient.invalidateQueries({ queryKey: STATUS_QUERY_KEY });
      await access.refresh();
      toast('已保存，下一请求立即生效', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : '保存失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  const mode = settings?.accessMode ?? access.accessMode;

  return (
    <section>
      <SectionTitle
        title="站点与账号"
        hint="对应上游 LibreTV 的「超管配置」。改完对全站立即生效，不用重启容器。"
      />

      <div className="space-y-3">
        <div className="rounded-lg border border-line bg-card p-3">
          <div className="text-sm font-medium text-content mb-1">当前访问策略</div>
          <p className="text-[11px] text-faint mb-2">
            {ACCESS_LABEL[mode] ?? mode} · {ACCESS_HINT[mode] ?? ''}
          </p>

          {access.admin ? (
            <>
              <div className="space-y-1.5">
                {(['open', 'login', 'members'] as const).map((m) => (
                  <label
                    key={m}
                    className={cn(
                      'flex items-start gap-2.5 rounded-lg border px-3 py-2 cursor-pointer transition-colors',
                      mode === m ? 'border-accent/60 bg-accent/10' : 'border-line bg-chip/40 hover:bg-chip'
                    )}
                  >
                    <input
                      type="radio"
                      name="site-access-mode"
                      checked={mode === m}
                      disabled={busy || !settings}
                      onChange={() => void save({ accessMode: m })}
                      className="mt-1 accent-[rgb(var(--c-accent))]"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm text-content">{ACCESS_LABEL[m]}</span>
                      <span className="block text-[11px] text-faint mt-0.5 leading-relaxed">{ACCESS_HINT[m]}</span>
                    </span>
                  </label>
                ))}
              </div>

              <label className="mt-3 flex items-start gap-2 text-xs text-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings?.allowRegister ?? access.allowRegister}
                  disabled={busy || !settings}
                  onChange={(e) => void save({ allowRegister: e.target.checked })}
                  className="mt-0.5 accent-[rgb(var(--c-accent))]"
                />
                <span>
                  开放注册
                  <span className="block text-[11px] text-faint mt-0.5">
                    打开后访客能在 /login 自助注册；关掉只能由站长在后台建号。
                  </span>
                </span>
              </label>

              <label className="mt-2 flex items-start gap-2 text-xs text-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings?.adultFilter ?? false}
                  disabled={busy || !settings}
                  onChange={(e) => void save({ adultFilter: e.target.checked })}
                  className="mt-0.5 accent-[rgb(var(--c-accent))]"
                />
                <span>
                  过滤成人内容
                  <span className="block text-[11px] text-faint mt-0.5">
                    对应上游 LibreTV 的「成人内容过滤」，站点级生效，不跟着浏览器走。
                  </span>
                </span>
              </label>

              <p className="mt-3 text-[11px] text-faint">
                建号、停用、改密码在
                <Link href="/admin" className="text-accent hover:underline mx-0.5">
                  后台「账号」
                </Link>
                页签；私密短剧在
                <Link href="/admin" className="text-accent hover:underline mx-0.5">
                  后台「私密短剧」
                </Link>
                。
              </p>
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] text-faint">
                {access.accessMode === 'open'
                  ? '本站当前所有人可看；登录后偏好才能跟着账号保存。'
                  : '本站当前需要登录才能浏览，先登录再打开设置。'}
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  onClick={() => setGate('user')}
                >
                  {access.allowRegister && access.accessMode !== 'open' ? '登录 / 注册' : '登录'}
                </button>
                <button type="button" className="btn-ghost btn-sm" onClick={() => setGate('admin')}>
                  站长登录（改这些设置）
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="text-[11px] text-faint leading-relaxed">
          账号状态：
          {access.admin ? '站长已登录' : access.user ? `当前账号 ${access.user.username}` : '未登录'}
          。想换账号在
          <Link href="/login" className="text-accent hover:underline mx-0.5">
            登录页
          </Link>
          操作。
        </p>
      </div>

      <AccessGateModal
        open={gate !== false}
        onClose={() => setGate(false)}
        defaultMode={gate === 'admin' ? 'admin' : 'user'}
        reason={
          gate === 'admin'
            ? '输入站长密码（部署时设的 PASSWORD，没设置过则默认 admin）。登录后这里能直接改访问模式与是否开放注册。'
            : '登录后偏好与账号绑定，换设备不用重设。'
        }
        onSuccess={() => {
          void load();
        }}
      />
    </section>
  );
}
