import { NextResponse } from 'next/server';
import { isPasswordConfigured, sessionFromCookieHeader } from '@/lib/auth';
import { getSettings } from '@/lib/site-data';
import { currentUserFromRequest } from '@/lib/users';
import { getEnvSources } from '@/lib/env-sources';
import { getEnvLiveSources } from '@/lib/env-live-sources';
import { getEnvSubscriptions } from '@/lib/env-subscriptions';
import { getEnvRecommendSource } from '@/lib/env-recommend-source';
import { getEnvImageMode } from '@/lib/env-image-mode';
import { SITE } from '@/lib/site';

export const runtime = 'nodejs';

/**
 * 站点状态：客户端据此决定是否弹出登录框 / 是否需要注册 /
 * 提示管理员配置密码，并获取预置采集站与预置直播源。
 *
 * 新增字段（后台「站点设置」）：
 * - accessMode：open=所有人可看 / login=登录后可看 / members=仅注册用户
 * - allowRegister：是否开放注册
 * - userLoggedIn / userNick：当前注册用户
 * - siteName / slogan / banner：后台可覆盖的站名与文案（null 表示用代码里的默认）
 */
export async function GET(req: Request) {
  const passwordRequired = isPasswordConfigured();
  const verified = passwordRequired && sessionFromCookieHeader(req.headers.get('cookie'));
  const settings = getSettings();
  const cur = currentUserFromRequest(req);
  return NextResponse.json({
    passwordRequired,
    verified,
    // 构建时由 next.config.ts 从 package.json 注入
    version: process.env.APP_VERSION || 'dev',
    // —— 访问策略 ——
    accessMode: settings.accessMode,
    allowRegister: settings.allowRegister,
    userLoggedIn: Boolean(cur),
    userNick: cur ? cur.user.nick || cur.user.username : null,
    // —— 站点文案（后台可改，null 时前端用 SITE 默认值）——
    siteName: settings.siteName || null,
    slogan: settings.slogan || null,
    banner: settings.banner || null,
    defaultSiteName: SITE.name,
    // 部署者通过 DEFAULT_SOURCES 预置的采集站
    defaultSources: getEnvSources(),
    // 部署者通过 DEFAULT_LIVE_SOURCES 预置的直播源（M3U 订阅）
    defaultLiveSources: getEnvLiveSources(),
    // 部署者通过 DEFAULT_SUBSCRIPTIONS 预置的 SourceList 订阅链接
    defaultSubscriptions: getEnvSubscriptions(),
    // 部署者通过 DEFAULT_RECOMMEND_SOURCE 指定的首页推荐数据源默认值（未配置时为 null）
    defaultRecommendSource: getEnvRecommendSource() ?? null,
    // 部署者通过 DEFAULT_IMAGE_MODE 指定的封面图加载方式默认值（未配置时为 null）
    defaultImageMode: getEnvImageMode() ?? null,
  });
}
