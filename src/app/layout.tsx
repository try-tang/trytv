import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  title: {
    default: `${SITE.name} - ${SITE.slogan}`,
    template: SITE.titleTemplate.includes('%s')
      ? SITE.titleTemplate
      : `%s · ${SITE.name}`,
  },
  description: `${SITE.name}是一个在线影视聚合站：豆瓣榜单发现好片，多源聚合搜索，直接在浏览器里播放，无需注册。`,
  manifest: '/manifest.webmanifest',
  // 图标与门户站同一套：同一张 artwork 导出的多尺寸 + 根目录 favicon.ico 兜底。
  // 只声明单张 512 时，抓取端只能拿大图缩放，小尺寸下易糊、看起来「没填满」。
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48' },
      { url: '/icons/icon-96.png', sizes: '96x96', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  themeColor: SITE.themeColor,
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        {/* 首屏前同步主题，避免亮暗闪烁；站点默认深色（与原站一致） */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('libretv-theme')||'dark';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})()",
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
