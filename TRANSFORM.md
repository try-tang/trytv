# trytv · 改造说明

本仓库 **trytv（君砚影视）** 是把 **LibreTV（Next.js 版，v2.24.0，AGPL-3.0）** 按 <https://carefreestars.dynv6.net/> 的界面与功能改造成的站点。

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
#   必填 PASSWORD=你的访问密码
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

Docker 部署与上游一致（`docker compose up -d --build`），把 `.env.local` 里的变量写进 `docker-compose.yml` 的 `environment` 即可。

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
| `/api/shorts` | POST / GET | 口令换签名 cookie（httpOnly，7 天）；GET 校验后下发短剧清单 |
| `/api/admin` | GET / POST | 后台：`?res=stats\|requests\|tips\|all`；action = `request.status` / `request.reply` / `request.delete` / `tip.status` / `tip.delete` / `notice.save` |

后台鉴权直接复用 LibreTV 的 `PASSWORD` + HMAC 签名 cookie（`src/lib/auth.ts`、`src/lib/api-guard.ts`），没有另开一套账号体系。

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

**1. `src/lib/site.ts`** —— 站名、Logo 单字、slogan、搜索框文案、标题模板、主题色，以及 8 个功能开关（求片/赞赏/通知/短剧/后台/电视版/下载/榜单）。这些也可以用环境变量覆盖，不必改代码：

```bash
NEXT_PUBLIC_SITE_NAME=君砚影视
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
src/components/service-sheet.tsx 服务区（求片/赞赏/留言板/通知/短剧/下载/电视版/后台）+ 4 个弹窗
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
标题 / manifest      → 「君砚影视 - 每日一部好片」、theme #00a6ff
```

## 八、与目标站的已知差异

1. **片源不同**：目标站自带一套聚合后端（`/api/search` 返回 `md:/lz:/ry:` 前缀的聚合 id）。本项目用的是 LibreTV 的采集站体系，搜索结果走 `source + vodId`，所以没有「多站同片自动合并成一条 id」——替代方案是首页的跨源同名聚合卡片，效果等价。
2. **没有内置「今日推荐 / 随机一部」**：目标站有 `/api/daily`、`/api/random`。这里首页 hero 是「热门 + 随机轮换」，点进去直接搜索。
3. **赞赏是纯展示**：没有接支付，只展示收款码 + 记录留言，由站长人工核对后上墙——和目标站的流程一致。
4. **短剧清单手动维护**：目标站有一整套短剧后台；这里简化成 `site.json` 里的数组 + 口令 cookie，够用且不需要额外管理界面。

## 九、许可

上游 LibreTV 为 AGPL-3.0，本项目同样遵循；页脚保留署名。二次分发请一并开源你的修改。
