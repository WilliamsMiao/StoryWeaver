# StoryWeaver 部署指南# StoryWeaver 部署指南



本文档介绍如何将 StoryWeaver 剧本杀游戏应用部署到生产环境，支持多人在线游戏。本文档介绍如何部署 StoryWeaver 应用到生产环境。



## 📋 前置要求## 前置要求



- **Docker** 20.10+- Docker 20.10+

- **Docker Compose** 2.0+- Docker Compose 2.0+

- **服务器配置**:- 至少 1GB 可用内存

  - 至少 2GB 可用内存- 至少 5GB 可用磁盘空间

  - 至少 10GB 可用磁盘空间

  - 开放端口: 80 (HTTP), 443 (HTTPS)## 快速开始



## 🚀 快速开始### 1. 克隆仓库



### 1. 克隆仓库```bash

git clone <repository-url>

```bashcd StoryWeaver

git clone https://github.com/WilliamsMiao/StoryWeaver.git```

cd StoryWeaver

```### 2. 配置环境变量



### 2. 配置环境变量复制环境变量示例文件：



```bash```bash

# 复制环境变量模板cp .env.production.example .env.production

cp .env.example .env```



# 编辑配置文件编辑 `.env.production` 文件，填写必要的配置：

nano .env

``````env

# AI服务配置

**必须配置的环境变量**:AI_PROVIDER=deepseek

DEEPSEEK_API_KEY=your_api_key_here

```env

# AI服务配置（必填）# 数据库配置

AI_PROVIDER=deepseekDB_PATH=/app/data/storyweaver.db

DEEPSEEK_API_KEY=your_deepseek_api_key_here

# CORS配置（生产环境应设置为实际域名）

# 生产环境配置（推荐）CORS_ORIGIN=https://yourdomain.com

NODE_ENV=production```

CORS_ORIGIN=https://your-domain.com

### 3. 构建和启动

# 可选：自定义端口

HTTP_PORT=80```bash

HTTPS_PORT=443# 构建镜像

```docker-compose build



### 3. 构建和启动# 启动服务

docker-compose up -d

```bash

# 一键部署# 查看日志

docker-compose up -d --builddocker-compose logs -f

```

# 查看日志

docker-compose logs -f### 4. 验证部署

```

```bash

### 4. 验证部署# 健康检查

curl http://localhost/health

```bash

# 检查服务状态# 或使用脚本

docker-compose ps./scripts/health-check.sh

```

# 健康检查

curl http://localhost/health## Docker Compose 配置

```

### 服务说明

访问 `http://your-server-ip` 即可使用。

- **storyweaver-app**: 主应用容器（端口 3001）

---- **nginx**: 反向代理服务器（端口 80/443）



## 🔧 详细配置### 数据持久化



### 环境变量说明数据库文件存储在 Docker 卷 `storyweaver-data` 中，确保数据持久化。



| 变量名 | 必填 | 默认值 | 说明 |### 资源限制

|--------|------|--------|------|

| `AI_PROVIDER` | 是 | `deepseek` | AI提供商: deepseek/openai/qwen/local |默认资源限制：

| `DEEPSEEK_API_KEY` | 是* | - | DeepSeek API密钥 |- CPU: 1.0 核心（限制）/ 0.5 核心（保留）

| `OPENAI_API_KEY` | 否 | - | OpenAI API密钥（使用OpenAI时必填）|- 内存: 512MB（限制）/ 256MB（保留）

| `QWEN_API_KEY` | 否 | - | 通义千问API密钥（使用Qwen时必填）|

| `NODE_ENV` | 否 | `production` | 运行环境 |可在 `docker-compose.yml` 中调整。

| `PORT` | 否 | `3000` | 后端服务端口 |

| `CORS_ORIGIN` | 否 | `*` | 允许的跨域来源 |## 部署脚本

| `DB_PATH` | 否 | `./data/storyweaver.db` | SQLite数据库路径 |

| `LOG_LEVEL` | 否 | `info` | 日志级别: debug/info/warn/error |### deploy.sh

| `HTTP_PORT` | 否 | `80` | Nginx HTTP端口 |

| `HTTPS_PORT` | 否 | `443` | Nginx HTTPS端口 |自动化部署脚本，包括：

- 数据库备份

### 获取 AI API 密钥- 拉取最新镜像

- 更新容器

#### DeepSeek（推荐）- 健康检查

