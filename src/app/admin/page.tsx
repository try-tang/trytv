'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/header';
import { SiteFooter } from '@/components/site-footer';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { useAuth } from '@/components/auth';
import { useAccess } from '@/components/access';
import { ConfigPanel } from '@/components/admin-config-panel';
import {
  NoticeEditor,
  RequestsTable,
  SettingsPanel,
  ShortsPanel,
  TipsTable,
  UsersPanel,
} from '@/components/admin-panels';
import type { AccountInfo, SettingsInfo, ShortInfo, Stats } from '@/components/admin-types';
import { noticeApi, type RequestEntry, type TipEntry, type NoticeInfo } from '@/lib/site-client';
import { cn } from '@/lib/utils';

/**
 * 管理端（对应原站 /admin）。
 *
 * 鉴权直接复用 LibreTV 的 PASSWORD + 签名 cookie（lib/auth.ts），
 * 不另建账号体系——单站长场景够了。未登录时任何 /api/admin 请求都会 401，
 * 客户端 API 层会自动弹登录框，所以这里只需要提示「先登录」。
 *
 * 布局照 LunaTV-config 的 web-editor 改成「整页大编辑器」：
 * 顶栏是站点身份 + 概览 + 保存入口，左边一列是段落索引（求片 / 赞赏 / 通知 / 短剧 / 配置 / 站点 / 账号），
 * 右侧是当前段落的大工作区，最下面是常驻状态栏。
 * 之前是 max-w-4xl 居中的小表单流，段落一多就要来回滚。
 *
 * 七块功能：
 * 1. 求片管理：改状态（待处理/已上线/不处理）、回复、删除；
 * 2. 赞赏留言：审核（展示/隐藏）、删除；
 * 3. 站长通知：编辑正文 + 开关，保存后版本号 +1，访客下次进站弹一次；
 * 4. 私密短剧：入口开关、口令、清单维护；
 * 5. 配置：site.json / sources.json 的 JSON 编辑器；
 * 6. 站点设置：谁能看、是否开放注册、站名与文案、成人过滤；
 * 7. 账号管理：注册用户列表、新建、停用/启用、重置密码、删除。
 */

type Tab = 'requests' | 'tips' | 'notice' | 'shorts' | 'config' | 'settings' | 'users';

const TAB_STORAGE_KEY = 'trytv-admin-tab';

const TAB_META: {
  id: Tab;
  label: string;
  hint: string;
  icon: Parameters<typeof Icon>[0]['name'];
}[] = [
  { id: 'requests', label: '求片', hint: '访客想看的片子', icon: 'link' },
  { id: 'tips', label: '赞赏留言', hint: '审核与展示', icon: 'heart' },
  { id: 'notice', label: '站长通知', hint: '进站弹一次', icon: 'info' },
  { id: 'shorts', label: '私密短剧', hint: '入口开关与口令', icon: 'tv' },
  { id: 'config', label: '配置', hint: 'site / sources JSON', icon: 'code' },
  { id: 'settings', label: '站点设置', hint: '访问策略与文案', icon: 'gear' },
  { id: 'users', label: '账号', hint: '注册用户', icon: 'user' },
];

function isTab(v: string | null): v is Tab {
  return !!v && TAB_META.some((t) => t.id === v);
}

