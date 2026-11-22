'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { FEATURES, SITE } from '@/lib/site';
import { useToast } from './toast';
import { useAccess } from './access';
import { useNoticePopup, requestApi, tipApi } from '@/lib/site-client';
import type { TipEntry } from '@/lib/site-data';
import { useFocusTrap } from './use-focus-trap';
import { Icon } from './icon';

/**
 * 服务区：对应原站「我的」页底部那组 svc-item（求片 / 赞赏支持 / 赞赏留言板 /
 * 站长通知 / 私密短剧 / 软件下载 / 电视版 / 管理员后台）。
 *
 * 只挂载在「我的」页：首页与搜索页不再显示这块（站长要求服务区收进我的）。
 */
export function ServiceSheet() {
  const [sheet, setSheet] = useState<null | 'request' | 'tip' | 'tipwall' | 'notice'>(null);
  const { toast } = useToast();
  const noticePopup = useNoticePopup();
  const { shortsEnabled } = useAccess();

  const items: { key: string; icon: string; label: string; note?: string; href?: string; onClick?: () => void }[] = [];

  if (FEATURES.request) {
    items.push({ key: 'request', icon: '📝', label: '求片', onClick: () => setSheet('request') });
  }
  if (FEATURES.tip) {
    items.push({
      key: 'tip',
      icon: '💰',
      label: '赞赏支持',
      note: '全部用于服务器',
      onClick: () => setSheet('tip'),
    });
    items.push({ key: 'tipwall', icon: '💬', label: '赞赏留言板', onClick: () => setSheet('tipwall') });
  }
  if (FEATURES.notice) {
    items.push({ key: 'notice', icon: '📢', label: '站长通知', onClick: () => setSheet('notice') });
  }
  // 短剧入口受后台「站点设置 → 私密短剧」开关控制：关掉后这里直接不显示
  if (FEATURES.shorts && shortsEnabled) {
    items.push({ key: 'shorts', icon: '🔒', label: '私密短剧', note: '密码进入', href: '/shorts' });
  }
  if (FEATURES.download) {
    items.push({ key: 'download', icon: '⬇', label: '软件下载', note: '安卓手机和电视', href: '/download' });
  }
  if (FEATURES.tv) {
    items.push({ key: 'tv', icon: '📺', label: '打开电视版', href: '/tv' });
  }
  if (FEATURES.admin) {
    items.push({ key: 'admin', icon: '⚙', label: '管理员后台', href: '/admin' });
  }

  return (
    <>
      <div className="rounded-lg border border-line bg-card overflow-hidden divide-y divide-line">
        {items.map((item) =>
          item.href ? (
            <Link
              key={item.key}
              href={item.href}
              className="flex items-center gap-3 px-3.5 py-3 text-sm text-muted hover:bg-hover hover:text-content transition-colors"
            >
              <span className="w-5 text-center" aria-hidden>
                {item.icon}
              </span>
              <span className="flex-1">{item.label}</span>
              {item.note && <span className="text-[11px] text-faint">{item.note}</span>}
              <span className="text-faint" aria-hidden>
                ›
              </span>
            </Link>
          ) : (
            <button
              key={item.key}
              type="button"
              onClick={item.onClick}
              className="w-full flex items-center gap-3 px-3.5 py-3 text-sm text-muted hover:bg-hover hover:text-content transition-colors text-left"
            >
              <span className="w-5 text-center" aria-hidden>
                {item.icon}
              </span>
              <span className="flex-1">{item.label}</span>
              {item.note && <span className="text-[11px] text-faint">{item.note}</span>}
              <span className="text-faint" aria-hidden>
                ›
              </span>
            </button>
          )
        )}
      </div>

      <RequestModal open={sheet === 'request'} onClose={() => setSheet(null)} onDone={() => toast('求片已提交，留意站长处理进度', 'success')} />
      <TipModal open={sheet === 'tip'} onClose={() => setSheet(null)} onDone={() => toast('留言已提交，站长核对后上墙', 'success')} />
      <TipWallModal open={sheet === 'tipwall'} onClose={() => setSheet(null)} onTip={() => setSheet('tip')} />
      <NoticeModal
        open={sheet === 'notice' || noticePopup.open}
        onClose={() => {
          setSheet(null);
          noticePopup.close();
        }}
      />
    </>
  );
}

// —— 通用弹窗外壳（对齐原站 .jw-modal / .jw-modal-card） ——

function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(open, panelRef);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4 py-6 animate-fade-in"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl border border-line bg-surface p-5 shadow-2xl scrollbar-thin"
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <h3 className="text-base font-semibold text-content">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="p-1 -m-1 rounded text-faint hover:text-content"
          >
            <Icon name="close" className="w-4 h-4" />
          </button>
        </div>
        {subtitle && <p className="text-xs text-faint mb-3 leading-relaxed">{subtitle}</p>}
        {children}
        {actions && <div className="mt-4 flex items-center justify-end gap-2">{actions}</div>}
      </div>
    </div>
  );
}

