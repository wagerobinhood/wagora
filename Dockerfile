# Wage · Next.js 16 standalone（四阶段 · 域名构建期内联）
FROM node:22-alpine AS base

FROM base AS deps
WORKDIR /app
ARG NPM_REGISTRY=https://registry.npmjs.org/
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && pnpm config set registry "$NPM_REGISTRY" && pnpm install --frozen-lockfile --ignore-scripts

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ARG SITE_NAME
ENV SITE_NAME=$SITE_NAME
ARG ADMIN_API_BASE
ENV ADMIN_API_BASE=$ADMIN_API_BASE
RUN corepack enable && pnpm exec next build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# 引擎脚本（仅 *.mjs；.env/state 被忽略，密钥运行时经 env_file 注入）
COPY --from=builder /app/engine/*.mjs ./engine/
# standalone 追踪会误带 scripts/docs 等非运行时文件（部分含 token 字面量）——镜像内清除
RUN rm -rf /app/scripts /app/docs /app/config /app/deployments /app/shots-fix /app/.tmp-check     && find /app -maxdepth 1 -name ".*" -not -name "." -not -name ".next" -exec rm -rf {} + 2>/dev/null || true
# 引擎是独立 Node 脚本（不经 Next 打包），需自带 viem；只装这一个运行时依赖
RUN cd /app/engine && npm init -y >/dev/null 2>&1 && npm install --no-audit --no-fund --omit=dev viem@2.57.16 2>&1 | tail -1
EXPOSE 3000
CMD ["node", "server.js"]
