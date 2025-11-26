# StoryWeaver 部署指南

本文档介绍如何部署 StoryWeaver 应用到生产环境。

## 前置要求

- Docker 20.10+
- Docker Compose 2.0+
- 至少 1GB 可用内存
- 至少 5GB 可用磁盘空间

## 快速开始

### 1. 克隆仓库

```bash
git clone <repository-url>
cd StoryWeaver
```

### 2. 配置环境变量

复制环境变量示例文件：

```bash
cp .env.production.example .env.production
```

编辑 `.env.production` 文件，填写必要的配置：

```env
# AI服务配置
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=your_api_key_here

# 数据库配置
DB_PATH=/app/data/storyweaver.db

# CORS配置（生产环境应设置为实际域名）
CORS_ORIGIN=https://yourdomain.com
```

### 3. 构建和启动

```bash
# 构建镜像
docker-compose build

# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f
```

### 4. 验证部署

```bash
# 健康检查
curl http://localhost/health

# 或使用脚本
./scripts/health-check.sh
```

## Docker Compose 配置

### 服务说明

- **storyweaver-app**: 主应用容器（端口 3001）
- **nginx**: 反向代理服务器（端口 80/443）

### 数据持久化

数据库文件存储在 Docker 卷 `storyweaver-data` 中，确保数据持久化。

### 资源限制

默认资源限制：
- CPU: 1.0 核心（限制）/ 0.5 核心（保留）
- 内存: 512MB（限制）/ 256MB（保留）

可在 `docker-compose.yml` 中调整。

## 部署脚本

### deploy.sh

自动化部署脚本，包括：
- 数据库备份
- 拉取最新镜像
- 更新容器
- 健康检查
- 自动回滚（如果失败）

```bash
# 设置环境变量
export DOCKER_USERNAME=yourusername
export IMAGE_TAG=latest

# 执行部署
./scripts/deploy.sh
```

### backup.sh

数据库备份脚本：

```bash
./scripts/backup.sh
```

备份文件保存在 `./backups/` 目录，自动清理 7 天前的备份。

### health-check.sh

健康检查脚本：

```bash
./scripts/health-check.sh
```

## Nginx 配置

### 基本配置

Nginx 配置文件位于：
- `nginx/nginx.conf` - 主配置
- `nginx/conf.d/storyweaver.conf` - 站点配置

### HTTPS 配置

如需启用 HTTPS，编辑 `nginx/conf.d/storyweaver.conf`：

1. 取消注释 HTTPS server 块
2. 配置 SSL 证书路径
3. 重启 Nginx 容器

```bash
docker-compose restart nginx
```

### 静态文件服务

前端构建产物由 Nginx 直接服务，配置了缓存策略：
- JS/CSS/图片等静态资源：1年缓存
- HTML 文件：不缓存

## CI/CD 集成

### GitHub Actions

项目包含 GitHub Actions 工作流（`.github/workflows/deploy.yml`），自动：
- 构建 Docker 镜像
- 推送到 Docker Hub
- （可选）自动部署到服务器

### 配置 Secrets

在 GitHub 仓库设置中添加以下 Secrets：
- `DOCKER_USERNAME`: Docker Hub 用户名
- `DOCKER_PASSWORD`: Docker Hub 密码或访问令牌
- `SSH_HOST`: （可选）部署服务器地址
- `SSH_USER`: （可选）SSH 用户名
- `SSH_KEY`: （可选）SSH 私钥

## 监控和日志

### 健康检查端点

- `GET /health` - 应用健康状态
- `GET /api/metrics` - 性能指标（需设置 `ENABLE_METRICS=true`）

### 日志查看

```bash
# 查看所有日志
docker-compose logs -f

# 查看应用日志
docker-compose logs -f storyweaver-app

# 查看 Nginx 日志
docker-compose logs -f nginx
```

### 结构化日志

生产环境默认使用 JSON 格式日志，便于日志收集系统处理。

## 数据库管理

### 备份

```bash
# 手动备份
./scripts/backup.sh

# 或使用 cron 定时备份
0 2 * * * /path/to/StoryWeaver/scripts/backup.sh
```

### 恢复

```bash
# 停止容器
docker-compose down

# 恢复备份文件
cp backups/storyweaver_YYYYMMDD_HHMMSS.db data/storyweaver.db

# 启动容器
docker-compose up -d
```

## 故障排查

### 容器无法启动

1. 检查日志：`docker-compose logs storyweaver-app`
2. 检查环境变量配置
3. 检查端口是否被占用
4. 检查磁盘空间

### 健康检查失败

1. 检查应用是否正常运行：`docker-compose ps`
2. 检查健康检查端点：`curl http://localhost:3001/health`
3. 查看应用日志：`docker-compose logs storyweaver-app`

### Socket.io 连接问题

1. 检查 Nginx 配置中的 WebSocket 代理设置
2. 检查防火墙设置
3. 查看浏览器控制台错误信息

## 性能优化

### 数据库优化

生产环境已自动应用以下 SQLite 优化：
- WAL 模式
- 64MB 缓存
- 5秒忙等待超时
- NORMAL 同步模式

### 应用优化

- 请求队列管理（最大 3 并发）
- 请求限流（15分钟 100 请求）
- 结构化日志（减少 I/O）

## 安全建议

1. **环境变量**: 不要在代码中硬编码敏感信息
2. **CORS**: 生产环境设置具体的 CORS 源，不要使用 `*`
3. **HTTPS**: 生产环境启用 HTTPS
4. **防火墙**: 只开放必要端口（80, 443）
5. **定期更新**: 定期更新 Docker 镜像和依赖

## 扩展部署

### 多实例部署

如需部署多个实例，可以：
1. 使用负载均衡器（如 Nginx、HAProxy）
2. 使用共享数据库（迁移到 PostgreSQL/MySQL）
3. 使用 Redis 进行会话共享

### Kubernetes 部署

项目 Dockerfile 兼容 Kubernetes，可以：
1. 构建镜像并推送到容器注册表
2. 创建 Kubernetes Deployment 和 Service
3. 配置 Ingress 控制器

## 支持

如有问题，请查看：
- 项目 README.md
- GitHub Issues
- 日志文件

