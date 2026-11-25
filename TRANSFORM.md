# trytv · 改造说明

本仓库 **trytv（看看电视）** 是把 **LibreTV（Next.js 版，v2.24.0，AGPL-3.0）** 按 <https://carefreestars.dynv6.net/> 的界面与功能改造成的站点。

改造思路是——**不做重写，保留原有采集/聚合/播放内核，只做换皮 + 补业务**：

原有的多源聚合搜索、跨源同名合并、HLS 播放、跳片头、直连代理、换源测速、PWA 全部保留；
新增的是目标站独有的那层业务壳：求片、赞赏留言板、站长通知、私密短剧、后台、电视版、下载页、榜单页、我的页。

> 面向部署者的完整文档见 [README.md](./README.md)。本文件只讲「改了什么、怎么改、为什么」。

---

## 一、跑起来

```bash
# 1) 依赖（沙箱/受限环境必须用 hoisted，否则 next 找不到 styled-jsx）
pnpm install --node-linker=hoisted

# 2) 配置
cp .env.example .env.local
#   站长密码不填时默认 admin（登录 /admin 用），公网部署请改掉
#   想开私密短剧再加 SHORTS_PASSWORD=xxx

# 3) 构建 & 启动
pnpm build && pnpm start
```

> **受限环境注意**：如果构建时报 `Error: spawn EPERM`（无法创建子进程），本仓库带了一个补丁 shim，用它代替原命令即可：
>
> ```bash
> node -r ./tools/next-build-shim.js node_modules/next/dist/bin/next build
> node -r ./tools/next-build-shim.js node_modules/next/dist/bin/next start -p 3000
> ```

Docker 部署：仓库根的 `docker-compose.yml` 直接可用（`docker compose up -d --build`，默认密码 `admin`）。
镜像三阶段构建（deps → builder → runner），业务数据挂命名卷 `trytv-data:/app/.data`；
想让业务变量生效，把它们写进 compose 的 `environment:`（`.env` 只用于 compose 插值，不进镜像）。
`docker compose pull` 依赖 GHCR 上已有镜像 —— 仓库没推过 `v*` tag 时镜像是空的，此时走 `--build` 或先发 tag。

---

## 二、页面地图

| 路由 | 说明 | 改动 |
| --- | --- | --- |
| `/` | 首页：hero 轮播 + 三个横滑片单（热门电影 / 热门剧集 / 豆瓣高分）+ 搜索 | 重写 |
| `/?s=关键词` | 搜索结果（服务端并行聚合、同名合并、分批渲染、失败源提示） | 保留原逻辑，界面换新 |
| `/search` | 独立搜索入口：搜索历史 + 热门词 + 片单引流 | 新建 |
| `/rank` | 榜单：周榜（豆瓣周榜 + 百度热播）6 个 + 豆瓣分类 10 个，可翻页 | 新建 |
| `/mine` | 我的：观看记录 / 待看（IndexedDB + localStorage，不上传） | 新建 |
| `/mine/request` | 我的求片：按昵称查提交进度与站长回复 | 新建 |
| `/admin` | 后台：求片处理、赞赏留言审核、站长通知 | 新建 |
| `/tv` | 电视版大屏：6 分类 × 12 部，方向键/回车/[ ] 遥控器友好 | 新建 |
| `/download` | 软件下载 + PWA 安装指引 | 新建 |
| `/shorts` | 私密短剧：口令进入，竖屏上下滑连播 | 新建 |
| `/watch` | 播放页（原播放器内核不动，顶栏加「加入待看」） | 微改 |
| `/live` | 直播 / IPTV（上游能力，未改） | — |
| `/about` | 关于：用法、快捷键、隐私、免责 | 重写 |

