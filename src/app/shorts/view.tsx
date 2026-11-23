'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/header';
import { Icon } from '@/components/icon';
import { SITE } from '@/lib/site';
import { cn } from '@/lib/utils';

/**
 * 私密短剧（对应原站 /shorts：密码进入·竖屏连看）。
 *
 * 设计取舍：
 * - 密码由站长用环境变量 SHORTS_PASSWORD 配置（服务端校验 /api/shorts，正确的口令换一个
 *   httpOnly 签名 cookie，页面本身不含任何视频地址），前端不硬编码；
 * - 竖屏连看：一条 vh 一屏，上下滑切集（scroll-snap），右侧点赞/收藏/分享浮层，
 *   播放器用原生 <video> + autoplay muted，进入即播，符合短视频站的习惯；
 * - 内容清单走 /api/shorts 下发（站长在 .data/site.json 里维护），避免公开仓库里挂着片源。
 *
 * 未配置密码时本站点默认关闭该功能（FEATURES.shorts 仍为开，但接口返回 503），
 * 站长配好 SHORTS_PASSWORD 才有内容可看。
 */

interface ShortItem {
  id: string;
  title: string;
  url: string;
  poster?: string;
  desc?: string;
  episodes?: { t: string; u: string }[];
}

function ShortsPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [checking, setChecking] = useState(true);
  const [pwd, setPwd] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<ShortItem[]>([]);

  // 已解锁过（cookie 还在）就直接进
  useEffect(() => {
    let alive = true;
    fetch('/api/shorts', { cache: 'no-store' })
      .then(async (res) => {
        if (!alive) return;
        if (res.ok) {
          const data = (await res.json()) as { items?: ShortItem[] };
          setItems(data.items ?? []);
          setUnlocked(true);
        } else if (res.status === 503) {
          setErr('站长还没配置短剧口令，这个功能暂时没开。');
        }
      })
      .catch(() => {
        /* 网络异常当作未解锁 */
      })
      .finally(() => {
        if (alive) setChecking(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const value = pwd.trim();
      if (!value) return;
      setBusy(true);
      setErr('');
      try {
        const res = await fetch('/api/shorts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: value }),
        });
        const data = (await res.json().catch(() => ({}))) as { items?: ShortItem[]; error?: string };
        if (!res.ok) {
          setErr(data.error || '口令不对');
          return;
        }
        setItems(data.items ?? []);
        setUnlocked(true);
        setPwd('');
      } catch {
        setErr('网络异常，稍后再试');
      } finally {
        setBusy(false);
      }
    },
    [pwd],
  );

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!unlocked) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="max-w-sm mx-auto px-4 py-16">
          <div className="rounded-xl border border-line bg-card p-5 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-accent/12 text-accent flex items-center justify-center">
              <Icon name="star" className="w-6 h-6" />
            </div>
            <h1 className="mt-3 text-base font-semibold text-content">私密短剧</h1>
            <p className="mt-1 text-xs text-faint">输入口令进入，竖屏连看。</p>
            <form onSubmit={submit} className="mt-4 space-y-2">
              <input
                type="password"
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                placeholder="口令"
                className="input w-full text-center tracking-widest"
                autoFocus
              />
              {err && <p className="text-xs text-danger">{err}</p>}
              <button type="submit" className="btn-primary w-full" disabled={busy}>
                {busy ? '校验中…' : '进入'}
              </button>
            </form>
            <Link href="/" className="mt-3 inline-block text-xs text-faint hover:text-content">
              返回首页
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center px-4 text-center">
          <div>
            <p className="text-sm text-content">还没有短剧</p>
            <p className="mt-1 text-xs text-faint">站长在 .data/site.json 的 shorts 里加内容后这里就会出现。</p>
          </div>
        </main>
      </div>
    );
  }

  return <ShortsFeed items={items} />;
}

