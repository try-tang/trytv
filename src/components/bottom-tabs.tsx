'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from '@/components/icon';
import { cn } from '@/lib/utils';
import { NAV_ITEMS, FEATURES } from '@/lib/site';

/**
 * 移动端底部标签栏：对应原站 .tabbar（4 个 view-tab，56px 高，safe-area 适配）。
 * 桌面隐藏，靠顶栏导航。
 */

const TAB_ICONS: Record<string, IconName> = {
  home: 'home',
  search: 'search',
  rank: 'chart',
  mine: 'user',
};

export function BottomTabs() {
  const pathname = usePathname();

  const items = NAV_ITEMS.filter((item) => {
    if (item.key === 'rank') return FEATURES.rank;
    if (item.key === 'search') return FEATURES.rank; // 搜索与榜单同批开关，缺榜单时也不单独留搜索
    return true;
  });

  return (
    <nav
      aria-label="底部导航"
      className="sm:hidden fixed bottom-0 inset-x-0 z-30 border-t border-line bg-page/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex">
        {items.map((item) => {
          const active =
            item.key === 'home' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex-1 h-14 flex flex-col items-center justify-center gap-0.5 text-[11px] transition-colors',
                active ? 'text-accent' : 'text-faint active:text-muted'
              )}
            >
              <Icon name={TAB_ICONS[item.key] ?? 'home'} className="w-5 h-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
