# 多阶段构建：前端 + 后端
# 阶段1: 前端构建
FROM node:18-alpine as frontend-build

WORKDIR /app/frontend

# 复制前端依赖文件
COPY frontend/package*.json ./

# 安装前端依赖
RUN npm ci

# 复制前端源代码
COPY frontend/ ./

# 构建前端应用
RUN npm run build

# 阶段2: 后端运行
FROM node:18-alpine as backend

WORKDIR /app

# 安装系统依赖（SQLite需要）
RUN apk add --no-cache python3 make g++ sqlite

# 复制后端依赖文件
COPY package.json ./

# 安装后端依赖（仅生产依赖）
RUN npm ci --only=production

# 复制后端源代码
COPY backend/ ./backend/

# 从前端构建阶段复制构建产物到 Nginx 可访问的位置
# 注意：实际部署时，静态文件由 Nginx 容器服务
# 这里复制到 public 目录作为备用
COPY --from=frontend-build /app/frontend/dist ./public

# 创建数据目录
RUN mkdir -p /app/data

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3001

# 暴露端口
EXPOSE 3001

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 启动应用
CMD ["node", "backend/server.js"]