## 三、业务接口

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/request` | POST / GET | 求片提交（匿名）；`?nick=` 查自己的，`?scope=latest` 公开最新 |
| `/api/tip` | POST / GET | 赞赏留言提交；GET 只返回已审核通过（`shown`）的 |
| `/api/notice` | GET | 站长通知（公开读） |
| `/api/shorts` | POST / GET | 口令换签名 cookie（httpOnly，7 天）；GET 校验后下发短剧清单。口令来源：后台「私密短剧」里的 scrypt 哈希优先，`SHORTS_PASSWORD` 兜底；入口关闭时返回 404 |
| `/api/admin` | GET / POST | 后台：`?res=stats\|requests\|tips\|all`；action = `request.status` / `request.reply` / `request.delete` / `tip.status` / `tip.delete` / `notice.save` |

后台鉴权复用 LibreTV 的 `PASSWORD` + HMAC 签名 cookie（`src/lib/auth.ts`、`src/lib/api-guard.ts`），没有另开一套账号体系。

`getPassword()` 在未设置 `PASSWORD` 时回退内置默认值 `admin`（`DEFAULT_ADMIN_PASSWORD`），`/api/status` 下发 `usingDefaultPassword` 供登录框提示；`src/middleware.ts` 与 `src/lib/users.ts` 的会话密钥派生同样用 `admin` 兜底 —— 这三处必须一致，否则登录后会被反复踢回 /login。

## 四、数据落在哪

- **服务端业务数据**：`.data/site.json`（可用 `SITE_DATA_DIR` 改目录）。求片、赞赏留言、站长通知、短剧清单都在这里，写入是串行队列 + 临时文件 rename，避免并发写坏。
- **用户本地数据**：观看记录/进度在 IndexedDB（`libretv` 库），搜索历史与待看在 localStorage。除了提交求片/留言，什么都不会上传到服务器。

短剧清单的格式（在 `.data/site.json` 的 `shorts` 数组里维护）：

```json
{
  "id": "s1",
  "title": "第一话",
  "url": "https://example.com/video.mp4",
  "poster": "https://example.com/cover.jpg",
  "desc": "简介",
  "episodes": [{ "t": "第01集", "u": "https://example.com/ep1.mp4" }]
}
```

## 五、改站只要动两处

**0. 服务区位置** —— `ServiceSheet` 只在 `/mine` 与 `/mine/request` 渲染。首页与搜索页不再出现那排服务入口（站长要求），相关弹窗逻辑没有变。

**1. `src/lib/site.ts`** —— 站名、Logo 单字、slogan、搜索框文案、标题模板、主题色，以及 8 个功能开关（求片/赞赏/通知/短剧/后台/电视版/下载/榜单）。这些也可以用环境变量覆盖，不必改代码：

```bash
NEXT_PUBLIC_SITE_NAME=看看电视
NEXT_PUBLIC_SITE_MARK=君
NEXT_PUBLIC_SITE_SLOGAN=每日一部好片
NEXT_PUBLIC_FEATURE_SHORTS=0     # 关掉私密短剧入口
NEXT_PUBLIC_SERVER_COST=75       # 赞赏弹窗里的服务器成本
NEXT_PUBLIC_DOWNLOADS=Android|安卓版|支持 5.1+|https://example.com/app.apk
```

**2. `src/app/globals.css`** —— 配色 token（对齐目标站：底 `#08080a`、卡片 `#0e0e12`、主色 `#00a6ff`、评分金 `#ffc44d`）。

> 上线前记得**替换收款码**：`public/img/alipay.jpg`、`public/img/wechat.png` 现在是占位图（图上写着 replace this image）。

## 六、这次改了哪些文件

新增：

