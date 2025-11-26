#!/bin/bash

# StoryWeaver AWS 部署脚本
# 用法: ./scripts/deploy-aws.sh <服务器IP或域名> [用户名]

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 检查参数
if [ -z "$1" ]; then
    log_error "请提供AWS服务器IP地址或域名"
    echo "用法: $0 <服务器IP或域名> [用户名]"
    echo "示例: $0 ec2-xx-xx-xx-xx.compute-1.amazonaws.com ubuntu"
    exit 1
fi

SERVER_HOST="$1"
SERVER_USER="${2:-ubuntu}"  # 默认使用ubuntu用户
SSH_KEY="NUMA.pem"
PROJECT_DIR="StoryWeaver"
REMOTE_DIR="~/storyweaver"

# 检查密钥文件
if [ ! -f "$SSH_KEY" ]; then
    log_error "找不到SSH密钥文件: $SSH_KEY"
    exit 1
fi

# 设置密钥文件权限
chmod 400 "$SSH_KEY"

log_info "开始部署到AWS服务器: $SERVER_USER@$SERVER_HOST"
log_info "使用密钥文件: $SSH_KEY"

# SSH连接函数
ssh_cmd() {
    ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "$SERVER_USER@$SERVER_HOST" "$@"
}

# SCP上传函数
scp_cmd() {
    scp -i "$SSH_KEY" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -r "$@" "$SERVER_USER@$SERVER_HOST:$REMOTE_DIR/"
}

# 检查服务器连接
log_info "检查服务器连接..."
if ! ssh_cmd "echo '连接成功'" > /dev/null 2>&1; then
    log_error "无法连接到服务器，请检查："
    log_error "1. 服务器IP地址是否正确"
    log_error "2. 安全组是否允许SSH连接（端口22）"
    log_error "3. 密钥文件权限是否正确（应为400）"
    exit 1
fi
log_success "服务器连接成功"

# 检查并安装Docker
log_info "检查Docker安装..."
if ! ssh_cmd "command -v docker" > /dev/null 2>&1; then
    log_warn "Docker未安装，开始安装..."
    ssh_cmd "curl -fsSL https://get.docker.com -o get-docker.sh && sudo sh get-docker.sh"
    ssh_cmd "sudo usermod -aG docker $SERVER_USER"
    log_success "Docker安装完成"
else
    log_success "Docker已安装"
fi

# 检查并安装Docker Compose
log_info "检查Docker Compose安装..."
if ! ssh_cmd "command -v docker-compose" > /dev/null 2>&1 && ! ssh_cmd "docker compose version" > /dev/null 2>&1; then
    log_warn "Docker Compose未安装，开始安装..."
    ssh_cmd "sudo curl -L \"https://github.com/docker/compose/releases/latest/download/docker-compose-\$(uname -s)-\$(uname -m)\" -o /usr/local/bin/docker-compose"
    ssh_cmd "sudo chmod +x /usr/local/bin/docker-compose"
    log_success "Docker Compose安装完成"
else
    log_success "Docker Compose已安装"
fi

# 创建远程目录
log_info "创建远程目录..."
ssh_cmd "mkdir -p $REMOTE_DIR"
log_success "远程目录创建完成"

# 上传项目文件
log_info "上传项目文件..."
# 排除不需要的文件
rsync -avz --progress \
    -e "ssh -i $SSH_KEY -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null" \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude 'data/*.db*' \
    --exclude 'frontend/node_modules' \
    --exclude 'frontend/dist' \
    --exclude '.env' \
    --exclude 'NUMA.pem' \
    --exclude '*.log' \
    ./ "$SERVER_USER@$SERVER_HOST:$REMOTE_DIR/"

log_success "项目文件上传完成"

# 检查环境变量文件
log_info "检查环境变量配置..."
if ssh_cmd "[ ! -f $REMOTE_DIR/.env ]" > /dev/null 2>&1; then
    log_warn ".env文件不存在，创建默认配置..."
    ssh_cmd "cat > $REMOTE_DIR/.env << 'EOF'
# AI服务配置（必填）
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=your_deepseek_api_key_here

# 服务器配置
NODE_ENV=production
PORT=3000
CORS_ORIGIN=*

# 数据库配置
DB_PATH=/app/data/storyweaver.db