// —— 求片 ——

function RequestModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [nick, setNick] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('片名不能为空');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await requestApi.submit({ title: title.trim(), note: note.trim() || undefined, nick: nick.trim() || undefined });
      setTitle('');
      setNote('');
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="📝 求片"
      subtitle="没搜到的片填这里。新剧采集站通常要晚几天才收录，站长看到会去跟进。"
    >
      <form onSubmit={submit} className="space-y-2.5">
        <input
          className="input w-full"
          maxLength={60}
          placeholder="片名（必填）"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="input w-full resize-none"
          rows={2}
          maxLength={200}
          placeholder="补充信息（选填）：哪年的、哪国的、主演是谁、在哪看到的…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <input
          className="input w-full"
          maxLength={24}
          placeholder="昵称（留空为匿名，填了可以查进度）"
          value={nick}
          onChange={(e) => setNick(e.target.value)}
        />
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost btn-sm" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="btn-primary btn-sm" disabled={busy}>
            {busy ? '提交中…' : '提交求片'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// —— 赞赏 ——

function TipModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState('');
  const [nick, setNick] = useState('');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value < 1) {
      setError('填一下赞赏金额（1 元起）');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await tipApi.submit({ amount: value, nick: nick.trim() || undefined, content: content.trim() || undefined });
      setAmount('');
      setContent('');
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="💰 赞赏支持"
      subtitle="纯公益站点，赞赏全部用于服务器成本，不提供任何特权。"
    >
      <div className="grid grid-cols-2 gap-2 mb-3">
        {[
          { src: '/img/alipay.jpg', label: '支付宝' },
          { src: '/img/wechat.png', label: '微信' },
        ].map((qr) => (
          <figure key={qr.label} className="rounded-lg border border-line bg-chip p-2 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr.src} alt={`${qr.label}收款码`} loading="lazy" className="w-full aspect-square object-contain" />
            <figcaption className="mt-1 text-[11px] text-faint">{qr.label}</figcaption>
          </figure>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-2.5">
        <div className="grid grid-cols-2 gap-2">
          <input
            className="input w-full"
            maxLength={24}
            placeholder="昵称（留空为匿名）"
            value={nick}
            onChange={(e) => setNick(e.target.value)}
          />
          <input
            className="input w-full"
            type="number"
            min={1}
            max={9999}
            placeholder="金额（元）"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <textarea
          className="input w-full resize-none"
          rows={3}
          maxLength={200}
          placeholder="想说的话（会展示在赞赏留言板）"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-[11px] text-faint">付完款填一下，站长核对后展示</span>
          <button type="submit" className="btn-primary btn-sm" disabled={busy}>
            {busy ? '提交中…' : '提交赞赏留言'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// —— 留言墙 ——

function TipWallModal({ open, onClose, onTip }: { open: boolean; onClose: () => void; onTip: () => void }) {
  // 昵称/留言都可能为空（匿名赞赏），所以直接用站点数据层给出的公开类型
  const [data, setData] = useState<{ total: number; items: TipEntry[] } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setData(null);
    setError('');
    tipApi
      .wall()
      .then((res) => setData({ total: res.total, items: res.items }))
      .catch((err) => setError(err instanceof Error ? err.message : '加载失败'));
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`服务器成本每月 ${process.env.NEXT_PUBLIC_SERVER_COST || '75'} 元｜已累计 ${data?.total ?? 0} 元`}
      actions={
        <>
          <button type="button" className="btn-ghost btn-sm" onClick={onClose}>
            关闭
          </button>
          <button type="button" className="btn-primary btn-sm" onClick={onTip}>
            我也支持一下
          </button>
        </>
      }
    >
      {error && <p className="text-xs text-danger">{error}</p>}
      {!data && !error && <p className="text-xs text-faint py-6 text-center">加载中…</p>}
      {data && data.items.length === 0 && (
        <p className="text-xs text-faint py-6 text-center">还没有公开的留言，做第一个支持的人吧。</p>
      )}
      <ul className="space-y-2">
        {data?.items.map((t) => (
          <li key={t.id} className="rounded-lg border border-line bg-chip px-3 py-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-content">{t.nick}</span>
              <span className="text-warning">¥{t.amount}</span>
            </div>
            {t.content && <p className="mt-1 text-xs text-muted leading-relaxed whitespace-pre-wrap">{t.content}</p>}
          </li>
        ))}
      </ul>
    </Modal>
  );
}

// —— 站长通知 ——

function NoticeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [notice, setNotice] = useState<{ body: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch('/api/notice', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setNotice(d?.notice ?? null))
      .catch(() => setNotice(null));
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="📢 站长通知"
      actions={
        <button type="button" className="btn-primary btn-sm" onClick={onClose}>
          知道了
        </button>
      }
    >
      <div className={cn('text-sm text-muted leading-relaxed whitespace-pre-wrap min-h-[3rem]')}>
        {notice?.body || `${SITE.name}已就绪，祝你观影愉快。`}
      </div>
    </Modal>
  );
}