export default function AdminPage() {
  const { toast } = useToast();
  const { verified, checked } = useAuth();

  const [tab, setTab] = useState<Tab>('requests');
  const [stats, setStats] = useState<Stats | null>(null);
  const [requests, setRequests] = useState<RequestEntry[]>([]);
  const [tips, setTips] = useState<TipEntry[]>([]);
  const [notice, setNotice] = useState<NoticeInfo | null>(null);
  const [noticeDraft, setNoticeDraft] = useState('');
  const [settings, setSettings] = useState<SettingsInfo | null>(null);
  const [shorts, setShorts] = useState<ShortInfo[]>([]);
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);

  const authFetch = useCallback(async <T,>(url: string, init?: RequestInit): Promise<T> => {
    const res = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
      cache: 'no-store',
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!res.ok) {
      const msg = (data as { error?: string } | null)?.error || `请求失败（HTTP ${res.status}）`;
      throw new Error(msg);
    }
    return data as T;
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await authFetch<{
        ok: true;
        stats: Stats;
        requests: RequestEntry[];
        tips: TipEntry[];
        users?: AccountInfo[];
        settings?: SettingsInfo;
        shorts?: ShortInfo[];
      }>('/api/admin?res=all');
      setStats(data.stats);
      setRequests(data.requests);
      setTips(data.tips);
      if (data.users) setAccounts(data.users);
      if (data.settings) setSettings(data.settings);
      setShorts(Array.isArray(data.shorts) ? data.shorts : []);

      const n = await noticeApi.get();
      setNotice(n.notice);
      setNoticeDraft(n.notice?.body ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  // 段落记在本地：刷新后台不该被弹回「求片」。hash 优先，方便直接给别人发 /admin#users
  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (isTab(hash)) {
      setTab(hash);
      return;
    }
    try {
      const saved = window.localStorage.getItem(TAB_STORAGE_KEY);
      if (isTab(saved)) setTab(saved);
    } catch {
      /* 隐私模式下读不到，用默认值 */
    }
  }, []);

  const switchTab = useCallback((id: Tab) => {
    setTab(id);
    setNavOpen(false);
    try {
      window.localStorage.setItem(TAB_STORAGE_KEY, id);
    } catch {
      /* 忽略 */
    }
    const url = new URL(window.location.href);
    url.hash = id;
    window.history.replaceState(null, '', url.toString());
  }, []);

  useEffect(() => {
    if (!checked) return;
    if (!verified) {
      setLoading(false);
      return;
    }
    void loadAll();
  }, [checked, verified, loadAll]);

  const act = useCallback(
    async (key: string, payload: Record<string, unknown>, okMsg: string) => {
      setBusy(key);
      try {
        await authFetch<{ ok: true }>('/api/admin', { method: 'POST', body: JSON.stringify(payload) });
        toast(okMsg, 'success');
        await loadAll();
      } catch (e) {
        toast(e instanceof Error ? e.message : '操作失败', 'error');
      } finally {
        setBusy(null);
      }
    },
    [authFetch, loadAll, toast]
  );

  const pendingCount = useMemo(() => requests.filter((r) => r.status === 'pending').length, [requests]);
  const pendingTips = useMemo(() => tips.filter((t) => t.status === 'pending').length, [tips]);

  const counts: Record<Tab, number | null> = {
    requests: pendingCount || null,
    tips: pendingTips || null,
    notice: notice?.enabled ? null : 0,
    shorts: shorts.length || null,
    config: null,
    settings: null,
    users: stats?.users?.total || null,
  };

  if (checked && !verified) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="max-w-md mx-auto px-4 py-12">
          {/* 就地输密码：从「我的 → 进入后台」点进来的人不该再被弹去另一个页面重输一遍 */}
          <AdminGate onSuccess={() => void loadAll()} />
        </main>
        <SiteFooter />
      </div>
    );
  }

  const activeMeta = TAB_META.find((t) => t.id === tab) ?? TAB_META[0];

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 w-full max-w-[1400px] mx-auto px-3 sm:px-4 py-3">
        {/* 顶栏：身份 + 概览 + 主操作 */}
        <div className="rounded-xl border border-line bg-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface/60 px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <Icon name="gear" className="w-4 h-4 text-accent shrink-0" />
              <span className="text-sm font-semibold text-content shrink-0">管理后台</span>
              <span className="text-[11px] text-faint truncate">
                {activeMeta.label} · {activeMeta.hint}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="btn-ghost btn-sm lg:hidden"
                onClick={() => setNavOpen((v) => !v)}
                aria-expanded={navOpen}
              >
                <Icon name={navOpen ? 'collapse' : 'list'} className="w-3.5 h-3.5" />
                段落
              </button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => void loadAll()} disabled={loading}>
                <Icon name="refresh" className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
                刷新
              </button>
            </div>
          </div>

          {/* 概览条：像编辑器的标签页统计一样常驻，不用来回切页确认「有没有新东西」 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 divide-x divide-line/60 border-b border-line">
            <MetricCell label="求片" value={stats?.requests.total ?? 0} sub={`待处理 ${stats?.requests.pending ?? pendingCount}`} highlight={(stats?.requests.pending ?? pendingCount) > 0} />
            <MetricCell label="留言" value={stats?.tips.total ?? 0} sub={`待审 ${stats?.tips.pending ?? pendingTips}`} highlight={(stats?.tips.pending ?? pendingTips) > 0} />
            <MetricCell label="赞赏" value={stats?.tips.amount ?? 0} sub="累计金额" subtle />
            <MetricCell label="短剧" value={stats?.shorts?.total ?? 0} sub={stats?.settings?.shortsEnabled === false ? '入口已关' : '入口开启'} subtle />
            <MetricCell label="预置源" value={stats?.preset?.vod ?? 0} sub={`直播 ${stats?.preset?.live ?? 0}`} subtle />
            <MetricCell label="账号" value={stats?.users?.total ?? 0} sub={`活跃 ${stats?.users?.active ?? 0}`} subtle />
            <MetricCell label="访问" value={ACCESS_LABEL[stats?.settings?.accessMode ?? 'open']} sub={stats?.settings?.allowRegister === false ? '注册已关' : '开放注册'} text />
          </div>

          <div className="flex flex-col lg:flex-row min-h-[560px]">
            {/* 左栏：段落索引（LunaTV-config 的左侧工具面板位） */}
            <aside
              className={cn(
                'lg:w-52 shrink-0 border-b lg:border-b-0 lg:border-r border-line bg-surface/30 p-2 space-y-1',
                navOpen ? 'block' : 'hidden lg:block'
              )}
            >
              <div className="text-[10px] uppercase tracking-wide text-faint px-1.5 pb-1">段落</div>
              {TAB_META.map((t) => {
                const on = t.id === tab;
                const count = counts[t.id];
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => switchTab(t.id)}
                    className={cn(
                      'w-full flex items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors',
                      on
                        ? 'border-accent/60 bg-accent/10 text-content'
                        : 'border-transparent text-muted hover:text-content hover:bg-hover'
                    )}
                  >
                    <Icon name={t.icon} className="w-3.5 h-3.5 shrink-0" />
                    <span className="text-[12px] font-medium truncate">{t.label}</span>
                    {count !== null && count > 0 && (
                      <span className="ml-auto shrink-0 rounded-full bg-accent/15 text-accent text-[10px] px-1.5 py-0.5">
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}

              <div className="pt-2 mt-1 border-t border-line text-[11px] text-faint leading-relaxed px-1.5">
                未登录访客看到的由「站点设置」决定；
                数据源清单在「配置 → sources.json」。
              </div>
            </aside>

            {/* 右栏：当前段落的大工作区 */}
            <section className="min-w-0 flex-1 p-3">
              {error && (
                <div className="mb-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
                  {error}
                </div>
              )}

              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-16 rounded-lg bg-card animate-pulse" />
                  ))}
                </div>
              ) : tab === 'requests' ? (
                <RequestsTable requests={requests} busy={busy} act={act} />
              ) : tab === 'tips' ? (
                <TipsTable tips={tips} busy={busy} act={act} />
              ) : tab === 'notice' ? (
                <NoticeEditor
                  notice={notice}
                  draft={noticeDraft}
                  setDraft={setNoticeDraft}
                  busy={busy === 'notice'}
                  onSave={(body, enabled) => void act('notice', { action: 'notice.save', body, enabled }, '通知已保存')}
                />
              ) : tab === 'shorts' ? (
                <ShortsPanel
                  settings={settings}
                  shorts={shorts}
                  busy={busy}
                  act={async (key, payload, msg) => {
                    await act(key, payload, msg);
                  }}
                />
              ) : tab === 'config' ? (
                <ConfigPanel />
              ) : tab === 'settings' ? (
                <SettingsPanel
                  settings={settings}
                  busy={busy === 'settings'}
                  onSave={(patch) => void act('settings', { action: 'settings.save', ...patch }, '设置已保存，立即生效')}
                />
              ) : (
                <UsersPanel accounts={accounts} busy={busy} act={act} />
              )}
            </section>
          </div>

          {/* 底部状态栏：常驻，和编辑器一致 */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface/60 px-3 py-1.5 text-[11px] text-faint">
            <div className="flex items-center gap-3">
              <span>{activeMeta.label}</span>
              <span>
                求片 {stats?.requests.total ?? 0} · 待处理 {stats?.requests.pending ?? pendingCount}
              </span>
              <span>留言 {stats?.tips.total ?? 0}</span>
            </div>
            <div className="flex items-center gap-3">
              {loading ? <span className="text-accent">同步中…</span> : <span className="text-success">已同步</span>}
              <span>数据目录 .data/</span>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

function MetricCell({
  label,
  value,
  sub,
  highlight,
  subtle,
  text,
}: {
  label: string;
  value: number | string;
  sub?: string;
  highlight?: boolean;
  subtle?: boolean;
  text?: boolean;
}) {
  return (
    <div className="px-3 py-2 min-w-0">
      <div
        className={cn(
          'truncate font-semibold',
          text ? 'text-sm' : 'text-lg',
          highlight ? 'text-accent' : subtle ? 'text-muted' : 'text-content'
        )}
      >
        {value}
      </div>
      <div className="text-[11px] text-faint mt-0.5 truncate">
        {label}
        {sub ? ` · ${sub}` : ''}
      </div>
    </div>
  );
}

const ACCESS_LABEL: Record<'open' | 'login' | 'members', string> = {
  open: '所有人可看',
  login: '登录后可看',
  members: '仅注册用户',
};

/**
 * 后台的落地登录框：只输站长密码，成功即刷新当前页数据。
 * 不跳转 —— middleware 已经把未登录访问 /admin 重定向到 /login，
 * 这里覆盖的是「会话过期 / 直接访问但客户端还没同步」的情况。
 */
function AdminGate({ onSuccess }: { onSuccess: () => void }) {
  const access = useAccess();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  /**
   * 走 AccessProvider 的 loginAdmin：它是全站唯一写「站长已登录」的地方，
   * 会同时更新上下文、让 /api/status 缓存失效并广播给顶栏与我的页。
   * 这里只负责把后台数据重新拉一遍 + refresh 服务端组件树。
   */
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !password) return;
    setBusy(true);
    setError('');
    try {
      await access.loginAdmin(password);
      onSuccess();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-line bg-card px-4 py-5">
      <h1 className="text-base font-semibold text-content flex items-center gap-2 mb-1">
        <Icon name="gear" className="w-4 h-4 text-accent" />
        站长登录
      </h1>
      <p className="text-xs text-faint leading-relaxed mb-3">
        输入站长密码即可进入后台。这里是部署时设置的 PASSWORD（没设置过默认 admin），
        与前台访客账号不是一回事。
      </p>
      <form onSubmit={submit} className="space-y-2.5">
        <input
          className="input w-full"
          type="password"
          autoComplete="current-password"
          placeholder="站长密码（默认 admin）"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        {error && <p className="text-xs text-danger">{error}</p>}
        <button type="submit" className="btn-primary w-full h-9 rounded-lg text-sm" disabled={busy}>
          {busy ? '验证中…' : '进入后台'}
        </button>
      </form>
      <p className="mt-3 text-[11px] text-faint">
        想用注册账号？<Link href="/mine" className="text-accent hover:underline">去「我的」</Link>
        可以登录 / 注册，但后台只认站长密码。
      </p>
    </div>
  );
}
