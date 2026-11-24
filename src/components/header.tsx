'use client';

import Link from 'next/link';
import { useState, type RefObject } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ThemeToggle } from './theme';
import { SourceManagerDrawer } from './source-manager';
import { HistoryPanel } from './history-panel';
import { requestShowDownloadManager } from './download-manager';
import { Icon, type IconName } from './icon';
import { SearchHistoryDropdown, useSearchHistory } from './search-history';
import { cn } from '@/lib/utils';
import { SITE, FEATURES, NAV_ITEMS } from '@/lib/site';
import { useAccess } from './access';
import { AccessGateModal } from './access-gate-modal';

/** 顶部导航：Logo、搜索框（首页外）、历史、设置 */
export function Header({
  showSearch = false,
  searchInputRef,
}: {
  showSearch?: boolean;
  /** 首页传进来的 ref：用于「/」快捷键聚焦顶栏搜索框 */
  searchInputRef?: RefObject<HTMLInputElement | null>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  /** 未登录时点设置：先弹登录/注册，登录成功后再打开设置抽屉 */
  const [gateOpen, setGateOpen] = useState(false);
  const access = useAccess();
  /** 移动端（<sm）折叠菜单：窄屏放不下 5 个导航项 + 3 个图标按钮 */
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  // 与首页搜索框共用同一套「最近搜索」下拉逻辑
  const searchHistory = useSearchHistory(query);

  const closeMenu = () => setMenuOpen(false);

  const submitSearch = (text: string) => {
    const q = text.trim().slice(0, 100);
    if (!q) return;
    searchHistory.close();
    closeMenu();
    router.push(`/?s=${encodeURIComponent(q)}`, { scroll: false });
    // 顶栏搜索一并写入最近搜索（此前只有首页会记录）
    searchHistory.record(q);
  };

  const pickHistory = (text: string) => {
    setQuery(text);
    submitSearch(text);
  };

  /**
   * 设置入口的准入判断：
   * - 站点开了「登录后可看 / 仅注册用户」→ 没登录过门槛就先要求登录；
   * - 站点是「所有人可看」但用户也没登录 → 让他在弹窗里自己选「登录 / 注册」
   *   （对应原站「点设置先选登录还是注册」的流程），或直接「先不登录，继续」；
   * - 已登录 → 直接开抽屉。
   * 这里只做前端「体验级」拦截：数据本身按账号存在浏览器里，
   * 真正的数据隔离由登录态决定，拦的不是权限而是「没登录时改了也没处存」。
   */
  const openSettings = () => {
    if (!access.ready) return;
    if (access.user || access.admin) {
      setSettingsOpen(true);
      return;
    }
    setGateOpen(true);
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur border-b border-line">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-2 sm:gap-3">
          {/* 品牌：原站是「一个字的方块 Logo + 站名」，比图片 Logo 更克制 */}
          <Link href="/" aria-label={`${SITE.name} 首页`} className="flex items-center gap-2 shrink-0">
            <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent to-[#0060ff] text-on-accent text-sm font-bold flex items-center justify-center">
              {SITE.mark}
            </span>
            <span className="hidden xs:inline text-[15px] font-semibold tracking-tight text-content">
              {SITE.name}
            </span>
          </Link>

          {showSearch && (
            <form
              className="flex-1 max-w-xl hidden sm:block"
              onSubmit={(e) => {
                e.preventDefault();
                submitSearch(query);
              }}
            >
              <div ref={searchHistory.containerRef} className="relative">
                <input
                  ref={searchInputRef}
                  className={cn(
                    'input w-full h-9',
                    // 展开时：上圆角与外框沿用聚焦样式，底边改为内部分隔线，与下拉拼成同一面板
                    searchHistory.visible &&
                      'rounded-b-none border-accent border-b-line bg-surface-raised focus-visible:ring-0'
                  )}
                  aria-label="搜索影片（片名、演员）"
                  placeholder={SITE.searchPlaceholder}
                  value={query}
                  maxLength={100}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    searchHistory.resetActive();
                  }}
                  onFocus={searchHistory.onFocus}
                  onKeyDown={(e) => searchHistory.onKeyDown(e, pickHistory)}
                  role="combobox"
                  aria-expanded={searchHistory.visible}
                  aria-controls="header-search-history"
                  aria-autocomplete="list"
                  aria-activedescendant={
                    searchHistory.visible && searchHistory.activeIndex >= 0
                      ? `header-search-history-${searchHistory.activeIndex}`
                      : undefined
                  }
                />
                {searchHistory.visible && (
                  <SearchHistoryDropdown
                    id="header-search-history"
                    matches={searchHistory.matches}
                    activeIndex={searchHistory.activeIndex}
                    onPick={pickHistory}
                    onRemove={searchHistory.remove}
                    onClearAll={searchHistory.clearAll}
                  />
                )}
              </div>
            </form>
          )}

          {/* 窄屏占位：把导航推到右侧（桌面搜索框已用 flex-1 占位，这里只为 <sm 留白） */}
          <div className="flex-1 sm:hidden" />

          {/* 桌面 / 平板：完整导航（与原站一致：首页 / 搜索 / 榜单 / 我的） */}
          <nav className="hidden sm:flex items-center gap-1 ml-auto">
            {NAV_ITEMS.filter((item) => item.key !== 'search' || FEATURES.rank).map((item) => (
              <HeaderLink
                key={item.key}
                href={item.href}
                active={item.key === 'home' ? pathname === '/' : pathname.startsWith(item.href)}
              >
                {item.label}
              </HeaderLink>
            ))}
            <span className="w-px h-4 bg-line mx-1" aria-hidden />
            <ThemeToggle />
            <IconButton label="观看历史" onClick={() => setHistoryOpen(true)}>
              <Icon name="clock" />
            </IconButton>
            <IconButton label="下载管理" onClick={requestShowDownloadManager}>
              <Icon name="download" />
            </IconButton>
            {/* 未登录时这里就是「登录」两个字的按钮（对应原站「右上角点开先登录」），
                已登录才回到齿轮（此时点开是设置抽屉：源、订阅、封面、站点与账号）。
                后台入口不在这里——它在设置抽屉的「站点与账号」和「我的」页账号卡里。 */}
            {access.ready && !access.user && !access.admin ? (
              <button
                type="button"
                onClick={openSettings}
                className="btn-primary btn-sm rounded-full px-3 ml-0.5 whitespace-nowrap"
              >
                登录
              </button>
            ) : (
              <IconButton label="设置" onClick={openSettings}>
                <Icon name="gear" />
              </IconButton>
            )}
          </nav>

          {/* 手机：设置直接露出（最常用），其余收进汉堡菜单 */}
          <div className="sm:hidden flex items-center gap-1 shrink-0">
            {/* 与菜单项一致：打开抽屉前先收起菜单，否则关掉设置后汉堡菜单还摊在那儿 */}
            {access.ready && !access.user && !access.admin ? (
              <button
                type="button"
                onClick={() => {
                  closeMenu();
                  openSettings();
                }}
                className="btn-primary btn-sm rounded-full px-2.5 whitespace-nowrap"
              >
                登录
              </button>
            ) : (
              <IconButton
                label="设置"
                onClick={() => {
                  closeMenu();
                  openSettings();
                }}
              >
                <Icon name="gear" />
              </IconButton>
            )}
            <IconButton
              label={menuOpen ? '关闭菜单' : '打开菜单'}
              expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <Icon name={menuOpen ? 'close' : 'menu'} />
            </IconButton>
          </div>
        </div>

        {/* 手机折叠菜单：链接 + 次要操作；点任一项后自动收起 */}
        {menuOpen && (
          <nav
            aria-label="主菜单"
            className="sm:hidden border-t border-line bg-surface/95 backdrop-blur px-3 py-2 pb-[calc(0.5rem_+_env(safe-area-inset-bottom))] animate-fade-in"
          >
            {/* 直播页顶栏有搜索框（<sm 隐藏）：这里补一个入口，进了直播页再搜频道 */}
            <div className="grid grid-cols-2 gap-1.5">
              {FEATURES.rank && (
                <MenuRow href="/rank" active={pathname.startsWith('/rank')} icon="chart" onNavigate={closeMenu}>
                  榜单
                </MenuRow>
              )}
              <MenuRow href="/mine" active={pathname.startsWith('/mine')} icon="user" onNavigate={closeMenu}>
                我的
              </MenuRow>
              {FEATURES.request && (
                <MenuRow href="/mine/request" active={false} icon="edit" onNavigate={closeMenu}>
                  求片
                </MenuRow>
              )}
              <MenuRow href="/live" active={pathname === '/live'} icon="bolt" onNavigate={closeMenu}>
                直播
              </MenuRow>
              <MenuRow href="/about" active={pathname === '/about'} icon="alert" onNavigate={closeMenu}>
                关于
              </MenuRow>
              <MenuAction
                icon="clock"
                onClick={() => {
                  closeMenu();
                  setHistoryOpen(true);
                }}
              >
                观看历史
              </MenuAction>
              <MenuAction
                icon="download"
                onClick={() => {
                  closeMenu();
                  requestShowDownloadManager();
                }}
              >
                下载管理
              </MenuAction>
              <MenuAction
                icon="gear"
                onClick={() => {
                  closeMenu();
                  openSettings();
                }}
              >
                设置
              </MenuAction>
              {FEATURES.admin && access.admin && (
                <MenuRow href="/admin" active={pathname.startsWith('/admin')} icon="gear" onNavigate={closeMenu}>
                  管理后台
                </MenuRow>
              )}
            </div>
            <div className="mt-1.5 flex items-center justify-between rounded-lg bg-chip px-3 py-2">
              <span className="text-xs text-muted">外观主题</span>
              <ThemeToggle />
            </div>
          </nav>
        )}
      </header>

      <AccessGateModal
        open={gateOpen}
        onClose={() => setGateOpen(false)}
        onSuccess={() => {
          setGateOpen(false);
          setSettingsOpen(true);
        }}
        // 「所有人可看」时登录不是硬性要求，给一个继续的出口，否则会被挡住
        onSkip={
          access.accessMode === 'open' && !access.admin
            ? () => {
                setGateOpen(false);
                setSettingsOpen(true);
              }
            : undefined
        }
        reason={
          access.accessMode === 'open'
            ? '登录后设置里的偏好（源、订阅、封面加载方式）会跟着账号保存；不登录也能改，只是换设备要重设。'
            : '本站需要登录才能浏览，先登录再打开设置。'
        }
      />
      <SourceManagerDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <HistoryPanel open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </>
  );
}

function HeaderLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        'px-2.5 py-1.5 rounded-md text-sm transition-colors',
        active ? 'text-content bg-hover' : 'text-muted hover:text-content'
      )}
    >
      {children}
    </Link>
  );
}

function IconButton({
  label,
  onClick,
  expanded,
  children,
}: {
  label: string;
  onClick: () => void;
  /** 展开态按钮（汉堡菜单）需要 aria-expanded 告知辅助技术 */
  expanded?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      className="p-2 rounded-md text-muted hover:text-content hover:bg-hover transition-colors"
      title={label}
      aria-label={label}
      aria-expanded={expanded}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** 手机折叠菜单里的导航项（整行可点，40px 高） */
function MenuRow({
  href,
  active,
  icon,
  onNavigate,
  children,
}: {
  href: string;
  active: boolean;
  icon: IconName;
  onNavigate: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        'flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition-colors',
        active ? 'bg-hover text-content' : 'text-muted hover:bg-hover hover:text-content'
      )}
    >
      <Icon name={icon} className="w-4 h-4 shrink-0" />
      {children}
    </Link>
  );
}

/** 手机折叠菜单里的动作项（打开抽屉，不是跳转） */
function MenuAction({
  icon,
  onClick,
  children,
}: {
  icon: IconName;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-muted hover:bg-hover hover:text-content transition-colors text-left"
    >
      <Icon name={icon} className="w-4 h-4 shrink-0" />
      {children}
    </button>
  );
}
