/**
 * 站点品牌配置：所有对外的站名、文案、配色、功能开关集中在此。
 *
 * 改造思路：LibreTV 原本把 "LibreTV" 硬编码在 layout/header/footer/manifest 等处，
 * 这里统一收口成本地化站点配置，改站只需要改这一个文件（或用环境变量覆盖）。
 * 后端逻辑（采集站聚合、播放器、代理）保持原样不动。
 */

export interface SiteBrand {
  /** 站名：顶栏、标题、PWA */
  name: string;
  /** 顶栏 Logo 显示的字（默认取站名首字「看」） */
  mark: string;
  /** 副标题 / slogan（首页 hero 与 PWA description） */
  slogan: string;
  /** 首页搜索框占位文案 */
  searchPlaceholder: string;
  /** 页面标题模板：%s 为子页面标题 */
  titleTemplate: string;
  /** 首页主色（Tailwind 里通过 CSS 变量使用） */
  themeColor: string;
}

export interface SiteFeature {
  /** 求片（用户提交想看的片名） */
  request: boolean;
  /** 赞赏 + 留言板 */
  tip: boolean;
  /** 站长通知弹窗 */
  notice: boolean;
  /** 私密短剧（密码进入的竖屏连播） */
  shorts: boolean;
  /** 管理员后台 /admin */
  admin: boolean;
  /** 电视版 /tv */
  tv: boolean;
  /** 软件下载 /download */
  download: boolean;
  /** 榜单页（豆瓣多分类） */
  rank: boolean;
}

export interface SiteNavItem {
  key: string;
  label: string;
  href: string;
}

export const SITE: SiteBrand = {
  name: process.env.NEXT_PUBLIC_SITE_NAME || '看看电视',
  mark: process.env.NEXT_PUBLIC_SITE_MARK || '看',
  slogan: process.env.NEXT_PUBLIC_SITE_SLOGAN || '每日一部好片',
  searchPlaceholder:
    process.env.NEXT_PUBLIC_SITE_SEARCH_PLACEHOLDER || '搜索片名、演员、短剧',
  titleTemplate: process.env.NEXT_PUBLIC_SITE_TITLE_TEMPLATE || '%s · 看看电视',
  themeColor: process.env.NEXT_PUBLIC_SITE_THEME_COLOR || '#00a6ff',
};

export const FEATURES: SiteFeature = {
  request: process.env.NEXT_PUBLIC_FEATURE_REQUEST !== '0',
  tip: process.env.NEXT_PUBLIC_FEATURE_TIP !== '0',
  notice: process.env.NEXT_PUBLIC_FEATURE_NOTICE !== '0',
  shorts: process.env.NEXT_PUBLIC_FEATURE_SHORTS !== '0',
  admin: process.env.NEXT_PUBLIC_FEATURE_ADMIN !== '0',
  tv: process.env.NEXT_PUBLIC_FEATURE_TV !== '0',
  download: process.env.NEXT_PUBLIC_FEATURE_DOWNLOAD !== '0',
  rank: process.env.NEXT_PUBLIC_FEATURE_RANK !== '0',
};

/** 顶部主导航（与原站一致：首页 / 搜索 / 榜单 / 我的） */
export const NAV_ITEMS: SiteNavItem[] = [
  { key: 'home', label: '首页', href: '/' },
  { key: 'search', label: '搜索', href: '/search' },
  { key: 'rank', label: '榜单', href: '/rank' },
  { key: 'mine', label: '我的', href: '/mine' },
];

/** 底部标签栏（移动端） */
export const TAB_ITEMS: SiteNavItem[] = NAV_ITEMS;

/** 首页横滑板块：k = 豆瓣推荐 list key，label = 板块标题 */
export interface HomeRow {
  key: string;
  label: string;
  href: string;
  /** 空数组表示全部类型；'movie' / 'tv' 限定 */
  type?: 'movie' | 'tv';
  /** 豆瓣搜索标签（对应 movie.douban.com/j/search_subjects 的 tag） */
  tag: string;
}

export const HOME_ROWS: HomeRow[] = [
  { key: 'movie_hot_gaia', label: '豆瓣热门电影', href: '/rank?list=movie_hot_gaia', type: 'movie', tag: '热门' },
  { key: 'tv_hot', label: '热门剧集', href: '/rank?list=tv_hot', type: 'tv', tag: '热门' },
  { key: 'movie_high_score', label: '豆瓣高分', href: '/rank?list=movie_high_score', type: 'movie', tag: '豆瓣高分' },
];
