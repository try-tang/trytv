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
npm install
cp .env.example .env.local        # 可选：改密码与站名；默认密码是 admin
npm run build && npm start          # http://localhost:8080
```

> 仓库只用 npm（`package-lock.json`），Dockerfile / CI / 文档三处一致。

受限环境（构建时报 `Error: spawn EPERM`，多见于禁用匿名管道的沙箱）改用仓库自带的 shim：

```bash
node -r ./tools/next-build-shim.js node_modules/next/dist/bin/next build
node -r ./tools/next-build-shim.js node_modules/next/dist/bin/next start -p 8080
```

## 部署

### Docker Compose（推荐：复制下面这段，一条命令跑起来）

**1）拿到代码**

```bash
git clone https://github.com/try-tang/trytv.git && cd trytv
```

**2）启动（不需要建任何配置文件）**

```bash
docker compose up -d --build
docker compose logs -f        # Ctrl+C 退出日志，不影响容器
```

打开 `http://服务器IP:8080` → 右上角齿轮 → 用默认站长密码登录：

| 账号 | 密码 |
| --- | --- |
| `admin`（无需填用户名，只填密码） | `admin` |

进去后在「站点设置」里配访问模式（所有人可看 / 登录后可看 / 仅注册用户）、是否开放注册、站名与口号，在「私密短剧」页签设短剧口令与清单。

> ## ⚠️ 上线前务必改掉默认密码
>
> 默认密码 `admin` 写在公开仓库里，**任何人拿到你的地址都能登后台**。
>
> 改法：在 `docker-compose.yml` 同目录建一个 `.env` 文件（不是 `.env.local`，也不是 `env`）：
>
> ```bash
> echo "PASSWORD=换成你自己的密码" > .env
> docker compose up -d          # 不用 --build，改环境变量不需要重新构建
> ```
>
> 改完旧会话自动失效（会话签名由 `PASSWORD` 派生）。也可以直接把 compose 里
> `- PASSWORD=${PASSWORD:-admin}` 的 `admin` 换成你的密码，但 `.env` 更干净。
>
> 登录框在看到默认密码时会显式提示「当前使用内置默认密码 admin」。

**仓库根的 `docker-compose.yml` 全文**（就是上面命令用的那份，可以直接照抄）：

```yaml
services:
  trytv:
    build:
      context: .
      dockerfile: Dockerfile
    image: trytv:local
    container_name: trytv
    restart: unless-stopped
    ports:
      - "8080:8080"
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:8080/api/status').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s
    volumes:
      - trytv-data:/app/.data
    environment:
      - PASSWORD=${PASSWORD:-admin}   # 不设就用默认 admin，上线前请改成自己的
      - SITE_DATA_DIR=/app/.data
      # - SHORTS_PASSWORD=              # 私密短剧口令（也可在后台设，后台优先）
      # - SHORTS_SECRET=                # 短剧 cookie 签名密钥
      # - PROXY_SECRET=                 # 会话/代理签名密钥（openssl rand -hex 32）
      # - DEFAULT_SOURCES=[{"name":"示例源","url":"https://example.com/api.php/provide/vod"}]
      # - DEFAULT_LIVE_SOURCES=[{"name":"示例直播源","url":"https://example.com/list.m3u"}]

volumes:
  trytv-data:
```

> **为什么 `image` 写 `trytv:local` 而不是 `ghcr.io/...`？**
> 仓库**还没有发布任何镜像**（没打过 `v*` tag，GHCR 上是空的）。写 `ghcr.io/try-tang/trytv:latest` 时，`docker compose up` 会先尝试去拉一个不存在的镜像，直接报 `pull access denied` / `manifest unknown`，看起来就像「构建失败」。
> `trytv:local` 是本地构建产物名，`--build` 现场编、不联网拉，永远能成。
> 想改成「拉现成镜像」的先决条件见下面的「发布镜像」一节。

**数据在哪 / 怎么备份**

业务数据（求片、赞赏留言、站长通知、短剧清单、注册用户）落在命名卷 `trytv_trytv-data`，挂到容器 `/app/.data`。

```bash
# 备份
docker run --rm -v trytv_trytv-data:/d -v "$PWD":/b alpine tar czf /b/trytv-data.tar.gz -C /d .
# 恢复
docker run --rm -v trytv_trytv-data:/d -v "$PWD":/b alpine sh -c 'cd /d && tar xzf /b/trytv-data.tar.gz'
# 看一眼里面有什么
docker compose exec trytv ls -l /app/.data
```

为什么用命名卷而不是 `./data`：容器内以非 root（uid 1000）运行，绑定挂载宿主机目录时属主往往对不上，写 `site.json` 会 `EACCES`。
真要用宿主机目录：把 `- trytv-data:/app/.data` 换成 `- ./data:/app/.data`，然后 `sudo chown -R 1000:1000 ./data`。

