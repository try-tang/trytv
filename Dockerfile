# ——————————————————————————————————————————————
# trytv（看看电视）多阶段镜像
#
# 三个阶段的职责：
#   deps    只装依赖（锁文件命中缓存时这一步几乎瞬时）
#   builder 编译 Next（standalone 产物）
#   runner  只留运行必需的三样：standalone / .next/static / public
#
# 关键：runner 阶段三样缺任何一样，页面能返回 200 但所有 JS/CSS 都 404，
# 浏览器侧就会白屏或「页面出了点问题」。所以 COPY 之后立刻做存在性校验，
# 让构建期直接失败，而不是生成一个坏镜像推到 GHCR 上。
# ——————————————————————————————————————————————
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# 锁文件与 package.json 不同步时 npm ci 会失败，退回 install 并打印提示，
# 避免因为一个 lock 小改动让整条部署链路挂掉
RUN npm ci --no-audit --no-fund \
    || (echo "!! npm ci 失败，退回 npm install：请同步 package-lock.json" && npm install --no-audit --no-fund)

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# DOCKER_BUILD=1 触发 next.config.ts 的 output: 'standalone'
# 注意：构建期不要注入 PASSWORD，否则会被内联进产物
ENV DOCKER_BUILD=1
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npm run build \
    && test -f .next/standalone/server.js \
    && test -d .next/static \
    && test -d public

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
ENV HOSTNAME=0.0.0.0
# 业务数据（求片 / 赞赏 / 通知 / 短剧清单 / 注册用户）落盘目录，compose 里挂到命名卷
ENV SITE_DATA_DIR=/app/.data

# 非 root 用户；.data 必须由运行用户持有，否则挂载卷后写不进
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs \
    && mkdir -p /app/.data && chown -R nextjs:nodejs /app/.data

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# 后置校验：三样必须在，且 server.js 可执行
RUN test -f /app/server.js \
    && test -d /app/.next/static \
    && test -d /app/public \
    && test -f /app/.next/BUILD_ID \
    || (echo "!! 运行产物不完整：standalone / static / public 任一缺失都会导致前端资源 404" && exit 1)

USER nextjs

EXPOSE 8080
CMD ["node", "server.js"]