```
src/lib/site.ts                  站点品牌 + 功能开关 + 导航 + 首页片单
src/lib/site-data.ts             业务数据层（.data/site.json，串行写）
src/lib/site-client.ts           业务接口的客户端封装 + 通知弹窗 hook
src/components/home-hero.tsx     首页轮播 + 横滑片单
src/components/bottom-tabs.tsx   移动端底部 4 tab
src/components/service-sheet.tsx 服务区（求片/赞赏/留言板/通知/短剧/下载/电视版/后台）+ 4 个弹窗（只挂在「我的」页）
src/components/mine-panels.tsx   观看记录 / 待看 / 加入待看按钮
src/app/rank/page.tsx            榜单
src/app/search/page.tsx          搜索入口
src/app/mine/page.tsx            我的
src/app/mine/request/page.tsx    我的求片
src/app/admin/page.tsx           后台
src/app/tv/page.tsx              电视版
src/app/download/page.tsx        软件下载
src/app/shorts/page.tsx          私密短剧
src/app/api/request/route.ts     求片接口
src/app/api/tip/route.ts         赞赏留言接口
src/app/api/notice/route.ts      站长通知接口
src/app/api/shorts/route.ts      短剧口令 + 清单
src/app/api/admin/route.ts       后台接口
tools/next-build-shim.js         受限环境构建补丁（spawn EPERM 绕行）
public/img/alipay.jpg            收款码占位
public/img/wechat.png            收款码占位
```

改写：`src/app/page.tsx`（首页）、`src/app/layout.tsx`、`src/app/manifest.ts`、`src/app/globals.css`、`src/app/about/page.tsx`、`src/components/header.tsx`、`src/components/site-footer.tsx`、`src/components/icon.tsx`（补 11 个图标）、`src/app/watch/page.tsx`（加入待看）、`.env.example`。

## 七、验证记录

```
next build          ✓ 33 个路由全部产出（TypeScript + ESLint 通过）
/ /rank /search /mine /mine/request /admin /tv /download /shorts /about /live /watch   → 全 200
/api/request POST   → 落盘 .data/site.json
/api/request?nick=  → 回读一致
/api/tip POST/show  → 上墙、累计金额正确
/api/admin 未登录    → 401；登录后 stats/requests/tips/notice 全通
/api/shorts 无口令   → 503（未配置）/ 401（口令错）/ cookie 后 200 下发清单
标题 / manifest      → 「看看电视 - 每日一部好片」、theme #00a6ff
```

## 八、与目标站的已知差异

1. **片源不同**：目标站自带一套聚合后端（`/api/search` 返回 `md:/lz:/ry:` 前缀的聚合 id）。本项目用的是 LibreTV 的采集站体系，搜索结果走 `source + vodId`，所以没有「多站同片自动合并成一条 id」——替代方案是首页的跨源同名聚合卡片，效果等价。
2. **没有内置「今日推荐 / 随机一部」**：目标站有 `/api/daily`、`/api/random`。这里首页 hero 是「热门 + 随机轮换」，点进去直接搜索。
3. **赞赏是纯展示**：没有接支付，只展示收款码 + 记录留言，由站长人工核对后上墙——和目标站的流程一致。
4. **短剧清单手动维护**：目标站有一整套短剧后台；这里简化成 `site.json` 里的数组 + 口令 cookie，够用且不需要额外管理界面。

## 九、许可

上游 LibreTV 为 AGPL-3.0，本项目同样遵循；页脚保留署名。二次分发请一并开源你的修改。

## 用户体系与访问策略（第二轮补充）

| 文件 | 作用 |
| --- | --- |
| `src/components/access-gate-modal.tsx` | 三合一的登录/注册/站长密码弹窗（设置抽屉、我的页、服务菜单共用） |
| `src/components/mine-account-card.tsx` | 「我的」页账号卡：登录 / 注册 / 管理员登录 / 退出 / 进入后台 |
| `src/components/header.tsx` | 未登录点齿轮先弹登录，登录后才打开设置抽屉 |
| `src/app/*/view.tsx` + `page.tsx` | 页面拆成「服务端壳（声明 force-dynamic）+ 客户端业务」，否则静态预渲染会绕过访问门槛 |
| `src/lib/store.ts` | `imageProxyMode` 出厂默认改 `proxy`；设置项「封面图加载」保留三档 |
| `src/components/home-hero.tsx` | 轮播大图与海报墙改用 `SmartImage`，跟着图片代理设置走 |