#### 构建失败？先按这张表对号入座

| 你看到的报错 | 真正原因 | 处理 |
| --- | --- | --- |
| `required variable PASSWORD is missing a value` | 用的是**旧版** compose（旧版用 `${PASSWORD:?...}` 强制要求） | `git pull` 拉最新 compose；新版默认值就是 `admin`，不需要 `.env` |
| `pull access denied for ghcr.io/try-tang/trytv` / `manifest unknown` | 镜像从没发布过（仓库无 `v*` tag） | 用上面那份 `image: trytv:local` + `--build`，或先按「发布镜像」打 tag |
| `invalid reference format` | `docker-compose.yml` 里有全角空格/中文标点，或 YAML 缩进用了 Tab | 用空格缩进；确认 `ports:` 下是 `- "8080:8080"` 这种英文引号 |
| `failed to solve: failed to read dockerfile` | `build:` 上下文不对（比如在别的目录执行 compose） | 保持 `build: { context: ., dockerfile: Dockerfile }`，并在仓库根执行 |
| `npm ci ... lock file ... not in sync` | `package-lock.json` 与 `package.json` 漂移 | Dockerfile 已内置兜底（自动退回 `npm install`）；根治是本地 `npm install --package-lock-only` 后提交 |
| `EACCES` / `EPERM`（页面能开，但求片/注册 500） | `.data` 属主与容器 uid 1000 不符 | 默认命名卷不会有这问题；若改绑定挂载：`sudo chown -R 1000:1000 ./data` |
| 容器起来就退出（`docker compose ps` 显示 Exit） | 端口被占，或 `server.js` 没进镜像 | `docker compose logs trytv` 看首行；端口冲突改 `- "8090:8080"` |
| 健康检查 `unhealthy` | `/api/status` 打不通 | `docker compose exec trytv wget -qO- http://127.0.0.1:8080/api/status` 自测 |
| 拉基础镜像超时（国内网络） | Docker Hub 连不上 | 配镜像加速：`/etc/docker/daemon.json` 加 `{"registry-mirrors":["https://docker.m.daocloud.io"]}` 后 `systemctl restart docker` |

#### 发布镜像（可选，想「零构建」部署才需要）

```bash
git tag v1.0.0 && git push origin v1.0.0
```

`.github/workflows/docker-publish.yml` 会构建 `linux/amd64` + `linux/arm64` 并推到 `ghcr.io/try-tang/trytv:1.0.0` 与 `:latest`。
推好后把 compose 里的 `image: trytv:local` 改成 `image: ghcr.io/try-tang/trytv:latest`（或 `.env` 里写 `TRYTV_IMAGE=ghcr.io/try-tang/trytv:1.0.0`），再 `docker compose pull && docker compose up -d`。
仓库是 public，拉取不用登录。

#### 不用 compose，直接 docker run

```bash
docker build -t trytv:local .

docker run -d --name trytv \
  -p 8080:8080 \
  -e PASSWORD=admin \
  -v trytv-data:/app/.data \
  --restart unless-stopped \
  trytv:local
```

> `-v ...:/app/.data` 不要省：业务数据都在那儿，不挂卷重建容器就全丢。

> 镜像为 `node:22-alpine` 三阶段构建（deps → builder → runner），运行阶段只带 Next 的 `standalone` 产物，非 root 运行。
> `DOCKER_BUILD=1` 让 `next.config.ts` 输出 standalone；**构建期不要传真实 `PASSWORD`**，它会经 `next.config.ts` 的 `env` 被内联进产物。

### 飞牛 OS / 群晖 / 1Panel 等「面板粘贴 compose」场景

**这类面板的 compose 编辑器只保存文本，不会下载源码。** 因此在里面粘贴带 `build:` 的 compose 一定会失败：

```
failed to solve: failed to read dockerfile: open Dockerfile: no such file or directory
```

面板工作目录里没有 `Dockerfile`，`build: context: .` 找不到东西可编。

正确做法是用**现成镜像**，仓库里专门备了这份 `docker-compose.image.yml`（粘贴到面板的 compose 输入框即可）：

```yaml
services:
  trytv:
    image: ghcr.io/try-tang/trytv:latest
    container_name: trytv
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      - PASSWORD=${PASSWORD:-admin}
      - SITE_DATA_DIR=/app/.data
    volumes:
      - trytv-data:/app/.data
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:8080/api/status').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s

volumes:
  trytv-data:
```

镜像 `ghcr.io/try-tang/trytv:latest` 已发布，含 `linux/amd64` 与 `linux/arm64` 双架构（ARM 设备如瑞芯微、树莓派直接用）。

