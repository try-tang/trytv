# trytv · 君砚影视

<p align="center">
  <b>聚合搜索 · 多源播放 · 榜单推荐 · 直播 IPTV · 私人短剧 · 电视版 · 站长后台</b><br>
  <sub>基于 <a href="https://github.com/LibreSpark/LibreTV">LibreTV</a> 改造的在线影视聚合站，Next.js 15 App Router + TypeScript + Tailwind CSS</sub>
</p>

> 本项目是把 LibreTV 按 [carefreestars.dynv6.net](https://carefreestars.dynv6.net/) 的形态改造后的版本：品牌换成「君砚影视」，
> 并补齐了求片、赞赏留言板、站长通知、私密短剧、管理员后台、电视版、软件下载、榜单等业务。
> 完整的改动清单、页面地图、接口文档、数据落点、与目标站的差异见 **[TRANSFORM.md](./TRANSFORM.md)**。

---

## 目录

- [核心特性](#核心特性)
- [快速开始](#快速开始)
- [部署](#部署)
  - [Docker（推荐）](#docker推荐)
  - [Docker Compose](#docker-compose)
  - [手动运行（Node）](#手动运行node)
  - [反向代理（Nginx / Caddy）](#反向代理nginx--caddy)
  - [环境变量](#环境变量)
- [使用说明](#使用说明)
- [页面地图](#页面地图)
- [站长后台](#站长后台)
- [直播 / IPTV](#直播--iptv)
- [数据源订阅 / 分享](#数据源订阅--分享)
- [品牌与开关自定义](#品牌与开关自定义)
- [数据存储](#数据存储)
- [开发](#开发)
- [发布新版本](#发布新版本)
- [安全说明](#安全说明)
- [衍生作品](#衍生作品)
- [许可与致谢](#许可与致谢)
- [免责声明](#免责声明)

## 核心特性

### 来自 LibreTV 的底座能力

- **聚合搜索**：多采集站服务端并行搜索，单源失败不影响整体结果，搜索过程实时显示「已回 N/M 个源」
- **跨源同名聚合**：同名影片合并为一张卡片，展开即可比较并切换各来源
- **HLS 播放**：ArtPlayer + hls.js，广告分片过滤、跳过片段（片头/中段/片尾标记与自动跳过）、自动连播、倍速、快捷键、移动端长按 3 倍速
- **换源测速**：跨源搜索同名资源并测速排序，一键切换保留集数位置
- **进度同步**：播放进度与观看历史存于本机 IndexedDB，精确到秒续播，最多保留 100 条
- **源测试与订阅**：点播源 / 直播源一键探活、健康度自动停用（30 分钟 → 24 小时 → 长期，可一键恢复）；支持订阅 LibreTV-SourceList JSON、TVBOX 配置与接口目录
- **首页推荐**：豆瓣分类浏览、Bangumi 新番放送表、影视榜单（豆瓣周榜 + 百度热播）三选一
- **直播 / IPTV**：M3U 订阅解析、分组浏览、频道搜索、XMLTV 节目单（EPG）、频道收藏，直播流走专用长连接代理
- **PWA**：可安装到桌面 / 主屏幕，移动端安全区适配，亮暗双主题无首屏闪烁

### 本仓库新增的站点业务

- **首页改版**：告示位 + 6 秒自动轮播 Hero（电影 / 剧集双轨，悬停暂停、左右箭头、圆点导航）+ 三个横滑片单（豆瓣热门电影 / 热门剧集 / 豆瓣高分），对齐目标站布局
- **求片**：用户提交想看的片名与补充信息，用昵称查进度（排队中 / 已收录 / 暂不提供），站长在后台回复
- **赞赏 + 留言墙**：支付宝 / 微信收款码弹窗，金额与留言落库，通过审核的留言在留言墙展示
- **站长通知**：后台写一条公告，前台按版本号弹一次（不打扰回访用户）
- **私密短剧**：口令进入的竖屏连看（`snap` 全屏滑动、音量、全屏、选集），口令用 HMAC 签名 cookie 记住 7 天
- **管理员后台**：`/admin` 一站式管理求片、留言、通知，带登录态校验
- **电视版**：`/tv` 大屏网格，方向键 / Enter / `[` `]` / `Q` 遥控导航，焦点高亮
- **软件下载**：`/download` 展示多平台客户端清单，未配置时给 PWA 安装指引
- **榜单页**：`/rank` 豆瓣周榜 + 10 个题材榜，独立搜索页 `/search`，移动端底部 4 tab 导航
- **站点配置收口**：站名 / Logo 字 / slogan / 主题色 / 功能开关全在 `src/lib/site.ts`，可用环境变量覆盖

## 快速开始

```bash
pnpm install --node-linker=hoisted
cp .env.example .env.local        # 至少填 PASSWORD=你的访问密码
pnpm build && pnpm start          # http://localhost:8080
```

> **为什么必须 `--node-linker=hoisted`**：pnpm 默认 isolated 链接下 Next.js 找不到 `styled-jsx` / `@swc/helpers` / `caniuse-lite`，构建会直接失败。

受限环境（构建时报 `Error: spawn EPERM`，多见于禁用匿名管道的沙箱）改用仓库自带的 shim：

```bash
node -r ./tools/next-build-shim.js node_modules/next/dist/bin/next build
node -r ./tools/next-build-shim.js node_modules/next/dist/bin/next start -p 8080
```

## 部署

### Docker（推荐）

```bash
# 1. 准备密码
echo "PASSWORD=your-password" > .env

# 2. 构建并启动（源码构建）
docker compose up -d --build

# 或者直接用已发布的镜像（零构建）
docker compose pull && docker compose up -d
```

打开 `http://服务器IP:8080`，用 `.env` 里的 `PASSWORD` 登录。

> 镜像：`ghcr.io/try-tang/trytv`（`latest` / `1.0` / 完整版本号三个 tag，`linux/amd64` 与 `linux/arm64` 双架构）。
> 需要固定版本时在 `.env` 中设置 `TRYTV_IMAGE=ghcr.io/try-tang/trytv:<版本>`。
> 版本号以 `package.json` 为单一来源，部署后可用 `/api/status` 返回的 `version` 字段核对。

直接用 `docker run`：

```bash
docker run -d --name trytv \
  -p 8080:8080 \
  -e PASSWORD=your-password \
  -e SHORTS_PASSWORD=shorts-password \
  -v "$(pwd)/data:/app/.data" \
  --restart unless-stopped \
  ghcr.io/try-tang/trytv:latest
```

> ⚠️ **`-v ...:/app/.data` 不要省**：求片、赞赏留言、站长通知、短剧清单都存在 `/app/.data/site.json`，不挂卷重建容器就全丢。

### Docker Compose

仓库内的 `docker-compose.yml` 已是完整版，最小可用形态：

```yaml
services:
  trytv:
    image: ghcr.io/try-tang/trytv:latest
    container_name: trytv
    restart: unless-stopped
    ports:
      - "8080:8080"
    volumes:
      - ./data:/app/.data          # 业务数据持久化，必挂
    environment:
      - PASSWORD=change-me         # 必填：访问密码
      - SHORTS_PASSWORD=change-me-too   # 可选：私密短剧口令
      # - PROXY_SECRET=your-secret            # 会话/代理签名密钥，多实例部署建议设置
      # - DEFAULT_SOURCES=[{"name":"示例源","url":"https://example.com/api.php/provide/vod"}]
      # - DEFAULT_LIVE_SOURCES=[{"name":"示例直播源","url":"https://example.com/list.m3u"}]
      # - DEFAULT_SUBSCRIPTIONS=["https://example.com/sources.json"]
      # - DEFAULT_RECOMMEND_SOURCE=douban     # 首页推荐数据源（douban/bangumi/hot-list）
      # - LIVE_ALLOW_PRIVATE=1                # 自建内网 IPTV 源时开启
```

```bash
docker compose pull && docker compose up -d
docker compose logs -f          # 看启动日志
docker compose down             # 停止（./data 保留）
```

其余可选变量见 [环境变量](#环境变量)。

### 手动运行（Node）

需要 **Node.js 18+**（推荐 22）。

```bash
# 方式一：npm
npm install
PASSWORD=your-password npm run build
PASSWORD=your-password npm start        # 监听 8080

# 方式二：pnpm（注意 node-linker）
pnpm install --node-linker=hoisted
PASSWORD=your-password pnpm build
PASSWORD=your-password pnpm start
```

Windows PowerShell：

```powershell
$env:PASSWORD="your-password"; npm run build; npm start
```

> 端口默认 8080，改端口用 `next start -p 3000` 或 Docker 的 `-p 3000:8080`。

### 反向代理（Nginx / Caddy）

对外提供服务建议套 HTTPS：登录密码在 POST body 中明文传输。

```nginx
server {
    listen 443 ssl http2;
    server_name tv.example.com;

    ssl_certificate     /etc/letsencrypt/live/tv.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tv.example.com/privkey.pem;

    location / {
        proxy_pass         http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        # 直播流是长连接，读超时要放开
        proxy_read_timeout 3600s;
        proxy_buffering    off;
    }
}
```

Caddy 一行搞定：`tv.example.com { reverse_proxy 127.0.0.1:8080 }`

> 登录本身不依赖 HTTPS：会话 cookie 的 `Secure` 标记按请求协议（`x-forwarded-proto`）自动推导，`http://IP:8080` 也能登录。
> 需要强制指定时用 `COOKIE_SECURE=true`。

### 环境变量

**基础**

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `PASSWORD` | ✅ | 访问密码；未设置时站点提示管理员配置，`/admin` 等接口返回 503 |
| `PROXY_SECRET` | | 会话 / 代理签名密钥；不设置时从 `PASSWORD` 派生（多实例部署建议显式设置：`openssl rand -hex 32`） |
| `COOKIE_SECURE` | | 覆盖会话 cookie 的 `Secure` 标记（`true` / `false`）；默认按 `x-forwarded-proto` 推导 |
| `PORT` | | 监听端口；`next start` 用 `-p` 指定，standalone / Docker 用该变量（镜像内默认 8080） |

**搜索与代理**

| 变量 | 说明 |
| --- | --- |
| `REQUEST_TIMEOUT` | 代理上游请求超时（毫秒），默认 8000 |
| `MAX_RETRIES` | 代理请求重试次数，默认 1 |
| `SEARCH_MAX_PAGES` | 每个搜索源最多抓取页数（1–50，默认 5） |
| `SEARCH_SOURCE_TIMEOUT_MS` | 单个搜索源总死线（3s–60s，默认 10000），到点中断并标记超时 |
| `USER_AGENT` | 代理请求 UA（豆瓣封面防盗链等场景） |
| `FALLBACK_CORS_PROXY` | 豆瓣推荐直连被拒时的降级 CORS 代理 |
| `60S_API_BASE` | 影视榜单推荐源（60s API）实例，默认 `https://60s.crystelf.top` |

**数据源预置**

| 变量 | 说明 |
| --- | --- |
| `DEFAULT_SOURCES` | 预置点播源（JSON 数组）：`[{"name":"源名","url":"https://.../api.php/provide/vod"}]` |
| `DEFAULT_LIVE_SOURCES` | 预置直播源（M3U 订阅，JSON 数组）：`[{"name":"源名","url":"https://.../list.m3u","epg":"https://.../epg.xml.gz"}]` |
| `DEFAULT_SUBSCRIPTIONS` | 预置数据源订阅（SourceList JSON / TVBOX 配置 / 接口目录地址），支持 `{"url":...,"name":...,"refreshDays":10}` |
| `DEFAULT_RECOMMEND_SOURCE` | 首页推荐默认值（`douban` / `bangumi` / `hot-list`），仅对未主动选择过的用户生效 |
| `LIVE_ALLOW_PRIVATE` | 设为 `1` 允许直播代理访问内网地址（自建 IPTV），默认关闭以维持 SSRF 防护 |

**君砚影视业务**

| 变量 | 说明 |
| --- | --- |
| `SHORTS_PASSWORD` | 私密短剧 `/shorts` 的进入口令；未设置时该页返回 503 |
| `SHORTS_SECRET` | 短剧口令 cookie 的签名密钥；未设置时依次退回 `SHORTS_PASSWORD` / `PASSWORD` |
| `SITE_DATA_DIR` | 业务数据（求片 / 赞赏 / 通知 / 短剧清单）落盘目录，默认 `<项目>/.data` |
| `NEXT_PUBLIC_SERVER_COST` | 赞赏弹窗里「服务器成本每月 N 元」的数字，默认 75 |
| `NEXT_PUBLIC_DOWNLOADS` | 下载页清单，格式 `平台\|名称\|说明\|链接`，多条用英文逗号分隔 |

## 使用说明

1. **添加点播源**：设置 → 源管理 → 点播源 → 添加 API，填入 Apple CMS 采集站地址（如 `https://example.com/api.php/provide/vod`），部分源需要额外填详情页地址。
2. **搜索**：勾选点播源后输入片名；服务端并行聚合，个别源失败不影响结果，卡片上的「N 个源」可展开比价换源。
3. **播放**：详情弹窗选择剧集进入 `/watch`；支持快捷键（空格 / ←→ / ↑↓ / F / Alt+←→）、移动端长按 3 倍速、自动连播、换源测速。播放页可「下载本集」（TS/MP4）离线观看。
4. **跳过片段**：播放页侧栏可标记片头 / 中段 / 片尾（Shift+I 片头结束、Shift+O 片尾开始、Shift+S·Shift+E 中段区间），同剧各集与同名资源自动套用。
5. **我的**：观看记录、待看清单、求片进度、赞赏留言板、站长通知，都是本机或站点级数据。
6. **进度与历史**：自动存在本设备 IndexedDB（最多 100 条），换设备不互通；设置 → 数据可导入导出。
7. **换主题**：右上角设置里切换亮 / 暗色。

## 页面地图

| 路由 | 说明 |
| --- | --- |
| `/` | 首页：Hero 轮播 + 三个横滑片单 + 搜索结果（`?s=片名`） |
| `/search` | 独立搜索页：搜索历史、热搜词、片单入口 |
| `/rank` | 榜单：豆瓣周榜 6 类 + 题材榜 10 类，`?tab=` 切换 |
| `/mine` | 我的：观看记录 / 待看清单 + 服务区（`?tab=history\|list`） |
| `/mine/request` | 求片查询：按昵称查提交进度 |
| `/watch` | 播放页：`?source=&id=&url=&index=&title=` |
| `/live` | 直播 / IPTV：分组、搜索、EPG、收藏 |
| `/tv` | 电视版大屏：方向键遥控导航 |
| `/download` | 软件下载：多平台清单 + PWA 安装指引 |
| `/shorts` | 私密短剧：口令进入，竖屏连看 |
| `/admin` | 站长后台：求片 / 留言 / 通知 |
| `/about` | 关于：用法、快捷键、隐私、免责 |

站点级接口（本仓库新增）：

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/request` | POST / GET | 提交求片；`?nick=` 查自己的，`?scope=latest` 看最新公开列表 |
| `/api/tip` | POST / GET | 提交赞赏留言；GET 只返回审核通过的 |
| `/api/notice` | GET | 读取站长通知（含 `version`，前台据此只弹一次） |
| `/api/shorts` | POST / GET | POST 校验口令下发 7 天签名 cookie；GET 返回短剧清单 |
| `/api/admin` | GET / POST | 后台：`?res=stats\|requests\|tips\|all`；POST `action=request.status\|request.reply\|request.delete\|tip.status\|tip.delete\|notice.save` |

## 站长后台

访问 `/admin`，用 `PASSWORD` 登录后可以：

- **求片**：查看 / 标记（排队中 → 已收录 / 暂不提供）/ 回复 / 删除
- **留言**：审核赞赏留言（展示 / 隐藏），排版留言墙
- **通知**：写一条公告并开启，前台按 `version` 只弹一次（改动正文会自增版本号）

数据落在 `SITE_DATA_DIR`（默认 `.data/site.json`），单文件 JSON，直接备份这个文件即可。

维护私密短剧清单（同一个 JSON 的 `shorts` 数组）：

```json
{
  "shorts": [
    {
      "id": "short-001",
      "title": "示例短剧",
      "url": "https://example.com/ep01.mp4",
      "poster": "https://example.com/poster.jpg",
      "desc": "一句话简介",
      "episodes": [
        { "t": "第1集", "u": "https://example.com/ep01.mp4" },
        { "t": "第2集", "u": "https://example.com/ep02.mp4" }
      ]
    }
  ]
}
```

> 收款码替换：`public/img/alipay.jpg`、`public/img/wechat.png`（仓库内是 480×480 占位图，上面写着 `replace this image`）。

## 直播 / IPTV

1. **添加直播源**：设置 → 源管理 → 直播源 → 填 M3U/M3U8 地址（可选 XMLTV 节目单），添加后自动探活并显示频道数；也可通过「数据源订阅」一起导入，或部署者用 `DEFAULT_LIVE_SOURCES` 预置。
2. **观看**：进入 `/live`，按分组筛选或搜索频道，点击即播；支持 HLS（m3u8）与 HTTP-FLV，直连失败自动走代理重试。
3. **节目单**：频道带 `tvg-id` 且配置了 EPG 地址时，展示当前 / 接下来的节目与进度。
4. **收藏与导出**：频道可收藏；订阅可导出为标准 M3U，供 PotPlayer / VLC 使用。

> ⚠️ 项目不内置任何频道源，也不存储、不制作直播内容，仅提供第三方公开播放列表的解析与播放能力。内网源默认被 SSRF 防护拦截，自部署者可设 `LIVE_ALLOW_PRIVATE=1` 放行。

## 数据源订阅 / 分享

数据源（点播 + 直播）可以 **导出为一份 JSON → 托管到公开 URL → 他人在「设置 → 源管理 → 数据源订阅」填入该 URL 订阅**。

托管地址没有特殊要求：Gist、对象存储、任意静态托管都可以（如 [npoint.io](https://www.npoint.io/)）。

### 订阅格式（LibreTV-SourceList JSON）

```json
{
  "name": "我的源列表",
  "version": 2,
  "sources": [
    { "key": "example", "name": "示例源", "api": "https://example.com/api.php/provide/vod", "detail": "" }
  ],
  "liveSources": [
    { "key": "example-live", "name": "示例直播源", "url": "https://example.com/list.m3u", "epg": "" }
  ]
}
```

也兼容 TVBOX 配置（自动识别其中可直接使用的接口）与接口目录（source-catalog）地址。
订阅行为：首次访问自动导入，之后按 `refreshDays`（1–365，缺省 1 天）静默刷新；用户删除后不再自动加回。

## 品牌与开关自定义

改站只看两个文件，不用翻代码：

| 想改什么 | 改哪里 |
| --- | --- |
| 站名 / Logo 字 / slogan / 搜索框占位 / 标题模板 / 主题色 | `src/lib/site.ts` 的 `SITE`（或用 `NEXT_PUBLIC_SITE_*` 环境变量覆盖） |
| 首页三个片单 | `src/lib/site.ts` 的 `HOME_ROWS` |
| 配色（背景 / 卡片 / 强调色等 CSS 变量） | `src/app/globals.css` 的 `.dark` 段 |
| 功能开关（求片 / 赞赏 / 通知 / 短剧 / 后台 / 电视版 / 下载 / 榜单） | `src/lib/site.ts` 的 `FEATURES`，或用 `NEXT_PUBLIC_FEATURE_*=0` 关闭 |
| 收款码 | 覆盖 `public/img/alipay.jpg`、`public/img/wechat.png` |
| 下载页清单 | `NEXT_PUBLIC_DOWNLOADS` |
| 赞赏弹窗的成本文案 | `NEXT_PUBLIC_SERVER_COST` |

## 数据存储

| 数据 | 位置 | 是否跨设备 |
| --- | --- | --- |
| 观看历史 / 播放进度 / 搜索历史 / 下载记录 | 浏览器 IndexedDB（Dexie） | ❌ 仅本机 |
| 源配置 / 设置 / 主题 / 待看清单 | 浏览器 localStorage | ❌ 仅本机 |
| 求片 / 赞赏留言 / 站长通知 / 短剧清单 | 服务端 `SITE_DATA_DIR`（默认 `.data/site.json`） | ✅ 全体共享 |
| 短剧口令 cookie | 浏览器 cookie（HMAC 签名，7 天） | ❌ 仅本机 |

> 备份服务端只需要拷 `.data/site.json`（Docker 部署即宿主机 `./data/site.json`）。

## 开发

```bash
pnpm install --node-linker=hoisted
PASSWORD=dev-password pnpm dev      # http://localhost:8080，改代码热更新

pnpm typecheck                      # tsc --noEmit
pnpm lint                           # eslint src
pnpm test                           # vitest，核心库单测（cms-parser / m3u8 / ssrf / store / auth ...）
pnpm build                          # 生产构建
```

目录速览：

```
src/
  app/            路由（App Router）：页面 + api 路由
    api/          服务端接口（search / douban / proxy / live / request / tip / notice / shorts / admin ...）
  components/     UI 组件（player-shell / video-card / header / home-hero / service-sheet / mine-panels ...）
  lib/            纯逻辑与状态（store / db / site / site-data / site-client / ssrf / m3u8 / cms-parser ...）
public/           PWA 图标、收款码、播放器海报
tools/            next-build-shim.js（受限环境的 fork 补丁）
```

> 受限环境构建：`node -r ./tools/next-build-shim.js node_modules/next/dist/bin/next build`。
> 该 shim 把 Next.js 构建期的 `child_process.fork` 换成「spawn + 127.0.0.1 TCP 通道」，绕开禁用匿名管道的沙箱限制，不影响产物。

## 发布新版本

版本号以 `package.json` 为单一来源：

```bash
npm version patch       # 或 minor / major；会更新 package.json 并打 git tag
git push && git push --tags
```

两个 GitHub Actions workflow：

| workflow | 触发 | 作用 |
| --- | --- | --- |
| `.github/workflows/ci.yml` | push / PR 到 `main` | `pnpm install --node-linker=hoisted --frozen-lockfile` → `tsc --noEmit` → `eslint` → `next build` |
| `.github/workflows/docker-publish.yml` | 推 `v*` tag 或手动 | amd64 / arm64 分别 buildx 构建推 `ghcr.io/try-tang/trytv`，再合并成多架构 manifest 并补 `latest` |

两个 workflow 都只用内置 `GITHUB_TOKEN`，不需要配置任何 secrets（私有仓库同样可跑）。

## 安全说明

- 密码只保存在服务端环境变量，前端不持有任何可重放凭证；会话 cookie 为 HMAC-SHA256 签名，90 天有效。
- 登录接口有 IP 速率限制（10 次 / 10 分钟）。
- 代理内置 SSRF 防护：拒绝内网 / 保留地址（含 DNS 解析后校验），仅放行 http(s)。
- 未登录会话仅允许代理图片类目标（豆瓣封面防盗链需要）。
- `/admin` 与 `/api/admin` 走统一鉴权；未配置 `PASSWORD` 时直接 503。
- `/api/shorts` 口令错误返回 401 并附带 400ms 延迟，cookie 用 `timingSafeEqual` 比对，7 天过期。
- 求片 / 留言为匿名提交，有字段长度与数量上限（求片 5000 条、留言 2000 条），公开列表不泄露提交者昵称之外的备注内容。

## 衍生作品

本项目是 LibreTV 的衍生改造，同类优秀项目：

| 项目 | 说明 |
| --- | --- |
| [LibreTV](https://github.com/LibreSpark/LibreTV) | 本项目的上游 |
| [LunaTV](https://github.com/MoonTechLab/LunaTV) | 影视聚合站（Next.js），支持 Redis / Upstash 多存储 |
| [DecoTV](https://github.com/Decohererk/DecoTV) | 聚合播放站（原 KatelyaTV） |
| [MoonCakeTV](https://github.com/MoonCakeTV/MoonCakeTV) | 影视聚合搜索站（Next.js），文件存储、一键脚本部署 |
| [NextTV](https://github.com/SeqCrafter/NextTV) | 影视聚合站（Next.js + Zustand），支持弹幕 |
| [DpadTV](https://github.com/AresCNZJ/DpadTV) | Android TV 原生客户端（Kotlin + Media3），对接自建服务端 |
| [OrionTV](https://github.com/orion-lib/OrionTV) | Apple TV / Android TV 客户端（React Native TVOS） |
| [Selene-TV](https://github.com/MoonTechLab/Selene-TV) | Android TV（Leanback）客户端，Kotlin + Compose |

## 许可与致谢

- 本项目沿用上游许可：[AGPL-3.0-or-later](./LICENSE)。
- 播放内核：[ArtPlayer](https://github.com/zhw2590582/ArtPlayer)、[hls.js](https://github.com/video-dev/hls.js)、[mpegts.js](https://github.com/xqq/mpegts.js)。
- 本地数据：[Dexie](https://dexie.org/)、[TanStack Query](https://tanstack.com/query)、[Zustand](https://zustand-demo.pmnd.rs/)。
- 特别感谢 [LibreTV](https://github.com/LibreSpark/LibreTV) 提供的完整底座与文档。

## 免责声明

本项目不存储、不制作任何视频内容，仅提供第三方公开接口的聚合与播放能力，内容的合法性由对应数据源负责。

请勿将本项目用于任何商业或违法用途；因使用本项目产生的任何后果由使用者自行承担。
