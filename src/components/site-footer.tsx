'use client';

import { SITE } from '@/lib/site';
import { useAuth } from '@/components/auth';

/**
 * 全站页脚。
 *
 * 相对上游 LibreTV 的改动：
 * 1. 品牌文案换成 SITE.name（不再打 LibreTV 的字样，站名统一走 src/lib/site.ts）；
 * 2. 上游更新检测（向 api.github.com 拉最新 tag）保留但默认关闭——
 *    自建站没必要把访客的浏览器引到 GitHub，也没必要为此多发一次外部请求。
 *    需要时把 NEXT_PUBLIC_UPSTREAM_CHECK 设为 '1' 即可恢复。
 * 3. 保留 AGPL-3.0 署名：这是上游协议的要求，去掉不合法。
 */

const UPSTREAM_CHECK = process.env.NEXT_PUBLIC_UPSTREAM_CHECK === '1';

export function SiteFooter() {
  const { version } = useAuth();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-line py-4">
      <div className="mx-auto max-w-3xl px-4 text-center text-xs text-faint space-y-1">
        <p>
          {SITE.name} · {SITE.slogan}
        </p>
        <p>
          {UPSTREAM_CHECK ? (
            <a
              href="https://github.com/try-tang/trytv"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-accent"
            >
              trytv{version ? ` v${version}` : ''}
            </a>
          ) : (
            <span>基于 LibreTV{version ? ` v${version}` : ''} 改造</span>
          )}
          {' · '}
          AGPL-3.0 License · {year}
        </p>
      </div>
    </footer>
  );
}