function ShortsFeed({ items }: { items: ShortItem[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(true);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  // 滚动定位：滑到哪一屏播哪一个，其余暂停
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const onScroll = () => {
      const idx = Math.round(root.scrollTop / root.clientHeight);
      setActive(idx);
    };
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => root.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    videoRefs.current.forEach((v, i) => {
      if (!v) return;
      if (i === active) {
        v.play().catch(() => {
          /* 自动播放被拦，等用户点一下 */
        });
      } else {
        v.pause();
        v.currentTime = 0;
      }
    });
  }, [active]);

  return (
    <div className="h-[100dvh] bg-black relative">
      {/* 顶部返回 */}
      <div className="absolute top-0 inset-x-0 z-20 flex items-center gap-2 px-3 py-3 bg-gradient-to-b from-black/70 to-transparent">
        <Link href="/" className="text-white/85 hover:text-white" aria-label="返回">
          <Icon name="arrowLeft" className="w-5 h-5" />
        </Link>
        <span className="text-sm font-medium text-white/90">{SITE.name} · 短剧</span>
        <span className="ml-auto text-xs text-white/50">
          {active + 1}/{items.length}
        </span>
      </div>

      <div
        ref={containerRef}
        className="h-full overflow-y-scroll snap-y snap-mandatory scroll-smooth scrollbar-none"
      >
        {items.map((item, i) => (
          <section key={item.id} className="relative h-[100dvh] snap-start flex items-center justify-center">
            <video
              ref={(el) => {
                videoRefs.current[i] = el;
              }}
              src={item.url}
              poster={item.poster}
              playsInline
              muted={muted}
              loop
              controls={false}
              preload={i <= 1 ? 'auto' : 'none'}
              className="w-full h-full object-contain bg-black"
              onClick={(e) => {
                const v = e.currentTarget;
                if (v.paused) void v.play();
                else v.pause();
              }}
            />

            {/* 底部信息浮层 */}
            <div className="absolute bottom-0 inset-x-0 p-4 pb-8 bg-gradient-to-t from-black/85 via-black/40 to-transparent">
              <h2 className="text-base font-semibold text-white">{item.title}</h2>
              {item.desc && <p className="mt-1 text-xs text-white/70 line-clamp-3">{item.desc}</p>}

              {item.episodes && item.episodes.length > 1 && (
                <div className="mt-2.5 flex gap-1.5 overflow-x-auto scrollbar-thin">
                  {item.episodes.map((ep, k) => (
                    <a
                      key={`${ep.u}-${k}`}
                      href={`#ep-${i}-${k}`}
                      onClick={(e) => {
                        e.preventDefault();
                        const v = videoRefs.current[i];
                        if (!v) return;
                        v.src = ep.u;
                        v.load();
                        void v.play().catch(() => {});
                      }}
                      className={cn(
                        'shrink-0 rounded-full px-2.5 py-1 text-[11px] border',
                        'border-white/20 bg-white/10 text-white/80 hover:bg-white/20',
                      )}
                    >
                      {ep.t}
                    </a>
                  ))}
                </div>
              )}
            </div>

            {/* 右侧操作浮层 */}
            <div className="absolute right-3 bottom-24 flex flex-col items-center gap-4 text-white/85">
              <button
                type="button"
                aria-label={muted ? '取消静音' : '静音'}
                onClick={() => {
                  const v = videoRefs.current[i];
                  if (!v) return;
                  v.muted = !v.muted;
                  setMuted(v.muted);
                }}
                className="w-10 h-10 rounded-full bg-white/12 backdrop-blur flex items-center justify-center"
              >
                <Icon name={muted ? 'volumeMute' : 'volume'} className="w-4 h-4" />
              </button>
              <button
                type="button"
                aria-label="全屏"
                onClick={() => {
                  const v = videoRefs.current[i];
                  if (!v) return;
                  if (document.fullscreenElement) void document.exitFullscreen();
                  else void v.requestFullscreen?.();
                }}
                className="w-10 h-10 rounded-full bg-white/12 backdrop-blur flex items-center justify-center"
              >
                <Icon name="expand" className="w-4 h-4" />
              </button>
            </div>
          </section>
        ))}
      </div>

      {/* 滑动提示 */}
      {active === 0 && items.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[11px] text-white/50 animate-bounce">
          上滑看下一部
        </div>
      )}
    </div>
  );
}

export default function View() {
  return <ShortsPage />;
}
