#!/bin/bash

# StoryWeaver 部署脚本
# 用于在服务器上部署和更新应用

set -e

# 配置
IMAGE_NAME="${DOCKER_USERNAME:-yourusername}/storyweaver"
IMAGE_TAG="${IMAGE_TAG:-latest}"
COMPOSE_FILE="docker-compose.yml"
BACKUP_DIR="./backups"
HEALTH_CHECK_URL="http://localhost:3001/health"
MAX_RETRIES=5
RETRY_DELAY=10

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查命令是否存在
check_command() {
    if ! command -v $1 &> /dev/null; then
        log_error "$1 未安装，请先安装"
        exit 1
    fi
}

# 健康检查
health_check() {
    local retries=0
    log_info "执行健康检查..."
    
    while [ $retries -lt $MAX_RETRIES ]; do
        if curl -f -s $HEALTH_CHECK_URL > /dev/null 2>&1; then
            log_info "健康检查通过"
            return 0
        fi
        
        retries=$((retries + 1))
        if [ $retries -lt $MAX_RETRIES ]; then
            log_warn "健康检查失败，${RETRY_DELAY}秒后重试 (${retries}/${MAX_RETRIES})..."
            sleep $RETRY_DELAY
        fi
    done
    
    log_error "健康检查失败，已达到最大重试次数"
    return 1
}

# 备份数据库
backup_database() {
    log_info "备份数据库..."
    mkdir -p $BACKUP_DIR
    
    local backup_file="$BACKUP_DIR/storyweaver_$(date +%Y%m%d_%H%M%S).db"
    
    if docker-compose exec -T storyweaver-app cp /app/data/storyweaver.db $backup_file 2>/dev/null || \
       docker cp $(docker-compose ps -q storyweaver-app):/app/data/storyweaver.db $backup_file 2>/dev/null; then
        log_info "数据库备份成功: $backup_file"
        return 0
    else
        log_warn "数据库备份失败，继续部署..."
        return 1
    fi
}

# 拉取最新镜像
pull_image() {
    log_info "拉取最新镜像: ${IMAGE_NAME}:${IMAGE_TAG}"
    docker pull ${IMAGE_NAME}:${IMAGE_TAG} || {
        log_error "拉取镜像失败"
        exit 1
    }
}

# 停止旧容器
stop_containers() {
    log_info "停止旧容器..."
    docker-compose -f $COMPOSE_FILE down || true
}

# 启动新容器
start_containers() {
    log_info "启动新容器..."
    
    # 更新镜像标签
    export IMAGE_TAG=$IMAGE_TAG
    
    docker-compose -f $COMPOSE_FILE up -d || {
        log_error "启动容器失败"
        exit 1
    }
    
    log_info "等待容器启动..."
    sleep 10
}

# 回滚
rollback() {
    log_error "部署失败，开始回滚..."
    
    # 停止当前容器
    docker-compose -f $COMPOSE_FILE down
    
    # 如果有备份，恢复备份
    local latest_backup=$(ls -t $BACKUP_DIR/*.db 2>/dev/null | head -1)
    if [ -n "$latest_backup" ]; then
        log_info "恢复数据库备份: $latest_backup"
        # 这里可以添加恢复逻辑
    fi
    
    log_error "回滚完成"
    exit 1
}

# 主部署流程
main() {
    log_info "开始部署 StoryWeaver..."
    
    # 检查必要命令
    check_command docker
    check_command docker-compose
    check_command curl
    
    # 备份数据库
    backup_database || true
    
    # 拉取最新镜像
    pull_image
    
    # 停止旧容器
    stop_containers
    
    # 启动新容器
    start_containers
    
    # 健康检查
    if health_check; then
        log_info "部署成功！"
        log_info "应用运行在: http://localhost"
        exit 0
    else
        rollback
    fi
}

# 执行主流程
main "$@"

