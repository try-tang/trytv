'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/icon';
import { EmptyState } from '@/components/states';
import type { RequestEntry, TipEntry, NoticeInfo } from '@/lib/site-client';
import { cn } from '@/lib/utils';
import type { SettingsInfo, ShortInfo, AccountInfo } from './admin-types';

export type AdminAct = (key: string, payload: Record<string, unknown>, okMsg: string) => Promise<void>;

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

export function RequestsTable({
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

export function TipsTable({
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

export function NoticeEditor({
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
export function SettingsPanel({
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
  const [adultFilter, setAdultFilter] = useState(settings?.adultFilter === true);

  useEffect(() => {
    setMode(settings?.accessMode ?? 'open');
    setAllowRegister(settings?.allowRegister ?? true);
    setSiteName(settings?.siteName ?? '');
    setSlogan(settings?.slogan ?? '');
    setBanner(settings?.banner ?? '');
    setAdultFilter(settings?.adultFilter === true);
  }, [settings]);

  const dirty =
    mode !== (settings?.accessMode ?? 'open') ||
    allowRegister !== (settings?.allowRegister ?? true) ||
    siteName !== (settings?.siteName ?? '') ||
    slogan !== (settings?.slogan ?? '') ||
    banner !== (settings?.banner ?? '') ||
    adultFilter !== (settings?.adultFilter === true);

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

      <div className="rounded-lg border border-line bg-card p-3">
        <div className="text-sm font-medium text-content mb-1">内容过滤</div>
        <p className="text-[11px] text-faint mb-2.5">
          对应上游 LibreTV 的「成人内容过滤」，现在由站点统一决定，不再跟着各自浏览器走。
        </p>
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={adultFilter}
            onChange={(e) => setAdultFilter(e.target.checked)}
            className="mt-0.5 accent-[rgb(var(--c-accent))]"
          />
          <span className="min-w-0">
            <span className="block text-sm text-content">过滤成人内容</span>
            <span className="block text-[11px] text-faint mt-0.5 leading-relaxed">
              勾选后，「伦理片」等分类的结果与成人采集源会被排除；默认不勾选。
            </span>
          </span>
        </label>
        <p className="text-[11px] text-faint mt-2.5">
          私密短剧的开关与口令在「
          <span className="text-accent">私密短剧</span>
          」标签页里设置。
        </p>
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
              adultFilter,
            })
          }
        >
          {busy ? '保存中…' : '保存设置'}
        </button>
      </div>
    </div>
  );
}

/**
 * 私密短剧：入口开关 + 口令 + 清单。
 *
 * 对应原站「我的 → 私密短剧（密码进入 · 竖屏连看）」，这里把两件事放到后台：
 * 1. 口令：只存 scrypt 哈希（lib/users.ts 的 hashPassword），面板永远拿不回明文，
 *    只能「重设」；环境变量 SHORTS_PASSWORD 仍然有效，两者任一匹配即可进；
 * 2. 清单：片源地址不进代码、不写 HTML，只有 /api/shorts 校验 cookie 后下发。
 */
export function ShortsPanel({
  settings,
  shorts,
  busy,
  act,
}: {
  settings: SettingsInfo | null;
  shorts: ShortInfo[];
  busy: string | null;
  act: (key: string, payload: Record<string, unknown>, okMsg: string) => Promise<void>;
}) {
  const enabled = settings?.shortsEnabled !== false;
  const passwordSet = Boolean(settings?.shortsPasswordHash);
  const [pw, setPw] = useState('');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [poster, setPoster] = useState('');
  const [desc, setDesc] = useState('');
  const [editing, setEditing] = useState<string | null>(null);

  const resetForm = () => {
    setEditing(null);
    setTitle('');
    setUrl('');
    setPoster('');
    setDesc('');
  };

  const startEdit = (item: ShortInfo) => {
    setEditing(item.id);
    setTitle(item.title);
    setUrl(item.url);
    setPoster(item.poster ?? '');
    setDesc(item.desc ?? '');
  };

  const submitItem = () => {
    const payload = {
      title: title.trim(),
      url: url.trim(),
      poster: poster.trim(),
      desc: desc.trim(),
    };
    if (!payload.title || !payload.url) return;
    if (editing) {
      void act('shorts-item', { action: 'shorts.update', id: editing, ...payload }, '已更新').then(
        resetForm
      );
    } else {
      void act('shorts-item', { action: 'shorts.add', ...payload }, '已添加').then(resetForm);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-line bg-card p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium text-content">私密短剧</div>
            <p className="text-[11px] text-faint mt-0.5 leading-relaxed">
              访客从「我的 → 私密短剧」进入，输对口令后竖屏连看；片源地址只在口令校验通过后下发，
              页面 HTML 里看不到。
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={enabled}
              disabled={busy === 'shorts-toggle'}
              onChange={(e) =>
                void act('shorts-toggle', { action: 'shorts.save', enabled: e.target.checked }, e.target.checked ? '短剧入口已开启' : '短剧入口已关闭')
              }
              className="accent-[rgb(var(--c-accent))]"
            />
            开启入口
          </label>
        </div>

        <div className="mt-3 rounded-lg border border-line bg-chip/40 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-content">进入口令</span>
            <span className={cn('text-[11px]', passwordSet ? 'text-accent' : 'text-faint')}>
              {passwordSet
                ? `已设置${settings?.shortsPasswordAt ? `（${new Date(settings.shortsPasswordAt).toLocaleDateString('zh-CN')}）` : ''}`
                : '未设置'}
            </span>
          </div>
          <div className="mt-2 flex gap-2">
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder={passwordSet ? '输入新口令以重设（至少 4 位）' : '设置一个口令（至少 4 位）'}
              className="input w-full text-sm"
              autoComplete="new-password"
            />
            <button
              type="button"
              className="btn-primary btn-sm shrink-0"
              disabled={busy === 'shorts-pw' || !pw.trim()}
              onClick={() => {
                void act('shorts-pw', { action: 'shorts.save', password: pw.trim() }, '口令已更新').then(
                  () => setPw('')
                );
              }}
            >
              {busy === 'shorts-pw' ? '保存中…' : '保存口令'}
            </button>
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <p className="text-[11px] text-faint">
              口令以哈希形式保存在 .data/site.json，服务器上找不到明文。
            </p>
            {passwordSet && (
              <button
                type="button"
                className="text-[11px] text-danger hover:underline shrink-0"
                disabled={busy === 'shorts-pw'}
                onClick={() => void act('shorts-pw', { action: 'shorts.save', password: '' }, '口令已清除')}
              >
                清除口令
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-card p-3">
        <div className="text-sm font-medium text-content mb-2">
          {editing ? '编辑短剧' : '添加短剧'}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="block text-[11px] text-faint mb-1">片名（必填）</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="input w-full text-sm" />
          </label>
          <label className="block">
            <span className="block text-[11px] text-faint mb-1">视频直链（mp4 / m3u8）</span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/a.m3u8"
              className="input w-full text-sm"
            />
          </label>
          <label className="block">
            <span className="block text-[11px] text-faint mb-1">竖版封面（可选）</span>
            <input value={poster} onChange={(e) => setPoster(e.target.value)} className="input w-full text-sm" />
          </label>
          <label className="block">
            <span className="block text-[11px] text-faint mb-1">简介（可选）</span>
            <input value={desc} onChange={(e) => setDesc(e.target.value)} className="input w-full text-sm" />
          </label>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            className="btn-primary btn-sm"
            disabled={busy === 'shorts-item' || !title.trim() || !url.trim()}
            onClick={submitItem}
          >
            {busy === 'shorts-item' ? '保存中…' : editing ? '保存修改' : '添加'}
          </button>
          {editing && (
            <button type="button" className="btn-ghost btn-sm" onClick={resetForm}>
              取消编辑
            </button>
          )}
          <span className="text-[11px] text-faint">需要多集时，直接改 .data/site.json 里的 episodes 数组。</span>
        </div>
      </div>

      {shorts.length === 0 ? (
        <EmptyState icon="tv" title="还没有短剧" description="用上面的表单添加一条，访客输对口令就能看到。" />
      ) : (
        <div className="space-y-1.5">
          {shorts.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-lg border border-line bg-card px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm text-content truncate">{item.title}</div>
                <div className="text-[11px] text-faint truncate">{item.url}</div>
              </div>
              <button type="button" className="btn-ghost btn-sm shrink-0" onClick={() => startEdit(item)}>
                编辑
              </button>
              <button
                type="button"
                className="btn-ghost btn-sm shrink-0 text-danger"
                disabled={busy === 'shorts-item'}
                onClick={() =>
                  void act('shorts-item', { action: 'shorts.delete', id: item.id }, '已删除')
                }
              >
                删除
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** 账号管理：注册用户增删改（站长自己不在列表里，走环境变量 PASSWORD） */
export function UsersPanel({
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

/**
 * 后台各段落的元信息：左侧索引与「下一个」跳转都读它。
 * id 必须与页面 URL 的 hash（`/admin#settings`）一致，刷新后能停在原处。
 */
export const ADMIN_SECTIONS = [
  { id: 'access', title: '谁可以看', hint: '开放 / 登录后 / 仅注册用户，以及是否开放注册' },
  { id: 'brand', title: '站名与文案', hint: '留空就用部署时的默认值' },
  { id: 'filter', title: '内容过滤', hint: '成人内容是否在站点范围内隐藏' },
] as const;
