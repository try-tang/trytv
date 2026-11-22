# ---- 依赖阶段 ----
# 只在 package.json / 锁文件变化时重跑，装完的 node_modules 会被下面各阶段复用
FROM node:22-alpine AS deps
WORKDIR /app

# 构建期不写死密码：next.config.ts 的 env 会把 DOCKER_BUILD 下能读到的变量内联进产物，
# 若在这里设 PASSWORD，镜像里就会带着一个假密码
COPY package.json package-lock.json ./
# 用 ci 严格按锁文件装；失败（锁文件与 package.json 漂移）时退回 install 并在日志里报警
RUN npm ci --no-audit --no-fund || (echo "!! npm ci 失败，退回 npm install：请同步 package-lock.json" && npm install --no-audit --no-fund)

# ---- 构建阶段 ----
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV DOCKER_BUILD=1
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npm run build

# ---- 运行阶段 ----
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
ENV HOSTNAME=0.0.0.0
# 业务数据（求片 / 赞赏 / 通知 / 短剧清单 / 注册用户）落盘目录，compose 里挂到宿主机 ./data
ENV SITE_DATA_DIR=/app/.data

# 非 root 用户；.data 必须由运行用户持有，否则挂载卷后写不进
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs \
    && mkdir -p /app/.data && chown -R nextjs:nodejs /app/.data

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

USER nextjs

EXPOSE 8080
CMD ["node", "server.js"]
