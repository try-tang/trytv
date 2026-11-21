import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/site';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE.name} - ${SITE.slogan}`,
    short_name: SITE.name,
    description: `${SITE.name}：豆瓣榜单发现好片，多源聚合搜索，浏览器直接播放`,
    start_url: '/',
    display: 'standalone',
    background_color: '#08080a',
    theme_color: SITE.themeColor,
    // 手机端「添加到桌面」后全屏运行（对应原站 pwa.css 的 safe-area 处理）
    orientation: 'portrait',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