**国内拉不动 ghcr.io 时**，在面板里把镜像地址前面加加速前缀。飞牛可在「Docker → 设置 → Registry 镜像」里配，或用下面任一可用的写法：

```yaml
# 写法 A：用镜像加速站（把前缀换成你实际可用的）
image: ghcr.nju.edu.cn/try-tang/trytv:latest      # 南京大学镜像站
image: ghcr.m.daocloud.io/try-tang/trytv:latest   # DaoCloud

# 写法 B：先在能上网的机器上导出镜像，再导入
docker pull ghcr.io/try-tang/trytv:latest
docker save ghcr.io/try-tang/trytv:latest -o trytv.tar
# 传到 NAS 后
docker load -i trytv.tar
```

> 加速站是第三方服务，可用性会变；拉不动就试下一个，或者用写法 B 离线导入最稳。

**部署后**：浏览器开 `http://NAS的IP:8080` → 右上角齿轮 → 密码 `admin` → 「站点设置」改访问模式与站名，公网使用前务必把 `PASSWORD` 换成自己的。

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
npm ci                 # 严格按 package-lock.json 装（仓库只有这一个锁文件）
npm run build
PASSWORD=your-password npm start        # 监听 8080
```

> 仓库只保留 `package-lock.json`（npm）。Dockerfile、CI、文档三处统一走 npm，避免两份锁文件漂移。
> `npm ci` 若报 `lock file ... not in sync`，说明 `package.json` 被改过却没更新锁文件：本地执行 `npm install --package-lock-only` 后提交。

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
| `PASSWORD` | | 站长密码，登录 `/admin` 用；**不设置时默认 `admin`**。站点对外可见范围由后台「站点设置 → 访问模式」决定，与它无关。公网部署请务必改掉 |
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
- **配置**：内置 JSON 编辑器，直接改 `settings` 与 `shorts` 两个字段（见下一节）

### 配置（JSON 编辑器）

「配置」标签页是一块 Monaco 编辑器，把 `/api/admin?res=config` 返回的**可编辑配置**整段摊开给你改，
保存走 `config.save`。适合批量改短剧清单、或把配置复制到另一台机器上。

只有两个顶层字段可写（其余一律报错，避免误改业务数据）：

```json
{
  "settings": {
    "accessMode": "open",
    "allowRegister": true,
    "siteName": "看看电视",
    "slogan": "每日一部好片",
    "banner": "",
    "adultFilter": false,
    "shortsEnabled": true,
    "shortsPasswordHash": "<已设置>"
  },
  "shorts": [
    { "id": "short-001", "title": "示例短剧", "url": "https://example.com/ep01.mp4" }
  ]
}
```

| 字段 | 说明 |
| --- | --- |
| `accessMode` | 只能是 `open` / `login` / `members` |
| `shortsPasswordHash` | **三态**：原样留 `<已设置>` = 不改口令；写成空串 `""` = 清除口令；写别的字符串 = 设成这个新口令（会就地哈希，明文不入库） |
| `shorts[].id` | 留着就更新那一条，删掉就新生成；数组整体替换（`config.save` 是全量覆盖，不是增量） |
| `shorts[].url` / `episodes` | 二者至少有一个；缺 `title`、缺地址的条目会被拒绝并指出是第几条 |

编辑器的左栏是工具面板，底部是状态栏，和 LunaTV-config 的 web 编辑器一个路子：

- 文件：导出当前内容为 `.json`、导入本地 `.json`（导入只填编辑器，仍需点保存）
- JSON：格式化、压缩成一行、校验（结果带行列）、复制全文
- 显示：自动换行 / 缩略图 / 行号 / 字号
- 主区三个页签：编辑器、树状视图（全部展开 / 收起）、预览；底部状态栏显示行列、选中字符数、UTF-8、校验状态、最后保存时间
- 快捷键：`Ctrl/Cmd+S` 保存、`Ctrl/Cmd+O` 重新载入；保存失败会把光标跳到出错的那一行

> Monaco 是**自托管**的：`public/monaco/vs` 里放了裁剪过的运行子集（约 4.6 MB），
> 后台不会去连 `cdn.jsdelivr.net`，内网 / 离线部署也能用。
> 升级 `monaco-editor` 后执行 `npm run sync:monaco` 重新生成该目录（`scripts/sync-monaco.mjs`）。

### 访问模式与用户体系

「站点设置 → 谁可以看」三档，改完即时生效（下次请求就走新策略）：

| 模式 | 匿名访客 | 注册用户 | 站长（PASSWORD） |
| --- | --- | --- | --- |
| `open`（所有人可看，默认） | ✅ 可看 | ✅ 可看 | ✅ 可看 |
| `login`（需登录） | ❌ 跳 `/login` | ✅ 可看 | ✅ 可看 |
| `members`（仅会员） | ❌ 跳 `/login` | ✅ 可看 | ✅ 可看 |

> 三个模式都**不会**把 `/admin` 开放给注册用户：后台只认 `PASSWORD` 登录的站长会话。
> 「是否开放注册」独立于访问模式——关掉后新用户自助注册返回「本站当前未开放注册，请联系站长开通账号」，已有账号照常登录。

#### 三个入口，一处开关

| 位置 | 谁能看到 | 干什么 |
| --- | --- | --- |
| 顶栏齿轮（只有一个） | 所有人 | 未登录时先弹「登录 / 注册 / 站长」三选一（站点为 `open` 时多一个「先不登录，继续」），登录后再开设置抽屉 |
| 设置抽屉 → 偏好设置 → **站点与账号** | 所有人（改东西需站长） | 站长在这里直接改「谁可以看 / 是否开放注册 / 过滤成人内容」，与后台「站点设置」同一份数据 |
| `/admin` → 账号 / 私密短剧 | 只有站长 | 建号、停用、改密码；短剧开关与口令、短剧清单 |

> 早先顶栏并排放了两枚一模一样的齿轮（一枚是 `/admin` 链接、一枚是设置），已合并成一枚；后台入口收到设置抽屉的「站点与账号」页、`/mine` 的账号卡，以及手机折叠菜单（站长已登录时）。

实现要点：

- 用户存 `.data/users.json`（`SITE_DATA_DIR` 可改），密码用 `scrypt` 加盐哈希，永远不落明文；
- 会话是 httpOnly cookie `ltv_user`（30 天），HMAC-SHA256 签名，签名密钥与站长会话同源派生（`src/lib/users.ts` 的 `sessionKey()`，Edge 侧 `src/middleware.ts` 的 `userSecret()` 逐字节对齐）；
- 门槛在 `src/middleware.ts` 统一拦（`/admin` 单独判站长 cookie），`src/lib/api-guard.ts` 的 `guardRequest()` 负责 API 侧，「读不到策略时按 open 放行」，不会因为内部请求失败把整站锁死；
- 登录 / 注册限流：同 IP 10 次 / 10 分钟（`checkRateLimit('user:' + ip)`）。

#### 页面为什么都是「按请求渲染」

`src/app/*/page.tsx` 现在是**服务端组件**，只声明 `export const dynamic = 'force-dynamic'` 并渲染同目录的 `view.tsx`（真正的客户端业务）。

原因：Next 的 `export const dynamic` 只对服务端组件生效。页面整个写成 `'use client'` 时该声明会被忽略，页面仍按静态预渲染，一旦命中静态缓存就不再经过 middleware —— 结果是 `login` / `members` 模式下匿名用户照样能打开首页。拆一层之后 `/`、`/rank`、`/search`、`/mine`、`/tv`、`/download`、`/shorts`、`/about`、`/live`、`/watch`、`/mine/request` 都走 `ƒ (Dynamic)`，每次请求都过一遍身份校验（构建输出里能直接看到 `ƒ /`）。

### 封面图加载（图片代理）

豆瓣图床在国内直连经常失败，公共镜像也时好时坏，所以**出厂默认走内置代理**：封面统一由本站 `/api/proxy?url=<原图>` 转发，服务端带 `Referer`/`UA` 去取图，取不到再回退镜像与直连（`src/lib/utils.ts` 的 `buildImageCandidates()`）。

| 方式 | 行为 | 适合 |
| --- | --- | --- |
| `proxy`（默认） | 走本站 `/api/proxy`，最稳 | 国内服务器 / 服务器在墙外 |
| `direct` | 浏览器直连豆瓣图床 | 客户端本来就能直连豆瓣图，想省服务器流量 |
| `custom` | 填自己的图片代理模板（`{url}` 占位） | 有现成的图床/Worker |

改法：点右上角齿轮 → 「偏好设置 → 封面图加载」。**未登录点齿轮会先弹「登录 / 注册 / 站长」选择**（`open` 模式下可以选「先不登录，继续」，那是官方行为里也允许的）。部署者还可用环境变量 `DEFAULT_IMAGE_MODE` 下发默认值（仅对没手动选过的访客生效）。

首页轮播大图与三排海报、观看记录、待看清单的封面都走 `SmartImage` 同一条链路，切换方式后整站一起变。

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
npm install
PASSWORD=dev-password npm run dev      # http://localhost:8080，改代码热更新

npm run typecheck                      # tsc --noEmit
npm run lint                           # eslint src
npm run test                           # vitest，核心库单测（cms-parser / m3u8 / ssrf / store / auth ...）
npm run build                          # 生产构建
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
| `.github/workflows/ci.yml` | push / PR 到 `main` | `npm ci` → `npm run typecheck` → `npm run lint` → `npm run build` |
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