## 用户体系与访问策略（v1.0 追加）

| 新增文件 | 作用 |
| --- | --- |
| `src/lib/users.ts` | 用户表（`.data/users.json`）、scrypt 密码哈希、`ltv_user` 会话签名 / 解析、`sessionKey()` |
| `src/lib/api-guard.ts` | `currentActor()` / `actorAllowed()` / `guardRequest()`（按访问模式）/ `guardAdmin()`（只认站长） |
| `src/middleware.ts` | 全站门槛：读 `/api/access` 拿策略，`/admin` 单独只认站长 cookie，其余未通过 307 → `/login?next=` |
| `src/app/api/user/route.ts` | 注册 / 登录 / 退出，限流 10 次 / 10 分钟 |
| `src/app/api/access/route.ts` | 策略 + 身份（middleware 专用，`no-store`） |
| `src/components/access.tsx` | `AccessProvider` / `useAccess()` |
| `src/components/access-gate.tsx` | 客户端兜底遮罩（middleware 之外的第二道） |
| `src/app/login/page.tsx` | 登录 / 注册 / 站长三个 tab |

- 设置项落在 `.data/site.json` 的 `settings`：`accessMode`（`open` / `login` / `members`）、`allowRegister`、`siteName`、`slogan`、`banner`。
- 后台 `/api/admin` 新增 `?res=users|settings` 与 `settings.save` / `user.create` / `user.disable` / `user.enable` / `user.password` / `user.delete`。
- 内容接口（`search` / `detail` / `douban` / `hot-list` / `bangumi` / `quality` / `live/*`）用 `guardRequest()`；管理接口（`admin` / `publish` / `source-list` / `source/test`）用 `guardAdmin()`。

## 第三轮补充：设置里的「站点与账号」

| 文件 | 改动 |
| --- | --- |
| `src/components/site-policy-panel.tsx`（新） | 设置抽屉「偏好设置 → 站点与账号」：站长直接改 `accessMode` / `allowRegister` / `adultFilter`（走 `settings.save`），普通人看到只读当前策略 + 「登录 / 注册」「站长登录」两个入口 |
| `src/lib/auth-client.ts`（新） | 从 `src/app/admin/page.tsx` 里抽出的 `authFetch<T>()`（原来只在后台组件内部），设置面板复用同一实现 |
| `src/components/source-manager.tsx` | `SecondaryTab` 加 `'site'`，`prefs` 二级页签最前插入「站点与账号」，抽屉里挂 `<SitePolicyPanel />` |
| `src/components/header.tsx` | ① 去掉并排的第二枚齿轮（原 `/admin` 链接），后台入口收到设置抽屉与「我的」账号卡；② `openSettings()` 改为「已登录直接开抽屉，未登录一律先弹登录/注册选择」；③ 手机折叠菜单对已登录站长补「管理后台」 |
| `src/components/access-gate-modal.tsx` | 新增可选 `onSkip`：「先不登录，继续」，只在 `accessMode === 'open'` 时由调用方传入 |

- 为什么这么改：上游 LibreTV 的「超管配置」在设置面板里，本站把访问策略放进了 `/admin`，结果设置里完全看不到「开登录 / 开注册」，用户会判断成功能丢失。现在两处都能改，数据同一份（`.data/site.json` 的 `settings`）。
- 权限边界没变：改这些开关仍只认站长（`guardAdmin()`），设置面板对普通账号只显示只读状态。

## 第三轮补充（续）：后台「配置」页签（JSON 编辑器，参考 hafrey1/LunaTV-config 的 web-editor）

新增/改动：