1. 访问 [DeepSeek Platform](https://platform.deepseek.com/)- 自动回滚（如果失败）

2. 注册账号并创建 API Key

3. 将密钥填入 `DEEPSEEK_API_KEY````bash

# 设置环境变量

#### OpenAIexport DOCKER_USERNAME=yourusername

1. 访问 [OpenAI Platform](https://platform.openai.com/)export IMAGE_TAG=latest

2. 创建 API Key

3. 设置 `AI_PROVIDER=openai` 和 `OPENAI_API_KEY`# 执行部署

./scripts/deploy.sh

---```



## 🌐 域名和 HTTPS 配置### backup.sh



### 使用域名访问数据库备份脚本：



1. **配置 DNS**: 将域名 A 记录指向服务器 IP```bash

./scripts/backup.sh

2. **更新 CORS 配置**:```

```env

CORS_ORIGIN=https://your-domain.com备份文件保存在 `./backups/` 目录，自动清理 7 天前的备份。

```

### health-check.sh

### 启用 HTTPS（推荐）

健康检查脚本：

#### 方式一：使用 Let's Encrypt 免费证书

```bash

```bash./scripts/health-check.sh

# 安装 certbot```

sudo apt install certbot

## Nginx 配置

# 获取证书（需要先停止 nginx）

docker-compose stop nginx### 基本配置

sudo certbot certonly --standalone -d your-domain.com

Nginx 配置文件位于：

# 复制证书- `nginx/nginx.conf` - 主配置

sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ./nginx/ssl/- `nginx/conf.d/storyweaver.conf` - 站点配置

sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem ./nginx/ssl/

```### HTTPS 配置



#### 方式二：使用已有证书如需启用 HTTPS，编辑 `nginx/conf.d/storyweaver.conf`：



将证书文件复制到 `nginx/ssl/` 目录：1. 取消注释 HTTPS server 块

- `fullchain.pem` - 完整证书链2. 配置 SSL 证书路径

- `privkey.pem` - 私钥3. 重启 Nginx 容器



#### 启用 HTTPS 配置```bash

docker-compose restart nginx

编辑 `nginx/conf.d/storyweaver.conf`，取消 HTTPS server 块的注释，并修改域名。```



---### 静态文件服务



## 📊 运维管理前端构建产物由 Nginx 直接服务，配置了缓存策略：

- JS/CSS/图片等静态资源：1年缓存

### 常用命令- HTML 文件：不缓存



```bash## CI/CD 集成

# 查看所有服务状态

docker-compose ps### GitHub Actions



# 查看实时日志项目包含 GitHub Actions 工作流（`.github/workflows/deploy.yml`），自动：

docker-compose logs -f- 构建 Docker 镜像

- 推送到 Docker Hub

# 仅查看后端日志- （可选）自动部署到服务器

docker-compose logs -f storyweaver-app

### 配置 Secrets

# 重启服务

docker-compose restart在 GitHub 仓库设置中添加以下 Secrets：

- `DOCKER_USERNAME`: Docker Hub 用户名

# 停止服务- `DOCKER_PASSWORD`: Docker Hub 密码或访问令牌

docker-compose down- `SSH_HOST`: （可选）部署服务器地址

- `SSH_USER`: （可选）SSH 用户名

# 完全重建（清除缓存）- `SSH_KEY`: （可选）SSH 私钥

docker-compose down

docker-compose build --no-cache## 监控和日志

docker-compose up -d

```### 健康检查端点



### 数据备份- `GET /health` - 应用健康状态

- `GET /api/metrics` - 性能指标（需设置 `ENABLE_METRICS=true`）

```bash

# 备份数据库### 日志查看

docker cp storyweaver-app:/app/data/storyweaver.db ./backup/

```bash

# 定时备份（添加到 crontab）# 查看所有日志

0 2 * * * docker cp storyweaver-app:/app/data/storyweaver.db /backup/storyweaver-$(date +\%Y\%m\%d).dbdocker-compose logs -f

```

# 查看应用日志

### 日志管理docker-compose logs -f storyweaver-app



日志文件位置：# 查看 Nginx 日志

- **Nginx 日志**: `./nginx/logs/`docker-compose logs -f nginx

- **应用日志**: Docker 容器内 `/app/logs/````



```bash### 结构化日志

# 清理旧日志

find ./nginx/logs -name "*.log" -mtime +30 -delete生产环境默认使用 JSON 格式日志，便于日志收集系统处理。

```

## 数据库管理

---

### 备份

## 🔄 更新升级

```bash

```bash# 手动备份

# 拉取最新代码./scripts/backup.sh

git pull origin main

# 或使用 cron 定时备份

# 重新构建并启动0 2 * * * /path/to/StoryWeaver/scripts/backup.sh

docker-compose down```

docker-compose build --no-cache

docker-compose up -d### 恢复

```

```bash

---# 停止容器

docker-compose down

## 🐛 故障排查

# 恢复备份文件

### 常见问题cp backups/storyweaver_YYYYMMDD_HHMMSS.db data/storyweaver.db



#### 1. 无法连接到服务器# 启动容器

```bashdocker-compose up -d

# 检查服务状态```

docker-compose ps

## 故障排查

# 检查端口监听

netstat -tlnp | grep -E '80|443|3000'### 容器无法启动



# 检查防火墙1. 检查日志：`docker-compose logs storyweaver-app`

sudo ufw status2. 检查环境变量配置

sudo ufw allow 803. 检查端口是否被占用

sudo ufw allow 4434. 检查磁盘空间

```

### 健康检查失败

#### 2. WebSocket 连接失败

- 检查 Nginx 配置中 WebSocket 代理是否正确1. 检查应用是否正常运行：`docker-compose ps`

- 确认防火墙允许 WebSocket 连接2. 检查健康检查端点：`curl http://localhost:3001/health`

- 检查浏览器控制台错误信息3. 查看应用日志：`docker-compose logs storyweaver-app`



#### 3. AI 生成失败### Socket.io 连接问题

```bash

# 检查 API Key 配置1. 检查 Nginx 配置中的 WebSocket 代理设置

docker-compose exec storyweaver-app env | grep API_KEY2. 检查防火墙设置

3. 查看浏览器控制台错误信息

# 查看错误日志

docker-compose logs storyweaver-app | grep -i error## 性能优化

```

### 数据库优化

#### 4. 数据库错误

```bash生产环境已自动应用以下 SQLite 优化：

# 检查数据目录权限- WAL 模式

docker-compose exec storyweaver-app ls -la /app/data- 64MB 缓存

- 5秒忙等待超时

# 重建数据库（警告：会丢失数据）- NORMAL 同步模式

docker-compose exec storyweaver-app rm -f /app/data/storyweaver.db

docker-compose restart storyweaver-app### 应用优化

```

- 请求队列管理（最大 3 并发）

---- 请求限流（15分钟 100 请求）

- 结构化日志（减少 I/O）

## 📈 性能优化

## 安全建议

### 服务器配置建议

1. **环境变量**: 不要在代码中硬编码敏感信息

| 并发玩家数 | CPU | 内存 | 磁盘 |2. **CORS**: 生产环境设置具体的 CORS 源，不要使用 `*`

|-----------|-----|------|------|3. **HTTPS**: 生产环境启用 HTTPS

| 1-10 | 1核 | 2GB | 10GB |4. **防火墙**: 只开放必要端口（80, 443）

| 10-50 | 2核 | 4GB | 20GB |5. **定期更新**: 定期更新 Docker 镜像和依赖

| 50-100 | 4核 | 8GB | 50GB |

## 扩展部署

### Docker 资源限制

### 多实例部署

编辑 `docker-compose.yml` 中的资源限制：

如需部署多个实例，可以：

```yaml1. 使用负载均衡器（如 Nginx、HAProxy）

deploy:2. 使用共享数据库（迁移到 PostgreSQL/MySQL）

  resources:3. 使用 Redis 进行会话共享

    limits:

      cpus: '2.0'### Kubernetes 部署

      memory: 2G

```项目 Dockerfile 兼容 Kubernetes，可以：

1. 构建镜像并推送到容器注册表

---2. 创建 Kubernetes Deployment 和 Service

3. 配置 Ingress 控制器

## 🔒 安全建议

## 支持

1. **定期更新**: 保持系统和依赖包最新

2. **HTTPS**: 生产环境务必启用 HTTPS如有问题，请查看：

3. **防火墙**: 只开放必要端口 (80, 443)- 项目 README.md

4. **备份**: 定期备份数据库- GitHub Issues

5. **日志监控**: 定期检查异常日志- 日志文件

6. **API 密钥**: 不要在代码中硬编码密钥


---

## 🤖 CI/CD 自动部署

项目已配置GitHub Actions CI/CD流程，支持自动部署到AWS服务器。

### 快速开始

1. **配置GitHub Secrets**（在仓库 Settings → Secrets and variables → Actions）：
   - `SSH_KEY`: NUMA.pem文件的完整内容
   - `DOCKER_USERNAME`: Docker Hub用户名（可选）
   - `DOCKER_PASSWORD`: Docker Hub密码（可选）

2. **推送代码**：推送到 `main` 分支即可自动触发部署

### 部署策略

- **代码更新**：仅代码文件变更时，使用rsync快速同步并重启服务
- **重大更新**：Dockerfile或依赖变更时，自动构建Docker镜像并完整部署

### 详细文档

完整的CI/CD设置和使用说明请参考 [CICD_SETUP.md](./CICD_SETUP.md)

## 📞 支持

如有问题，请：
1. 查看 [GitHub Issues](https://github.com/WilliamsMiao/StoryWeaver/issues)
2. 提交新的 Issue 描述问题
3. 查看应用日志获取详细错误信息
