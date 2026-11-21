'use client';

import Link from 'next/link';
import { Header } from '@/components/header';
import { BottomTabs } from '@/components/bottom-tabs';
import { SiteFooter } from '@/components/site-footer';
import { Icon } from '@/components/icon';
import { SITE } from '@/lib/site';

/**
 * 软件下载页（对应原站 /download）。
 *
 * 原站这一页是「本站配套 App / 去广告版客户端 / 电视端 APK」的分发入口。
 * 这里把它做成可配置的分发清单：条目走环境变量（NEXT_PUBLIC_DOWNLOADS，
 * 逗号分隔的 `平台|名称|说明|链接`），没有配置就显示「暂未提供」，
 * 不硬编码任何第三方安装包地址——避免把来源不明的 APK 挂到自己站上。
 */

interface DownloadItem {
  platform: string;
  name: string;
  note: string;
  url: string;
}

function parseDownloads(raw: string | undefined): DownloadItem[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((seg) => seg.trim())
    .filter(Boolean)
    .map((seg) => {
      const [platform = '', name = '', note = '', url = ''] = seg.split('|').map((x) => x.trim());
      return { platform, name, note, url };
    })
    .filter((it) => it.name && it.url);
}

const DOWNLOADS = parseDownloads(process.env.NEXT_PUBLIC_DOWNLOADS);

const TIPS = [
  {
    icon: 'bolt' as const,
    title: '添加到主屏即可当 App 用',
    body: '本站是 PWA：iPhone 用 Safari「分享 → 添加到主屏幕」，安卓用浏览器菜单「安装应用」，图标、启动页、全屏体验都和原生 App 一致。',
  },
  {
    icon: 'tv' as const,
    title: '电视 / 投影用电视版',
    body: '在电视浏览器打开 /tv，支持遥控器方向键操作，一屏 12 部，翻页浏览。',
  },
  {
    icon: 'download' as const,
    title: '离线看：播放页可直接下载本集',
    body: '播放器右下角「下载本集」把 m3u8 切片合并成 MP4，存到本地。适合通勤、飞机上补剧。',
  },
];

export default function DownloadPage() {
  return (
    <div className="min-h-screen pb-16 sm:pb-0">
      <Header />

      <main className="max-w-3xl mx-auto px-4 py-5">
        <h1 className="text-lg font-semibold text-content flex items-center gap-2 mb-1">
          <i className="w-0.5 h-4 rounded-full bg-accent" aria-hidden />
          软件下载
        </h1>
        <p className="text-xs text-faint mb-4">在手机、平板、电视上装好 {SITE.name}，看片更顺手。</p>

        {DOWNLOADS.length > 0 ? (
          <ul className="space-y-2.5">
            {DOWNLOADS.map((it) => (
              <li
                key={`${it.name}-${it.url}`}
                className="flex items-center gap-3 rounded-lg border border-line bg-card px-3 py-3"
              >
                <div className="w-10 h-10 rounded-lg bg-accent/12 text-accent flex items-center justify-center shrink-0">
                  <Icon name="download" className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-content truncate">
                    {it.name}
                    {it.platform && <span className="ml-2 tag bg-chip text-faint">{it.platform}</span>}
                  </div>
                  {it.note && <p className="text-xs text-faint mt-0.5 line-clamp-2">{it.note}</p>}
                </div>
                <a
                  href={it.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="btn-primary btn-sm shrink-0"
                >
                  下载
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-lg border border-line bg-card px-4 py-6 text-center">
            <p className="text-sm text-content">暂未提供安装包</p>
            <p className="mt-1 text-xs text-faint">
              不需要装 App —— 本站是 PWA，用下面的方式「添加到主屏」即可。
            </p>
          </div>
        )}

        <h2 className="mt-6 mb-2 text-sm font-semibold text-content">安装与使用</h2>
        <ul className="space-y-2.5">
          {TIPS.map((t) => (
            <li key={t.title} className="rounded-lg border border-line bg-card px-3 py-3">
              <div className="flex items-center gap-2 text-sm font-medium text-content">
                <Icon name={t.icon} className="w-4 h-4 text-accent" />
                {t.title}
              </div>
              <p className="mt-1 text-xs text-muted leading-relaxed">{t.body}</p>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex flex-wrap gap-2">
          <Link href="/tv" className="btn-ghost btn-sm">
            <Icon name="tv" className="w-3.5 h-3.5" />
            打开电视版
          </Link>
          <Link href="/mine" className="btn-ghost btn-sm">
            <Icon name="user" className="w-3.5 h-3.5" />
            我的观影
          </Link>
        </div>
      </main>

      <SiteFooter />
      <BottomTabs />
    </div>
  );
}
