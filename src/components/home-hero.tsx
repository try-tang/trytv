'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/client-api';
import { useAppStore } from '@/lib/store';
import type { DoubanItem } from '@/lib/types';
import { Icon } from './icon';
import { SmartImage } from './smart-image';
import { cn } from '@/lib/utils';
import { HOME_ROWS } from '@/lib/site';

/**
 * 首页大 banner：左右两张「今日推荐」卡片轮播（电影 / 剧集各一张）。
 *
 * 对应原站 index.html 的 .hero / .hero-track / .hero-arrow / .hero-dots 结构，
 * 行为也照抄：自动轮播 6s、手指/鼠标横滑切页、左右箭头、圆点指示。
 * 数据复用现有 /api/douban（tag=热门），不再新增后端接口。
 */

const AUTO_MS = 6000;

/**
 * 豆瓣评分原样是字符串（"8.6"），但上游偶尔给 "暂无评分" / 空串 / null。
 * 直接 Number(x).toFixed(1) 会得到 "NaN"，所以统一走这里格式化。
 */
function formatRating(raw?: string | null): string {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n.toFixed(1) : String(raw ?? '');
}

interface HeroSlide {
  key: string;
  type: 'movie' | 'tv';
  tag: string;
}

const SLIDES: HeroSlide[] = [
  { key: 'movie', type: 'movie', tag: '热门' },
  { key: 'tv', type: 'tv', tag: '热门' },
];

