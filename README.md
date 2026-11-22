# trytv · 看看电视

trytv（看看电视）是一款开源的自托管影视聚合站：多采集站并行搜索、跨源同名聚合、ArtPlayer + hls.js 播放、豆瓣 / Bangumi 推荐、直播 IPTV，并补齐了求片、赞赏留言墙、站长通知、私人短剧、电视版与站长后台。基于 Next.js 15（App Router）+ TypeScript + Tailwind CSS，播放内核为 ArtPlayer + hls.js，支持亮暗双主题。

> 🌐 **形态参考**：[carefreestars.dynv6.net](https://carefreestars.dynv6.net/)（本站按该站形态改造，品牌为「看看电视」）
>
> 🧩 **上游底座**：[LibreTV](https://github.com/LibreSpark/LibreTV)（AGPL-3.0，本项目保留其采集 / 聚合 / 播放内核，只做换皮与业务补齐）
>
> 📖 **改造说明**：[TRANSFORM.md](./TRANSFORM.md) —— 改动清单、页面地图、接口文档、数据落点、与目标站的差异
>
> 🐳 **镜像**：`ghcr.io/try-tang/trytv:latest`（`linux/amd64` + `linux/arm64`）

<p align="center">
  <b>聚合搜索 · 多源播放 · 榜单推荐 · 直播 IPTV · 私人短剧 · 电视版 · 站长后台</b>
</p>

---

## 目录

- [项目简介](#项目简介)
- [核心特性](#核心特性)
- [快速开始](#快速开始)
- [部署](#部署)
  - [Docker（推荐）](#docker推荐)
  - [Docker Compose](#docker-compose)
  - [免 Docker 运行（standalone 包）](#免-docker-运行standalone-包)
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

## 项目简介

**trytv（看看电视）** 是 [LibreTV](https://github.com/LibreSpark/LibreTV) 的衍生改造版。上游本身已经是一个完整可用的影视聚合站（多源搜索、跨源聚合、HLS 播放、源健康度、订阅导入导出、直播 IPTV、PWA），本项目在此基础上做两件事：

1. **换皮**：视觉、导航、首页结构对齐 [目标站](https://carefreestars.dynv6.net/)，站名/Logo/slogan/主题色/功能开关全部收口到 `src/lib/site.ts` 与 `src/app/globals.css` 两处。
2. **补业务**：加上了原站有、而 LibreTV 没有的站点侧功能 —— 求片、赞赏与留言墙、站长通知、私人短剧、管理员后台、电视版、软件下载、榜单页。

代码上不做重写：采集解析、跨源聚合、播放器与代理内核保持上游实现，新增部分全部落在独立文件里，升级上游时冲突面很小。

| 维度 | LibreTV（上游） | trytv（本项目） |
| --- | --- | --- |
| 定位 | 通用影视聚合站 | 面向个人自建站点的一站式影视站 |
| 首页 | 搜索框 + 豆瓣推荐 | Hero 轮播 + 三个横滑片单 + 服务区 |
| 导航 | 桌面顶栏 | 单字方块 Logo + 顶栏 + 移动端底部 4 tab |
| 站点业务 | 无 | 求片 / 赞赏留言墙 / 站长通知 / 私人短剧 / 后台 |
| 多端 | 桌面 + 移动 | 额外提供 `/tv` 大屏电视版、`/download` 客户端页 |
| 数据存储 | 仅浏览器本地 | 浏览器本地 + 服务端 `.data/site.json` |
| 站点配置 | 分散在组件内 | `src/lib/site.ts` 单点收口 + 环境变量覆盖 |

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

### Docker Compose（推荐，一条命令）

仓库根目录的 `docker-compose.yml` 直接可用，不需要改任何一行：

```bash
git clone https://github.com/try-tang/trytv.git && cd trytv

# 只需一个密码文件
echo "PASSWORD=your-password" > .env

docker compose up -d --build      # 本地构建并启动
docker compose logs -f            # 看启动日志
```

打开 `http://服务器IP:8080`，用 `.env` 里的 `PASSWORD` 进入站长后台，再到「站点设置」里配访问模式（所有人可看 / 登录后可看 / 仅注册用户）、是否开放注册、站名与口号。

> **数据落在命名卷 `trytv_trytv-data` 里挂到 `/app/.data`**（求片、赞赏留言、站长通知、短剧清单、注册用户）。
> 用命名卷而不是 `./data` 绑定挂载，是因为容器以非 root（uid 1000）运行，绑定宿主机目录经常因属主不符报 `EACCES`。
> 备份 / 恢复：
>
> ```bash
> docker run --rm -v trytv_trytv-data:/d -v "$PWD":/b alpine tar czf /b/trytv-data.tar.gz -C /d .
> docker run --rm -v trytv_trytv-data:/d -v "$PWD":/b alpine sh -c 'cd /d && tar xzf /b/trytv-data.tar.gz'
> ```
>
> 想直接用宿主机目录也很简单：把 compose 里的 `- trytv-data:/app/.data` 换成 `- ./data:/app/.data`，并执行 `sudo chown -R 1000:1000 ./data`。

**从已发布镜像部署（零构建）**：先给仓库打 tag `v1.0.0` 触发 `.github/workflows/docker-publish.yml`，镜像推好后：

```bash
docker compose pull && docker compose up -d
```

> 镜像地址 `ghcr.io/try-tang/trytv`（`<tag>` / `latest` 两套标签，`linux/amd64` + `linux/arm64` 双架构）。
> 仓库是 public，拉取无需登录；仓库若改回 private，需先 `echo $GITHUB_TOKEN | docker login ghcr.io -u <用户名> --password-stdin`。
> 固定版本写进 `.env`：`TRYTV_IMAGE=ghcr.io/try-tang/trytv:1.0.0`。

**直接用 `docker run`**（不想用 compose 时）：

```bash
docker run -d --name trytv \
  -p 8080:8080 \
  -e PASSWORD=your-password \
  -e SHORTS_PASSWORD=shorts-password \
  -v trytv-data:/app/.data \
  --restart unless-stopped \
  ghcr.io/try-tang/trytv:latest
```

> ⚠️ **`-v ...:/app/.data` 不要省**：业务数据都在那里，不挂卷重建容器就全丢。

#### Docker 常见报错

| 报错 | 原因 | 处理 |
| --- | --- | --- |
| `invalid reference format` / `Error while fetching server API version` | 没装 Docker 或守护进程没起 | 先 `docker info` 确认能连上引擎；Linux 上 `sudo systemctl start docker`，并确认当前用户在 `docker` 组 |
| `required variable PASSWORD is missing a value` | 没建 `.env` | 在**与 `docker-compose.yml` 同一目录**下 `echo "PASSWORD=xxx" > .env`，或在 `environment:` 里直接写死 |
| `pull access denied for ghcr.io/try-tang/trytv` | 镜像还没发布（尚未打过 `v*` tag） | 用源码构建：`docker compose up -d --build` |
| `npm ci` 阶段报 `lock file ... not in sync` | `package-lock.json` 与 `package.json` 漂移 | Dockerfile 已内置兜底（自动退回 `npm install`），但建议本地 `npm install --package-lock-only` 后重新提交 |
| 页面能开但求片/注册报 500，日志出现 `EACCES` / `EPERM` | 挂载目录属主与容器内 uid 1000 不符 | 用命名卷（默认已如此），或 `sudo chown -R 1000:1000 ./data` |
| 容器起来就退出 | 端口占用或 `server.js` 缺失 | `docker compose logs trytv` 看第一行错误；端口冲突改 `ports: - "8090:8080"` |
| 健康状态 `unhealthy` | `/api/status` 访问不到 | 多为 `PASSWORD` 未设或端口映射写错；`docker compose exec trytv wget -qO- http://127.0.0.1:8080/api/status` 自测 |

#### 构建镜像的两种方式

```bash
# 方式 A：compose 构建（推荐，会同时打好 ghcr.io/try-tang/trytv:latest 标签）
docker compose up -d --build

# 方式 B：纯 docker build
docker build -t trytv:local .
docker run -d -p 8080:8080 -e PASSWORD=your-password -v trytv-data:/app/.data trytv:local
```

> 镜像用 `node:22-alpine` 三阶段构建（deps → builder → runner），运行阶段只带 `standalone` 产物，非 root 运行。
> `DOCKER_BUILD=1` 会让 `next.config.ts` 输出 `standalone`；构建期不要把真实 `PASSWORD` 塞进 build-args，否则会被内联进产物。

### 最小 compose（自己写一份时参考）

```yaml
services:
  trytv:
    image: ${TRYTV_IMAGE:-ghcr.io/try-tang/trytv:latest}
    container_name: trytv
    restart: unless-stopped
    ports:
      - "8080:8080"
    volumes:
      - trytv-data:/app/.data          # 业务数据持久化，必挂
    environment:
      - PASSWORD=change-me             # 必填：站长密码
      - SITE_DATA_DIR=/app/.data
      # - SHORTS_PASSWORD=change-me-too      # 私密短剧口令
      # - PROXY_SECRET=your-secret           # 会话/代理签名密钥，多实例部署建议设置
      # - DEFAULT_SOURCES=[{"name":"示例源","url":"https://example.com/api.php/provide/vod"}]
      # - DEFAULT_LIVE_SOURCES=[{"name":"示例直播源","url":"https://example.com/list.m3u"}]
      # - DEFAULT_SUBSCRIPTIONS=["https://example.com/sources.json"]
      # - DEFAULT_RECOMMEND_SOURCE=douban    # 首页推荐数据源（douban/bangumi/hot-list）
      # - LIVE_ALLOW_PRIVATE=1               # 自建内网 IPTV 源时开启

volumes:
  trytv-data:
```

```bash
docker compose up -d --build    # 源码构建（仓库自带 compose 就是这个形态）
docker compose logs -f          # 看启动日志
docker compose down             # 停止，命名卷保留
docker compose down -v          # 停止并连数据一起删除（谨慎）
```

其余可选变量见 [环境变量](#环境变量)。

### 免 Docker 运行（自己从源码打 standalone 包）

不想装 Docker、又不想让 `npm install` 在服务器上跑一遍，可以本地打一个独立产物再拷过去：

```bash
# 1. 本地（或 CI）构建
npm install
DOCKER_BUILD=1 npm run build          # DOCKER_BUILD=1 才会输出 .next/standalone

# 2. 组装成可搬走的目录
mkdir -p trytv-standalone && cp -r .next/standalone/. trytv-standalone/
mkdir -p trytv-standalone/.next && cp -r .next/static trytv-standalone/.next/static
cp -r public trytv-standalone/public
tar -czf trytv-standalone.tar.gz trytv-standalone

# 3. 服务器上解压即跑（只需要 Node.js 18+，不用装依赖）
tar -xzf trytv-standalone.tar.gz && cd trytv-standalone
PASSWORD=your-password PORT=8080 node server.js
```

Windows 下打包把 `tar -czf` 换成 `Compress-Archive -Path trytv-standalone -DestinationPath trytv-standalone.zip`，启动改成：

```powershell
$env:PASSWORD="your-password"; $env:PORT="8080"; node server.js
```

> 业务数据 `users.json` / `site.json` 首次启动时在**当前工作目录**的 `.data/` 里生成；用 `SITE_DATA_DIR=/某个绝对路径` 可以改落点。
> 三样东西缺一不可：`server.js`、`.next/static`、`public`。只拷 `server.js` 会出现页面能开但样式与图标全丢。

### 手动运行（Node）

需要 **Node.js 22**（`Dockerfile` 与 CI 都是 22；18/20 未验证）。

```bash
# 方式一：npm（与 Dockerfile 一致，锁文件是 package-lock.json）
npm ci
PASSWORD=your-password npm run build
PASSWORD=your-password npm start        # 监听 8080

# 方式二：pnpm（与 CI 一致，注意 node-linker）
pnpm install --node-linker=hoisted
PASSWORD=your-password pnpm build
PASSWORD=your-password pnpm start
```

> **为什么必须 `--node-linker=hoisted`**：pnpm 默认 isolated 软链接下 Next 找不到 `styled-jsx` / `@swc/helpers` / `caniuse-lite`，构建会直接失败。

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
| `PASSWORD` | ✅ | 站长密码；用于登录后台 `/admin`。站点对外的可见范围由后台「站点设置 → 访问模式」决定，不依赖它 |
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

**站点业务（看看电视）**

| 变量 | 说明 |
| --- | --- |
| `SHORTS_PASSWORD` | 私密短剧 `/shorts` 的进入口令（也可以在后台「私密短剧」里设，后台优先存哈希；两处任一匹配即可进入） |
| `SHORTS_SECRET` | 短剧口令 cookie 的签名密钥；未设置时依次退回 `SHORTS_PASSWORD` / `PASSWORD` |
| `SITE_DATA_DIR` | 业务数据（求片 / 赞赏 / 通知 / 短剧清单 / 站点设置 / 用户表）落盘目录，默认 `<项目>/.data` |
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
| `/admin` | 站长后台：求片 / 留言 / 通知 / 站点设置 / 用户管理（仅站长密码可进） |
| `/login` | 登录 / 注册 / 站长登录（`?next=` 登录后回跳） |
| `/about` | 关于：用法、快捷键、隐私、免责 |

站点级接口（本仓库新增）：

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/request` | POST / GET | 提交求片；`?nick=` 查自己的，`?scope=latest` 看最新公开列表 |
| `/api/tip` | POST / GET | 提交赞赏留言；GET 只返回审核通过的 |
| `/api/notice` | GET | 读取站长通知（含 `version`，前台据此只弹一次） |
| `/api/shorts` | POST / GET | POST 校验口令下发 7 天签名 cookie；GET 返回短剧清单 |
| `/api/admin` | GET / POST | 后台：`?res=stats\|requests\|tips\|users\|settings\|all`；POST `action=request.status\|request.reply\|request.delete\|tip.status\|tip.delete\|notice.save\|settings.save\|user.create\|user.disable\|user.enable\|user.password\|user.delete` |
| `/api/user` | GET / POST / DELETE | 注册用户：GET 当前身份与站点策略；POST `action=login\|register`；DELETE 退出 |
| `/api/access` | GET | 访问策略与当前身份（middleware 读取，`no-store`） |

## 站长后台

访问 `/admin`，用 `PASSWORD` 登录后可以：

- **求片**：查看 / 标记（排队中 → 已收录 / 暂不提供）/ 回复 / 删除
- **留言**：审核赞赏留言（展示 / 隐藏），排版留言墙
- **通知**：写一条公告并开启，前台按 `version` 只弹一次（改动正文会自增版本号）
- **站点设置**：访问模式（所有人可看 / 需登录 / 仅会员可看）、是否开放注册、站名、口号、顶部提示条
- **用户管理**：手动建号、停用 / 启用、重置密码、删除

### 访问模式与用户体系

「站点设置 → 谁可以看」三档，改完即时生效（下次请求就走新策略）：

| 模式 | 匿名访客 | 注册用户 | 站长（PASSWORD） |
| --- | --- | --- | --- |
| `open`（所有人可看，默认） | ✅ 可看 | ✅ 可看 | ✅ 可看 |
| `login`（需登录） | ❌ 跳 `/login` | ✅ 可看 | ✅ 可看 |
| `members`（仅会员） | ❌ 跳 `/login` | ✅ 可看 | ✅ 可看 |

> 三个模式都**不会**把 `/admin` 开放给注册用户：后台只认 `PASSWORD` 登录的站长会话。
> 「是否开放注册」独立于访问模式——关掉后新用户自助注册返回「本站当前未开放注册，请联系站长开通账号」，已有账号照常登录。

实现要点：

- 用户存 `.data/users.json`（`SITE_DATA_DIR` 可改），密码用 `scrypt` 加盐哈希，永远不落明文；
- 会话是 httpOnly cookie `ltv_user`（30 天），HMAC-SHA256 签名，签名密钥与站长会话同源派生（`src/lib/users.ts` 的 `sessionKey()`，Edge 侧 `src/middleware.ts` 的 `userSecret()` 逐字节对齐）；
- 门槛在 `src/middleware.ts` 统一拦（`/admin` 单独判站长 cookie），`src/lib/api-guard.ts` 的 `guardRequest()` 负责 API 侧，「读不到策略时按 open 放行」，不会因为内部请求失败把整站锁死；
- 登录 / 注册限流：同 IP 10 次 / 10 分钟（`checkRateLimit('user:' + ip)`）。

数据落在 `SITE_DATA_DIR`（默认 `.data/site.json`），单文件 JSON，直接备份这个文件即可。

### 私密短剧与成人内容过滤（后台可改，不用改文件）

这两项在上游 LibreTV 里是「数据源管理」面板里的零碎开关，现在统一收到后台：

打开 `/admin` → 登录站长密码 → **私密短剧** 标签页：

| 区块 | 作用 |
| --- | --- |
| 开启入口 | 关掉后「我的 → 服务」里不再出现私密短剧，`/api/shorts` 直接返回 404 |
| 进入口令 | 至少 4 位，只存 scrypt 哈希（`.data/site.json` 的 `settings.shortsPasswordHash`）；面板拿不回明文，只能重设或清除 |
| 短剧清单 | 表单增删改（片名 + 直链 + 封面 + 简介），落进同一个 JSON 的 `shorts` 数组 |

**站点设置** 标签页里另有「内容过滤 → 过滤成人内容」：勾选后排除「伦理片」等分类与成人采集源，
默认不勾选。这个开关是站点级策略（写在服务端），不再存在各人浏览器的 localStorage 里。

想让某个访客永远看不到短剧入口，直接关「开启入口」；想临时给朋友看，改口令后发给他就够了。

也可以手工维护短剧清单（`SITE_DATA_DIR` 下 `site.json` 的 `shorts` 数组，后台表单改的就是它）：

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
| 站名 / 口号的**运行时**覆盖 | 后台 `/admin` → 站点设置（优先级高于 `NEXT_PUBLIC_*`，改完不用重新构建） |
| 访问模式 / 是否开放注册 | 后台 `/admin` → 站点设置 |
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

两个 workflow 都只用内置 `GITHUB_TOKEN`，不需要配置任何 secrets。

> ⚠️ 仓库建好后**没有推过任何 tag，所以 `ghcr.io/try-tang/trytv` 目前还是空的**——这时 `docker compose pull` 会报 `manifest unknown` / `denied`。
> 两种做法：
> 1. **源码构建**（立刻可用）：`docker compose up -d --build`
> 2. **先发镜像**：`git tag v1.0.0 && git push origin v1.0.0`，等 Actions 里 `docker-publish` 三个 job 全绿，再 `docker compose pull && docker compose up -d`
>
> 镜像第一次发布后，到仓库 `Settings → Packages` 确认 `trytv` 包的可见性与仓库一致（public 仓库的包默认 public，拉取无需登录）。

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
