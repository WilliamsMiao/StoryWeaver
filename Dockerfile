# StoryWeaver 多阶段构建
# 支持前后端分离部署

# =============================================
# 阶段1: 前端构建
# =============================================
FROM node:18-alpine AS frontend-build

WORKDIR /app/frontend

# 复制前端依赖文件
COPY frontend/package*.json ./

# 安装前端依赖
RUN npm ci --silent

# 复制前端源代码
COPY frontend/ ./

# 设置构建时环境变量（生产环境前端连接后端的地址由Nginx代理，所以为空）
ARG VITE_SERVER_URL=""
ENV VITE_SERVER_URL=$VITE_SERVER_URL

# 构建前端应用
RUN npm run build

# =============================================
# 阶段2: 后端基础镜像
# =============================================
FROM node:18-alpine AS backend-base

WORKDIR /app

# 安装系统依赖（SQLite需要）
RUN apk add --no-cache python3 make g++ sqlite sqlite-dev

# 复制后端依赖文件
COPY package*.json ./

# 安装后端依赖（仅生产依赖）
RUN npm ci --only=production --silent && \
    npm cache clean --force

# =============================================
# 阶段3: 生产运行镜像
# =============================================
FROM node:18-alpine AS production

WORKDIR /app

# 安装运行时依赖
RUN apk add --no-cache sqlite tini

# 从基础镜像复制 node_modules
COPY --from=backend-base /app/node_modules ./node_modules

# 复制后端源代码
COPY backend/ ./backend/
COPY package.json ./

# 从前端构建阶段复制构建产物
COPY --from=frontend-build /app/frontend/dist ./public

# 创建数据目录和日志目录
RUN mkdir -p /app/data /app/logs && \
    chown -R node:node /app

# 使用非 root 用户运行
USER node

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3000

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

# 使用 tini 作为 init 进程
ENTRYPOINT ["/sbin/tini", "--"]

# 启动应用
CMD ["node", "backend/server.js"]

