'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/header';
import { SiteFooter } from '@/components/site-footer';
import { Icon } from '@/components/icon';
import { EmptyState } from '@/components/states';
import { useToast } from '@/components/toast';
import { useAuth } from '@/components/auth';
import { noticeApi, type RequestEntry, type TipEntry, type NoticeInfo } from '@/lib/site-client';
import { cn } from '@/lib/utils';

/**
 * 管理端（对应原站 /admin）。
 *
 * 鉴权直接复用 LibreTV 的 PASSWORD + 签名 cookie（lib/auth.ts），
 * 不另建账号体系——单站长场景够了。未登录时任何 /api/admin 请求都会 401，
 * 客户端 API 层会自动弹登录框，所以这里只需要提示「先登录」。
 *
 * 五块功能：
 * 1. 求片管理：改状态（待处理/已上线/不处理）、回复、删除；
 * 2. 赞赏留言：审核（展示/隐藏）、删除；
 * 3. 站长通知：编辑正文 + 开关，保存后版本号 +1，访客下次进站弹一次；
 * 4. 站点设置：谁能看（所有人 / 登录后 / 仅注册用户）、是否开放注册、站名与文案；
 * 5. 账号管理：注册用户列表、新建、停用/启用、重置密码、删除。
 */

type Tab = 'requests' | 'tips' | 'notice' | 'settings' | 'users';

interface SettingsInfo {
  accessMode: 'open' | 'login' | 'members';
  allowRegister: boolean;
  siteName?: string;
  slogan?: string;
  banner?: string;
  updatedAt: number;
}

interface AccountInfo {
  id: string;
  username: string;
  nick?: string;
  role: 'user' | 'admin';
  createdAt: number;
  lastLoginAt?: number;
  disabled?: boolean;
}

/** 与 src/lib/site-data.ts 的 stats() 返回结构一致 */
interface Stats {
  requests: { total: number; pending: number; done: number };
  tips: { total: number; pending: number; shown: number; amount: number };
  notice: { enabled: boolean; version: number };
  settings?: { accessMode: 'open' | 'login' | 'members'; allowRegister: boolean };
  users?: { total: number; active: number };
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
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

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
      }>('/api/admin?res=all');
      setStats(data.stats);
      setRequests(data.requests);
      setTips(data.tips);
      if (data.users) setAccounts(data.users);
      if (data.settings) setSettings(data.settings);

      const n = await noticeApi.get();
      setNotice(n.notice);
      setNoticeDraft(n.notice?.body ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

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
    [authFetch, loadAll, toast],
  );

  const pendingCount = useMemo(() => requests.filter((r) => r.status === 'pending').length, [requests]);

  if (checked && !verified) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="max-w-md mx-auto px-4 py-16">
          <EmptyState
            icon="gear"
            title="需要先登录"
            description="后台复用站点的访问密码（环境变量 PASSWORD），登录后即可管理求片与留言。"
            action={
              <Link href="/" className="btn-primary btn-sm">
                回首页登录
              </Link>
            }
          />
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header />

      <main className="max-w-4xl mx-auto px-4 py-4">
        <div className="flex items-baseline justify-between mb-3">
          <h1 className="text-lg font-semibold text-content flex items-center gap-2">
            <Icon name="gear" className="w-4 h-4 text-accent" />
            管理后台
          </h1>
          <button type="button" className="btn-ghost btn-sm" onClick={() => void loadAll()} disabled={loading}>
            <Icon name="refresh" className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            刷新
          </button>
        </div>

        {/* 概览 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
          <StatCard label="求片总数" value={stats?.requests.total ?? 0} />
          <StatCard label="待处理" value={stats?.requests.pending ?? pendingCount} highlight />
          <StatCard label="留言条数" value={stats?.tips.total ?? 0} />
          <StatCard label="赞赏合计" value={stats?.tips.amount ?? 0} subtle />
          <StatCard label="注册用户" value={stats?.users?.total ?? 0} />
          <StatCard
            label={ACCESS_LABEL[stats?.settings?.accessMode ?? 'open']}
            value={stats?.users?.active ?? 0}
            subtle
          />
        </div>

        {/* tab */}
        <div className="flex gap-2 mb-3">
          {(
            [
              { key: 'requests', label: `求片${pendingCount ? ` (${pendingCount})` : ''}` },
              { key: 'tips', label: '赞赏留言' },
              { key: 'notice', label: '站长通知' },
              { key: 'settings', label: '站点设置' },
              { key: 'users', label: `账号${stats?.users?.total ? ` (${stats.users.total})` : ''}` },
            ] as { key: Tab; label: string }[]
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'rounded-full px-3 py-1.5 text-sm transition-colors',
                tab === t.key ? 'bg-accent text-on-accent font-medium' : 'bg-chip text-muted hover:text-content',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
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
        ) : tab === 'settings' ? (
          <SettingsPanel
            settings={settings}
            busy={busy === 'settings'}
            onSave={(patch) => void act('settings', { action: 'settings.save', ...patch }, '设置已保存，立即生效')}
          />
        ) : (
          <UsersPanel accounts={accounts} busy={busy} act={act} />
        )}
      </main>

      <SiteFooter />
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
  subtle,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  subtle?: boolean;
}) {
  return (
    <div className="rounded-lg border border-line bg-card px-3 py-2.5">
      <div
        className={cn(
          'text-xl font-semibold',
          highlight && value > 0 ? 'text-accent' : subtle ? 'text-muted' : 'text-content',
        )}
      >
        {value}
      </div>
      <div className="text-[11px] text-faint mt-0.5">{label}</div>
    </div>
  );
}