| 文件 | 作用 |
| --- | --- |
| `src/lib/admin-config.ts` | 前后端共用的纯逻辑：`toEditableConfig()`（口令哈希换成 `<已设置>`）、`parseConfig()`（只允许 `settings` / `shorts` 两个顶层字段，逐字段校验并回行列号）、`stringifyConfig()` |
| `src/components/admin-config-panel.tsx` | Monaco 编辑器面板：左栏工具面板（文件 / JSON / 显示）、主区三页签（编辑器 / 树状视图 / 预览）、底部状态栏（行列 / 选中字符 / UTF-8 / 校验 / 最后保存）、`Ctrl+S` 保存、`Ctrl+O` 重新载入 |
| `src/lib/site-data.ts` | 新增 `replaceShorts()`，整体替换短剧数组（保留自带 id，非法条目丢弃，上限 200） |
| `src/app/api/admin/route.ts` | 新增 `res=config`（读）与 `config.save`（写），口令三态：占位符不动 / 空串清除 / 其它值重设 |
| `src/app/admin/page.tsx` | 新增「配置」标签页 |
| `src/components/icon.tsx` | 图标补 `file` / `sort` / `collapse` / `copy` / `code` |
| `scripts/sync-monaco.mjs` | 从 `node_modules/monaco-editor/min/vs` 裁剪出 JSON 编辑所需子集到 `public/monaco/vs`（约 4.6 MB） |
| `public/monaco/vs/**` | 提交进仓库的自托管 Monaco 资源，后台不连 CDN |

为什么只做「编辑器」：LunaTV-config 的 web-editor 本质是借用户的 GitHub Token 直接读写它自己仓库里的
`LunaTV-config.json`（外加一个 Cloudflare Worker 做 CORS 代理和 Base58 订阅）。本站的配置本来就在服务端
（`.data/site.json`），后台已经能用 `PASSWORD` 鉴权，所以不需要 Token、不需要 Worker，直接编辑本站配置。

权限边界未变：`config.save` 走 `guardAdmin()`，只有站长会话能写；`shortsPasswordHash` 永远不下发哈希原文。

## 第四轮补充：登录入口与账号同步

用户反馈（原话）：「打开我的点击管理员面板，应该只需要输入密码，就可以直接进入管理员面板了，主页的设置修改为 登录 登录之后能够同步个人的 观影历史和收藏，修复一下主页顶端的那个推荐，他滚动不正常」

| 文件 | 改动 |
| --- | --- |
| `src/lib/watch-sync.ts` | 新增。`syncAfterLogin()`（登录后认领/合并）、`schedulePush()`（2.5s 防抖增量推送）、`pushBundle()`、`readLocalWatchlist/writeLocalWatchlist` |
| `src/app/api/library/route.ts` | 新增。`GET` 读当前账号的记录（没存过 `null`），`POST` 整包覆盖；上限 500 条历史 / 300 条待看 |
| `src/lib/site-data.ts` | `SiteData.library?: Record<string, LibraryEntry>`；新增 `getLibrary()` / `setLibrary()` / `removeLibrary()`；`readFile()` 兼容旧文件 |
| `src/components/access.tsx` | `loginUser` / `registerUser` 成功后 `syncAfterLogin()`；新增 `usingDefaultPassword`（提示仍在用默认密码 admin） |
| `src/components/access-gate-modal.tsx` | 新增 `adminRedirect`：站长登录成功后可直接跳后台 |
| `src/components/mine-account-card.tsx` | 「管理员登录」传 `adminRedirect="/admin"`，输完密码直达后台 |
| `src/components/service-sheet.tsx` | 「管理员登录」同样直达后台 |
| `src/components/header.tsx` | 未登录时顶栏是「登录」按钮，已登录才显示齿轮；手机折叠菜单补「设置」项 |
| `src/app/admin/page.tsx` | 未登录时不再给跳转按钮，直接渲染就地登录框 `AdminGate`（只输站长密码） |
| `src/components/home-hero.tsx` | 轮播新增 `settleRef`：程序化滚动期间忽略中间态 scroll 事件（修「来回抖」）；窗口尺寸变化后按比例重算位置；smooth 后 420ms 校准一次 |
| `src/components/mine-panels.tsx` | `writeWatchlist` 改为复用 `watch-sync` 的实现（同一 localStorage 键，格式不会漂移）；加入/移出/清空时触发 `schedulePush()` |
| `src/app/watch/view.tsx` | 首次写入记录与进度落盘后触发 `schedulePush()` |