# 日志配置
LOG_LEVEL=info
EOF"
    log_warn "请编辑 $REMOTE_DIR/.env 文件，配置AI API密钥"
    log_warn "可以使用以下命令编辑: ssh -i $SSH_KEY $SERVER_USER@$SERVER_HOST 'nano $REMOTE_DIR/.env'"
    read -p "是否现在配置API密钥? (y/N): " configure_now
    if [ "$configure_now" = "y" ] || [ "$configure_now" = "Y" ]; then
        read -p "请输入AI提供商 (deepseek/openai/qwen/local) [默认: deepseek]: " ai_provider
        ai_provider=${ai_provider:-deepseek}
        read -p "请输入API密钥: " api_key
        if [ -n "$api_key" ]; then
            if [ "$ai_provider" = "deepseek" ]; then
                ssh_cmd "sed -i 's/DEEPSEEK_API_KEY=.*/DEEPSEEK_API_KEY=$api_key/' $REMOTE_DIR/.env"
            elif [ "$ai_provider" = "openai" ]; then
                ssh_cmd "sed -i 's/AI_PROVIDER=.*/AI_PROVIDER=openai/' $REMOTE_DIR/.env"
                ssh_cmd "echo 'OPENAI_API_KEY=$api_key' >> $REMOTE_DIR/.env"
            elif [ "$ai_provider" = "qwen" ]; then
                ssh_cmd "sed -i 's/AI_PROVIDER=.*/AI_PROVIDER=qwen/' $REMOTE_DIR/.env"
                ssh_cmd "echo 'QWEN_API_KEY=$api_key' >> $REMOTE_DIR/.env"
            fi
            ssh_cmd "sed -i 's/AI_PROVIDER=.*/AI_PROVIDER=$ai_provider/' $REMOTE_DIR/.env"
            log_success "API密钥配置完成"
        fi
    fi
else
    log_success ".env文件已存在"
fi

# 配置防火墙
log_info "配置防火墙..."
ssh_cmd "sudo ufw allow 80/tcp" 2>/dev/null || true
ssh_cmd "sudo ufw allow 443/tcp" 2>/dev/null || true
ssh_cmd "sudo ufw allow 22/tcp" 2>/dev/null || true
log_success "防火墙配置完成"

# 构建和启动服务
log_info "构建Docker镜像..."
ssh_cmd "cd $REMOTE_DIR && docker-compose build --no-cache" || {
    log_error "Docker镜像构建失败"
    exit 1
}

log_info "启动服务..."
ssh_cmd "cd $REMOTE_DIR && docker-compose down" 2>/dev/null || true
ssh_cmd "cd $REMOTE_DIR && docker-compose up -d" || {
    log_error "服务启动失败"
    exit 1
}

log_success "服务启动完成"

# 等待服务就绪
log_info "等待服务就绪..."
sleep 10

# 健康检查
log_info "执行健康检查..."
max_retries=10
retry_count=0
while [ $retry_count -lt $max_retries ]; do
    if ssh_cmd "curl -f -s http://localhost/health > /dev/null 2>&1"; then
        log_success "健康检查通过"
        break
    fi
    retry_count=$((retry_count + 1))
    if [ $retry_count -lt $max_retries ]; then
        log_warn "健康检查失败，${retry_count}/${max_retries}，等待重试..."
        sleep 5
    else
        log_error "健康检查失败，请检查服务日志"
        ssh_cmd "cd $REMOTE_DIR && docker-compose logs --tail=50"
        exit 1
    fi
done

# 获取服务器公网IP（如果提供的是域名，则使用域名）
if [[ "$SERVER_HOST" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    SERVER_IP="$SERVER_HOST"
else
    SERVER_IP=$(ssh_cmd "curl -s ifconfig.me || curl -s ipinfo.io/ip || hostname -I | awk '{print \$1}'")
fi

log_success "=========================================="
log_success "部署完成！"
log_success "=========================================="
log_info "访问地址: http://$SERVER_IP"
log_info "健康检查: http://$SERVER_IP/health"
log_info ""
log_info "查看日志: ssh -i $SSH_KEY $SERVER_USER@$SERVER_HOST 'cd $REMOTE_DIR && docker-compose logs -f'"
log_info "查看状态: ssh -i $SSH_KEY $SERVER_USER@$SERVER_HOST 'cd $REMOTE_DIR && docker-compose ps'"
log_info "停止服务: ssh -i $SSH_KEY $SERVER_USER@$SERVER_HOST 'cd $REMOTE_DIR && docker-compose down'"
log_success "=========================================="