const ACCESS_LABEL: Record<'open' | 'login' | 'members', string> = {
  open: '所有人可看',
  login: '登录后可看',
  members: '仅注册用户',
};

const ACCESS_HINT: Record<'open' | 'login' | 'members', string> = {
  open: '任何人打开就能看，和上游 LibreTV 的默认行为一致；登录只是可选。',
  login: '未登录访客会被挡到 /login：注册用户或站长密码都能进。',
  members: '只认本站注册账号，站长密码也不能替代（但站长自己仍能进后台配站点）。',
};

const REQUEST_STATUS: Record<RequestEntry['status'], { label: string; cls: string }> = {
  pending: { label: '待处理', cls: 'bg-warning/15 text-warning' },
  done: { label: '已上线', cls: 'bg-accent/15 text-accent' },
  rejected: { label: '不处理', cls: 'bg-line text-faint' },
};

function RequestsTable({
  requests,
  busy,
  act,
}: {
  requests: RequestEntry[];
  busy: string | null;
  act: (key: string, payload: Record<string, unknown>, okMsg: string) => Promise<void>;
}) {
  const [replyId, setReplyId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  if (requests.length === 0) {
    return <EmptyState icon="link" title="还没有人求片" description="访客在「我的 → 服务 → 求片」提交后会出现在这里。" />;
  }

  return (
    <ul className="space-y-2">
      {requests.map((r) => (
        <li key={r.id} className="rounded-lg border border-line bg-card px-3 py-2.5">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-content truncate">{r.title}</span>
                <span className={cn('tag px-1.5 py-0.5 text-[11px]', REQUEST_STATUS[r.status].cls)}>
                  {REQUEST_STATUS[r.status].label}
                </span>
              </div>
              {r.note && <p className="mt-1 text-xs text-muted line-clamp-2">{r.note}</p>}
              <p className="mt-1 text-[11px] text-faint">
                {r.nick ? `${r.nick} · ` : ''}
                {new Date(r.createdAt).toLocaleString('zh-CN')}
              </p>
              {r.reply && (
                <p className="mt-1.5 rounded bg-chip px-2 py-1 text-xs text-muted">
                  <span className="text-accent">回复：</span>
                  {r.reply}
                </p>
              )}
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              className="chip bg-chip text-muted hover:text-content border border-line py-1 px-2.5"
              disabled={busy === `st-${r.id}`}
              onClick={() => void act(`st-${r.id}`, { action: 'request.status', id: r.id, status: 'done' }, '已标记为已上线')}
            >
              <Icon name="check" className="w-3 h-3" />
              已上线
            </button>
            <button
              type="button"
              className="chip bg-chip text-muted hover:text-content border border-line py-1 px-2.5"
              disabled={busy === `st-${r.id}`}
              onClick={() => void act(`st-${r.id}`, { action: 'request.status', id: r.id, status: 'pending' }, '已改回待处理')}
            >
              待处理
            </button>
            <button
              type="button"
              className="chip bg-chip text-muted hover:text-content border border-line py-1 px-2.5"
              disabled={busy === `st-${r.id}`}
              onClick={() => void act(`st-${r.id}`, { action: 'request.status', id: r.id, status: 'rejected' }, '已标记为不处理')}
            >
              不处理
            </button>
            <button
              type="button"
              className="chip bg-chip text-muted hover:text-content border border-line py-1 px-2.5"
              onClick={() => {
                setReplyId(replyId === r.id ? null : r.id);
                setReplyText(r.reply || '');
              }}
            >
              <Icon name="edit" className="w-3 h-3" />
              回复
            </button>
            <button
              type="button"
              className="chip bg-chip text-faint hover:text-danger border border-line py-1 px-2.5"
              disabled={busy === `del-${r.id}`}
              onClick={() => {
                if (window.confirm(`删除求片「${r.title}」？`)) {
                  void act(`del-${r.id}`, { action: 'request.delete', id: r.id }, '已删除');
                }
              }}
            >
              <Icon name="trash" className="w-3 h-3" />
              删除
            </button>
          </div>

          {replyId === r.id && (
            <div className="mt-2 flex gap-1.5">
              <input
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="回复内容（访客按昵称查进度时可见）"
                className="input flex-1 text-xs"
              />
              <button
                type="button"
                className="btn-primary btn-sm"
                disabled={busy === `rp-${r.id}`}
                onClick={async () => {
                  await act(`rp-${r.id}`, { action: 'request.reply', id: r.id, reply: replyText }, '回复已保存');
                  setReplyId(null);
                }}
              >
                保存
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function TipsTable({
  tips,
  busy,
  act,
}: {
  tips: TipEntry[];
  busy: string | null;
  act: (key: string, payload: Record<string, unknown>, okMsg: string) => Promise<void>;
}) {
  if (tips.length === 0) {
    return <EmptyState icon="star" title="还没有赞赏留言" description="访客提交的赞赏与留言会出现在这里，审核通过才在留言墙展示。" />;
  }

  return (
    <ul className="space-y-2">
      {tips.map((t) => (
        <li key={t.id} className="rounded-lg border border-line bg-card px-3 py-2.5">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-sm font-semibold text-warning">¥{t.amount}</span>
            <span className="text-xs text-content">{t.nick || '匿名'}</span>
            <span
              className={cn(
                'tag px-1.5 py-0.5 text-[11px]',
                t.status === 'shown'
                  ? 'bg-accent/15 text-accent'
                  : t.status === 'pending'
                    ? 'bg-warning/15 text-warning'
                    : 'bg-line text-faint',
              )}
            >
              {t.status === 'shown' ? '已展示' : t.status === 'pending' ? '待审核' : '已隐藏'}
            </span>
            <span className="ml-auto text-[11px] text-faint">{new Date(t.createdAt).toLocaleString('zh-CN')}</span>
          </div>
          {t.content && <p className="mt-1 text-xs text-muted line-clamp-3">{t.content}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              className="chip bg-chip text-muted hover:text-content border border-line py-1 px-2.5"
              disabled={busy === `t-${t.id}`}
              onClick={() => void act(`t-${t.id}`, { action: 'tip.status', id: t.id, status: 'shown' }, '已在留言墙展示')}
            >
              展示
            </button>
            <button
              type="button"
              className="chip bg-chip text-muted hover:text-content border border-line py-1 px-2.5"
              disabled={busy === `t-${t.id}`}
              onClick={() => void act(`t-${t.id}`, { action: 'tip.status', id: t.id, status: 'hidden' }, '已隐藏')}
            >
              隐藏
            </button>
            <button
              type="button"
              className="chip bg-chip text-faint hover:text-danger border border-line py-1 px-2.5"
              disabled={busy === `td-${t.id}`}
              onClick={() => {
                if (window.confirm('删除这条留言？')) void act(`td-${t.id}`, { action: 'tip.delete', id: t.id }, '已删除');
              }}
            >
              <Icon name="trash" className="w-3 h-3" />
              删除
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function NoticeEditor({
  notice,
  draft,
  setDraft,
  busy,
  onSave,
}: {
  notice: NoticeInfo | null;
  draft: string;
  setDraft: (v: string) => void;
  busy: boolean;
  onSave: (body: string, enabled: boolean) => void;
}) {
  const [enabled, setEnabled] = useState(notice?.enabled ?? true);

  useEffect(() => {
    setEnabled(notice?.enabled ?? true);
  }, [notice?.enabled]);

  return (
    <div className="rounded-lg border border-line bg-card p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-content">站长通知</span>
        <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="accent-[rgb(var(--c-accent))]"
          />
          启用（访客进站弹一次）
        </label>
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={8}
        placeholder="写点公告，例如：本站已恢复更新，求片请在「我的 → 服务」里提交。"
        className="input w-full resize-y leading-relaxed"
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11px] text-faint">
          {notice?.updatedAt ? `上次保存：${new Date(notice.updatedAt).toLocaleString('zh-CN')}` : '还没发过通知'}
          {notice ? ` · 当前版本 v${notice.version}` : ''}
        </span>
        <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={() => onSave(draft, enabled)}>
          {busy ? '保存中…' : '保存并发通知'}
        </button>
      </div>
    </div>
  );
}

/** 站点设置：谁能看 / 是否开放注册 / 站名与文案（保存后立即生效，无需重启） */
function SettingsPanel({
  settings,
  busy,
  onSave,
}: {
  settings: SettingsInfo | null;
  busy: boolean;
  onSave: (patch: Partial<SettingsInfo>) => void;
}) {
  const [mode, setMode] = useState<SettingsInfo['accessMode']>(settings?.accessMode ?? 'open');
  const [allowRegister, setAllowRegister] = useState(settings?.allowRegister ?? true);
  const [siteName, setSiteName] = useState(settings?.siteName ?? '');
  const [slogan, setSlogan] = useState(settings?.slogan ?? '');
  const [banner, setBanner] = useState(settings?.banner ?? '');

  useEffect(() => {
    setMode(settings?.accessMode ?? 'open');
    setAllowRegister(settings?.allowRegister ?? true);
    setSiteName(settings?.siteName ?? '');
    setSlogan(settings?.slogan ?? '');
    setBanner(settings?.banner ?? '');
  }, [settings]);

  const dirty =
    mode !== (settings?.accessMode ?? 'open') ||
    allowRegister !== (settings?.allowRegister ?? true) ||
    siteName !== (settings?.siteName ?? '') ||
    slogan !== (settings?.slogan ?? '') ||
    banner !== (settings?.banner ?? '');

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-line bg-card p-3">
        <div className="text-sm font-medium text-content mb-1">谁可以看</div>
        <p className="text-[11px] text-faint mb-2.5">选中的模式对全站生效（含播放页与接口）。</p>
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
                name="accessMode"
                checked={mode === m}
                onChange={() => setMode(m)}
                className="mt-1 accent-[rgb(var(--c-accent))]"
              />
              <span className="min-w-0">
                <span className="block text-sm text-content">{ACCESS_LABEL[m]}</span>
                <span className="block text-[11px] text-faint mt-0.5 leading-relaxed">{ACCESS_HINT[m]}</span>
              </span>
            </label>
          ))}
        </div>

        <label className="mt-3 flex items-center gap-2 text-xs text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={allowRegister}
            onChange={(e) => setAllowRegister(e.target.checked)}
            className="accent-[rgb(var(--c-accent))]"
          />
          开放注册（关掉后只能由你在下面「账号」里手动建号）
        </label>
      </div>

      <div className="rounded-lg border border-line bg-card p-3">
        <div className="text-sm font-medium text-content mb-1">站名与文案</div>
        <p className="text-[11px] text-faint mb-2.5">
          留空即用代码里的默认值（src/lib/site.ts，可用 NEXT_PUBLIC_SITE_* 环境变量覆盖）。
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="block text-[11px] text-faint mb-1">站名</span>
            <input
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              placeholder="看看电视"
              className="input w-full text-sm"
            />
          </label>
          <label className="block">
            <span className="block text-[11px] text-faint mb-1">口号</span>
            <input
              value={slogan}
              onChange={(e) => setSlogan(e.target.value)}
              placeholder="每日一部好片"
              className="input w-full text-sm"
            />
          </label>
        </div>
        <label className="block mt-2">
          <span className="block text-[11px] text-faint mb-1">顶部提示条（留空不显示）</span>
          <input
            value={banner}
            onChange={(e) => setBanner(e.target.value)}
            placeholder="例如：站点已恢复更新"
            className="input w-full text-sm"
          />
        </label>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-faint">
          {settings?.updatedAt ? `上次保存：${new Date(settings.updatedAt).toLocaleString('zh-CN')}` : '还没改过设置'}
        </span>
        <button
          type="button"
          className="btn-primary btn-sm"
          disabled={busy || !dirty}
          onClick={() =>
            onSave({
              accessMode: mode,
              allowRegister,
              siteName: siteName.trim(),
              slogan: slogan.trim(),
              banner: banner.trim(),
            })
          }
        >
          {busy ? '保存中…' : '保存设置'}
        </button>
      </div>
    </div>
  );
}

/** 账号管理：注册用户增删改（站长自己不在列表里，走环境变量 PASSWORD） */
function UsersPanel({
  accounts,
  busy,
  act,
}: {
  accounts: AccountInfo[];
  busy: string | null;
  act: (key: string, payload: Record<string, unknown>, okMsg: string) => Promise<void>;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nick, setNick] = useState('');
  const [pwdFor, setPwdFor] = useState<string | null>(null);
  const [pwdValue, setPwdValue] = useState('');

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-line bg-card p-3">
        <div className="text-sm font-medium text-content mb-2">手动建号</div>
        <div className="grid gap-1.5 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="用户名"
            className="input text-sm"
            autoCapitalize="none"
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="密码（≥6 位）"
            className="input text-sm"
          />
          <input
            value={nick}
            onChange={(e) => setNick(e.target.value)}
            placeholder="昵称（可选）"
            className="input text-sm"
          />
          <button
            type="button"
            className="btn-primary btn-sm"
            disabled={busy === 'uc' || !username || password.length < 6}
            onClick={async () => {
              await act('uc', { action: 'user.create', username, password, nick }, '账号已创建');
              setUsername('');
              setPassword('');
              setNick('');
            }}
          >
            创建
          </button>
        </div>
      </div>

      {accounts.length === 0 ? (
        <EmptyState
          icon="user"
          title="还没有注册用户"
          description="开放注册后访客可在 /login 自助注册；也可以关闭注册在这里手动建号。"
        />
      ) : (
        <ul className="space-y-2">
          {accounts.map((a) => (
            <li key={a.id} className="rounded-lg border border-line bg-card px-3 py-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-content">{a.nick || a.username}</span>
                {a.nick && <span className="text-[11px] text-faint">@{a.username}</span>}
                <span
                  className={cn(
                    'tag px-1.5 py-0.5 text-[11px]',
                    a.disabled ? 'bg-line text-faint' : 'bg-accent/15 text-accent'
                  )}
                >
                  {a.disabled ? '已停用' : '正常'}
                </span>
                <span className="ml-auto text-[11px] text-faint">
                  {a.lastLoginAt ? `最近登录 ${new Date(a.lastLoginAt).toLocaleString('zh-CN')}` : '从未登录'}
                </span>
              </div>
              <div className="mt-1 text-[11px] text-faint">
                注册于 {new Date(a.createdAt).toLocaleString('zh-CN')}
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className="chip bg-chip text-muted hover:text-content border border-line py-1 px-2.5"
                  disabled={busy === `ud-${a.id}`}
                  onClick={() =>
                    void act(
                      `ud-${a.id}`,
                      { action: a.disabled ? 'user.enable' : 'user.disable', id: a.id },
                      a.disabled ? '账号已启用' : '账号已停用'
                    )
                  }
                >
                  {a.disabled ? '启用' : '停用'}
                </button>
                <button
                  type="button"
                  className="chip bg-chip text-muted hover:text-content border border-line py-1 px-2.5"
                  onClick={() => {
                    setPwdFor(pwdFor === a.id ? null : a.id);
                    setPwdValue('');
                  }}
                >
                  <Icon name="edit" className="w-3 h-3" />
                  重置密码
                </button>
                <button
                  type="button"
                  className="chip bg-chip text-faint hover:text-danger border border-line py-1 px-2.5"
                  disabled={busy === `ux-${a.id}`}
                  onClick={() => {
                    if (window.confirm(`删除账号 @${a.username}？该操作不可恢复。`)) {
                      void act(`ux-${a.id}`, { action: 'user.delete', id: a.id }, '账号已删除');
                    }
                  }}
                >
                  <Icon name="trash" className="w-3 h-3" />
                  删除
                </button>
              </div>

              {pwdFor === a.id && (
                <div className="mt-2 flex gap-1.5">
                  <input
                    value={pwdValue}
                    onChange={(e) => setPwdValue(e.target.value)}
                    placeholder="新密码（≥6 位）"
                    className="input flex-1 text-xs"
                  />
                  <button
                    type="button"
                    className="btn-primary btn-sm"
                    disabled={busy === `up-${a.id}` || pwdValue.length < 6}
                    onClick={async () => {
                      await act(`up-${a.id}`, { action: 'user.password', id: a.id, password: pwdValue }, '密码已重置');
                      setPwdFor(null);
                      setPwdValue('');
                    }}
                  >
                    保存
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
