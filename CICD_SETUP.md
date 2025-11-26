# CI/CD 自动化部署设置指南

## 概述

本项目已配置GitHub Actions CI/CD流程，支持自动部署到AWS服务器。部署策略采用混合方式：
- **代码更新**：使用rsync快速同步代码并重启服务
- **重大更新**：构建Docker镜像并完整部署

## 配置GitHub Secrets

在GitHub仓库中配置以下Secrets（Settings → Secrets and variables → Actions → New repository secret）：

### 必需配置

1. **SSH_KEY**
   - 描述：SSH私钥，用于连接AWS服务器
   - 值：NUMA.pem文件的完整内容
   - 获取方式：`cat NUMA.pem` 复制全部内容

2. **SSH_HOST**（可选，已在workflow中硬编码）
   - 描述：AWS服务器地址
   - 值：`ec2-13-250-179-235.ap-southeast-1.compute.amazonaws.com`

3. **SSH_USER**（可选，已在workflow中硬编码）
   - 描述：SSH用户名
   - 值：`ubuntu`

### 可选配置（用于Docker Hub）

4. **DOCKER_USERNAME**
   - 描述：Docker Hub用户名
   - 值：你的Docker Hub用户名
   - 注意：如果不配置，Docker构建将不会推送到Docker Hub，但会在服务器上本地构建

5. **DOCKER_PASSWORD**
   - 描述：Docker Hub密码或访问令牌
   - 值：你的Docker Hub密码或访问令牌
   - 注意：建议使用访问令牌而非密码

## 部署流程

### 自动触发

当代码推送到 `main` 或 `master` 分支时，会自动触发部署流程：

1. **变更检测**：自动检测代码变更类型
   - 如果变更了 `Dockerfile`、`package.json`、`docker-compose.yml` 等文件 → 使用Docker部署
   - 如果只变更了代码文件（`backend/`、`frontend/src/`等） → 使用rsync快速部署

2. **执行部署**：
   - **rsync部署**：同步代码到服务器，重新构建容器（使用缓存加速），更新容器内代码，重启服务
   - **Docker部署**：构建镜像，部署到服务器，重启服务

3. **健康检查**：部署后自动检查服务健康状态

### 手动触发

在GitHub Actions页面可以手动触发workflow：
1. 进入仓库的 Actions 标签页
2. 选择 "Build and Deploy StoryWeaver" workflow
3. 点击 "Run workflow" 按钮

## 变更检测规则

### 需要Docker构建的变更
- `Dockerfile`
- `docker-compose.yml`
- `package.json` / `package-lock.json`
- `frontend/package.json` / `frontend/package-lock.json`
- `frontend/vite.config.js`
- `frontend/tailwind.config.js`
- `frontend/postcss.config.js`
- `nginx/nginx.conf`
- `nginx/conf.d/` 配置变更

### 仅需代码同步的变更
- `backend/` 目录下的代码文件
- `frontend/src/` 目录下的代码文件
- 其他非构建相关的配置文件

## 故障排查

### 部署失败

1. **检查GitHub Actions日志**
   - 进入 Actions 标签页查看失败的任务
   - 查看详细的错误信息

2. **检查服务器连接**
   ```bash
   ssh -i NUMA.pem ubuntu@ec2-13-250-179-235.ap-southeast-1.compute.amazonaws.com
   ```

3. **手动检查服务状态**
   ```bash
   ssh -i NUMA.pem ubuntu@ec2-13-250-179-235.ap-southeast-1.compute.amazonaws.com
   cd ~/storyweaver
   docker compose ps
   docker compose logs storyweaver-app
   ```

### 健康检查失败

如果健康检查失败，workflow会显示错误。可以：
1. 查看服务器日志：`docker compose logs storyweaver-app`
2. 手动检查健康端点：`curl http://localhost/health`
3. 检查防火墙和安全组设置

## 回滚

如果部署失败，可以：

1. **使用Git回滚代码**
   ```bash
   git revert HEAD
   git push origin main
   ```

2. **手动在服务器上回滚**
   ```bash
   ssh -i NUMA.pem ubuntu@ec2-13-250-179-235.ap-southeast-1.compute.amazonaws.com
   cd ~/storyweaver
   git checkout <previous-commit>
   docker compose restart storyweaver-app
   ```

## 注意事项

1. **环境变量**：`.env` 文件不会被同步，确保服务器上的 `.env` 配置正确
2. **数据库**：部署不会影响数据库，数据会保留
3. **服务中断**：部署过程中服务会短暂中断（通常几秒钟）
4. **首次部署**：首次部署建议使用 `scripts/deploy-aws.sh` 脚本进行完整部署

## 测试CI/CD

测试CI/CD流程：

1. 修改一个代码文件（如 `backend/server.js`）
2. 提交并推送到main分支：
   ```bash
   git add .
   git commit -m "test: CI/CD deployment"
   git push origin main
   ```
3. 在GitHub Actions页面查看部署进度
4. 部署完成后访问 `http://13.250.179.235` 验证更新