export function HomeHero({ onPick }: { onPick: (title: string) => void }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  // 两张卡片各取 6 部候选，轮播时按索引轮换，避免每次都显示同一部。
  // 注意：hooks 不能写在 map 回调里，这里显式写两次，顺序恒定。
  const movieQuery = useQuery({
    queryKey: ['hero', 'movie', '热门'],
    queryFn: ({ signal }) => api.douban('movie', '热门', 0, 6, signal),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
  const tvQuery = useQuery({
    queryKey: ['hero', 'tv', '热门'],
    queryFn: ({ signal }) => api.douban('tv', '热门', 0, 6, signal),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
  const queries = [movieQuery, tvQuery];

  const [rotation, setRotation] = useState<number[]>([0, 0]);

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % SLIDES.length);
      setRotation(([a, b]) => [a + (Math.random() < 0.5 ? 1 : 0), b + (Math.random() < 0.5 ? 1 : 0)]);
    }, AUTO_MS);
    return () => clearInterval(timer);
  }, [paused]);

  // 程序化滚动的目标位置；用于区分「自己滚的」和「用户手指滚的」。
  // 不这么做的话，smooth 滚动途中触发的 scroll 事件会被 onScroll 换算成中间页，
  // setIndex 被回写成 1 又滚回头，轮播就卡在原地来回抖。
  const settleRef = useRef<{ target: number; until: number }>({ target: 0, until: 0 });

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const width = track.clientWidth || track.getBoundingClientRect().width;
    if (!width) return;
    const left = index * width;
    settleRef.current = { target: index, until: Date.now() + 900 };

    // 兜底：某些内核/内嵌 WebView 没有 Element.scrollTo（会抛 TypeError 把整块轮播带崩），
    // 退化为直接写 scrollLeft；smooth 不可用时也能保证位置正确。
    const behavior: ScrollBehavior = index > 0 ? 'smooth' : 'auto';
    try {
      if (typeof track.scrollTo === 'function') {
        track.scrollTo({ left, behavior });
        // smooth 滚动在部分浏览器里会被后续 layout 打断，短延时后再校准一次
        window.setTimeout(() => {
          if (Math.abs(track.scrollLeft - left) > 4) {
            try {
              track.scrollLeft = left;
            } catch {
              /* 忽略 */
            }
          }
        }, 420);
        return;
      }
    } catch {
      /* 落到下面的兜底 */
    }
    try {
      track.scrollLeft = left;
    } catch {
      /* 完全不可滚动就算了，别让轮播区把页面打成错误页 */
    }
  }, [index]);

  // 窗口尺寸变化后按比例重算位置（旋转屏幕 / 窗口拖动会改变 clientWidth）
  useEffect(() => {
    const onResize = () => {
      const track = trackRef.current;
      if (!track) return;
      const width = track.clientWidth;
      if (!width) return;
      try {
        track.scrollLeft = index * width;
      } catch {
        /* 忽略 */
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [index]);

  const go = useCallback((dir: -1 | 1) => {
    setIndex((i) => (i + dir + SLIDES.length) % SLIDES.length);
  }, []);

  return (
    <section
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="今日推荐"
    >
      <div
        ref={trackRef}
        className="flex overflow-x-hidden snap-x snap-mandatory"
        // 手指横滑后同步索引（原站 hero-track 同样是 scroll-snap 容器）
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.clientWidth === 0) return;
          const next = Math.round(el.scrollLeft / el.clientWidth);
          if (next < 0 || next >= SLIDES.length) return;
          // 自动轮播自己滚出来的事件：只认目标页，别把中间态写回索引
          const settle = settleRef.current;
          if (Date.now() < settle.until) {
            if (next !== settle.target) return;
            settleRef.current = { target: next, until: 0 };
          }
          if (next !== index) setIndex(next);
        }}
      >
        {SLIDES.map((slide, i) => {
          const data = queries[i].data?.items ?? [];
          // rotation[i] 来自 setRotation 的初始值 [0,0]；表面上永远有效，
          // 但任何一次 NaN / 越界（例如热更新后 state 与 SLIDES 长度错位）
          // 都会让 data[NaN] 变成 undefined 之后又被当成对象取属性。
          // 这里做一次兜底取模，避免整块轮播把首页打成错误页。
          const raw = rotation[i];
          const slot = Number.isFinite(raw) && data.length > 0 ? Math.abs(raw) % data.length : 0;
          const item: DoubanItem | undefined = data[slot];
          return (
            <div key={slide.key} className="min-w-full snap-center">
              <HeroCard
                item={item}
                loading={queries[i].isLoading}
                label={slide.type === 'movie' ? '今日电影' : '今日剧集'}
                onPick={onPick}
              />
            </div>
          );
        })}
      </div>

      <button
        type="button"
        aria-label="上一张"
        onClick={() => go(-1)}
        className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/45 text-white/85 backdrop-blur flex items-center justify-center hover:bg-black/65 transition-colors"
      >
        <Icon name="arrowLeft" className="w-4 h-4" />
      </button>
      <button
        type="button"
        aria-label="下一张"
        onClick={() => go(1)}
        className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/45 text-white/85 backdrop-blur flex items-center justify-center hover:bg-black/65 transition-colors"
      >
        <Icon name="arrowRight" className="w-4 h-4" />
      </button>

      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
        {SLIDES.map((slide, i) => (
          <button
            key={slide.key}
            type="button"
            aria-label={`第 ${i + 1} 张`}
            aria-current={i === index}
            onClick={() => setIndex(i)}
            className={cn(
              'h-1.5 rounded-full transition-all',
              i === index ? 'w-5 bg-white' : 'w-1.5 bg-white/40 hover:bg-white/60'
            )}
          />
        ))}
      </div>
    </section>
  );
}