### 为什么「管理员登录」要直达后台
「我的 → 管理员登录」的语义就是「我要进后台」。之前是验证通过后弹窗关掉、停在「我的」页，
用户还得再找一次入口——中间任何一步渲染慢一点就会被理解成「打不开」。现在验证成功后直接
`window.location.href = '/admin'`；而顶栏齿轮那条路径不传 `adminRedirect`，登录后照旧接着开设置抽屉，两种意图分开。

### 为什么观影记录要「整包替换」而不是逐条 diff
记录量级是百级、一整包只有几 KB；逐条 diff 需要版本向量或时间戳收敛规则，
在「手机和电视同时看」这种场景下反而更容易打架。整包覆盖 + 登录时按 `id` 合并（取较新那条）足够用，
且只有一条路径，不会出现「本地和服务端都觉得自己是对的」。

## 第五轮补充：视频源导入（粘贴 / 文件 / 订阅地址）

用户反馈（原话）：「再修改完善一下视频源导入功能，现在导入很不方便，最好要还能识别TVbox视频源……短剧和私密的视频应该也能导入视频源，和 LunaTV-config 这个里面的应该类似」。

| 文件 | 改动 |
| --- | --- |
| `src/lib/source-text-import.ts` | 新增。`parseSourceText()` 统一识别 5 种格式：LibreTV-SourceList / TVBox / LunaTV `api_site` / 单源 / 裸数组；`parseLooseJson()` 容忍注释与尾随逗号；`toLunaConfig()` / `mergeSourceEntries()` 支持导出与去重合并 |
| `src/app/api/source-import/route.ts` | 新增。`POST {text}` 解析粘贴内容、`GET ?url=` 拉远程配置；两者都走 `guardRequest()`，远程拉取复用 `checkUpstreamAllowed()` 防 SSRF 与 `checkLiveUrlAllowed()` 校验直播地址 |
| `src/components/source-import-panel.tsx` | 新增。「粘贴 / 文件 / 订阅地址」三页签 + 解析预览 + 逐条勾选（库里已有的默认不勾）；展示格式名、跳过原因、已存在标记 |
| `src/components/source-manager.tsx` | `SecondaryTab` 加 `'import'`；`SECONDARY_TABS.sources` 插入「导入源」；新增 `SourceImportSection`（把选中项写进 `addCustomApi` / `addLiveSubscription`）；订阅页标题补交叉提示 |
| `src/lib/admin-config.ts` | `parseConfig()` 的 `shorts` 改为可选（缺失 ≠ 清空），新增 `ParsedConfig` 类型 |
| `src/app/api/admin/route.ts` | `config.save` 只有显式给了 `shorts` 数组才整体替换，避免「只贴 settings 片段」把线上短剧清空 |
| `README.md` | 新增「一次导入（粘贴 / 文件 / 订阅地址）」小节与 `/api/source-import` 接口行 |

### 为什么不做「一键全自动识别所有格式并直接入库」
导入是**破坏性**操作（会往用户的源列表里加东西），而群里转发的配置经常混着几十个 Spider 站点和无
key 的模板源。自动入库的结果是列表里塞满点不开的源，用户还得手动删。所以流程故意设成
「解析 → 预览 → 勾选 → 入库」，并在预览里说明每条为什么被跳过（`describeParseStats` 的既有能力）。

### 短剧源怎么进
短剧清单（`.data/site.json` 的 `shorts` 数组）走的是另一条路：后台「配置」页签的 JSON 编辑器直接编辑，
或在「私密短剧」页签逐条增改。点播/直播源导入不碰短剧清单，避免一次导入误改私密内容。