function HeroCard({
  item,
  loading,
  label,
  onPick,
}: {
  item?: DoubanItem;
  loading: boolean;
  label: string;
  onPick: (title: string) => void;
}) {
  // 封面加载方式来自设置里的「封面图加载」：direct / proxy / custom 都要走 этой 组件
  const imageProxyMode = useAppStore((s) => s.imageProxyMode);
  const customImageProxy = useAppStore((s) => s.customImageProxy);
  if (loading) {
    return (
      <div className="relative w-full aspect-[21/9] sm:aspect-[24/9] max-h-[420px] bg-card animate-pulse" />
    );
  }
  if (!item) {
    return (
      <div className="relative w-full aspect-[21/9] sm:aspect-[24/9] max-h-[420px] bg-card flex items-center justify-center text-sm text-faint">
        今日推荐暂时取不到，稍后刷新看看
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-[21/9] sm:aspect-[24/9] max-h-[420px] overflow-hidden bg-[#0e0e12]">
      {/* 背景图：原站用同图做底并压暗，没有图时退回纯色。
          必须走 SmartImage：它会按「封面图加载」设置拼代理地址并做降级链，
          裸 <img src={item.cover}> 会绕过代理，豆瓣图床直连被墙时整片黑。 */}
      {item.cover && (
        <SmartImage
          url={item.cover}
          mode={imageProxyMode}
          customProxy={customImageProxy}
          alt=""
          className="absolute inset-0 w-full h-full object-cover scale-105 blur-[2px] opacity-45"
          loading="eager"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-page via-page/55 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-page/85 via-transparent to-transparent" />

      <div className="relative h-full max-w-6xl mx-auto px-4 sm:px-8 flex items-end pb-10 sm:pb-12 gap-4">
        {item.cover && (
          <SmartImage
            url={item.cover}
            mode={imageProxyMode}
            customProxy={customImageProxy}
            alt={item.title}
            className="hidden sm:block w-[92px] h-[132px] object-cover rounded-lg shadow-lg shadow-black/50 shrink-0"
            loading="eager"
          />
        )}
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1 rounded-full bg-accent text-on-accent text-[11px] font-semibold px-2 py-0.5 mb-2">
            {label}
          </div>
          <h1 className="text-xl sm:text-3xl font-bold text-content truncate">{item.title}</h1>
          <div className="mt-1.5 flex items-center gap-2 text-xs sm:text-sm text-muted">
            {item.rating && (
              <span className="text-rating font-semibold">★ {formatRating(item.rating)}</span>
            )}
            <span className="text-faint">·</span>
            <span>{item.isTv ? '剧集' : '电影'}</span>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onPick(item.title)}
              className="btn-primary h-9 px-4 rounded-full text-sm font-medium"
            >
              立即观看
            </button>
            <button
              type="button"
              onClick={() => onPick(item.title)}
              className="btn-ghost h-9 px-4 rounded-full text-sm"
            >
              找找其它源
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 首页横滑海报墙：一行一个板块（豆瓣热门电影 / 热门剧集 / 豆瓣高分）。
 * 与原站 .row / .row-head / .row-track 一致，右侧「更多 ›」进榜单页。
 */
export function HomeRowSection({
  row,
  onPick,
}: {
  row: (typeof HOME_ROWS)[number];
  onPick: (title: string) => void;
}) {
  const query = useQuery({
    queryKey: ['home-row', row.type, row.tag],
    queryFn: ({ signal }) => api.douban(row.type ?? 'movie', row.tag, 0, 20, signal),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
  const items = query.data?.items ?? [];
  // 与详情弹窗 / 历史面板一致：海报墙也按「封面图加载」设置走代理 + 降级链
  const imageProxyMode = useAppStore((s) => s.imageProxyMode);
  const customImageProxy = useAppStore((s) => s.customImageProxy);

  return (
    <section className="mt-7">
      <div className="flex items-center justify-between px-4 sm:px-0 mb-2.5">
        <h2 className="text-[15px] sm:text-base font-semibold text-content flex items-center gap-2">
          <i className="w-0.5 h-3.5 rounded-full bg-accent" aria-hidden />
          {row.label}
        </h2>
        <Link href={row.href} className="text-xs text-muted hover:text-content transition-colors">
          更多 ›
        </Link>
      </div>

      <div className="flex gap-2.5 overflow-x-auto pb-2 px-4 sm:px-0 snap-x scrollbar-thin">
        {query.isLoading &&
          Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="w-[108px] sm:w-[128px] shrink-0 aspect-[2/3] rounded-lg bg-card animate-pulse"
            />
          ))}

        {!query.isLoading && items.length === 0 && (
          <p className="text-xs text-faint py-6">这一栏暂时没有数据</p>
        )}

        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onPick(item.title)}
            className="group w-[108px] sm:w-[128px] shrink-0 snap-start text-left"
            title={item.title}
          >
            <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-chip">
              {item.cover ? (
                <SmartImage
                  url={item.cover}
                  mode={imageProxyMode}
                  customProxy={customImageProxy}
                  alt={item.title}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[11px] text-faint px-1 text-center">
                  {item.title}
                </div>
              )}
              {item.rating && (
                <span className="absolute top-1 left-1 rounded bg-black/70 text-rating text-[11px] font-semibold px-1 py-0.5">
                  {formatRating(item.rating)}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-xs text-muted truncate group-hover:text-content transition-colors">
              {item.title}
            </p>
          </button>
        ))}
      </div>
    </section>
  );
}
