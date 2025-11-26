#!/bin/bash

# StoryWeaver 数据库备份脚本
# 定期备份数据库文件

set -e

# 配置
BACKUP_DIR="./backups"
CONTAINER_NAME="storyweaver-app"
DB_PATH="/app/data/storyweaver.db"
RETENTION_DAYS=7

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# 创建备份目录
mkdir -p $BACKUP_DIR

# 生成备份文件名
BACKUP_FILE="$BACKUP_DIR/storyweaver_$(date +%Y%m%d_%H%M%S).db"

log_info "开始备份数据库..."

# 检查容器是否运行
if ! docker ps | grep -q $CONTAINER_NAME; then
    log_warn "容器未运行，尝试从数据卷备份..."
    
    # 如果使用数据卷，尝试从卷备份
    if [ -f "./data/storyweaver.db" ]; then
        cp ./data/storyweaver.db $BACKUP_FILE
        log_info "备份成功: $BACKUP_FILE"
    else
        echo "错误: 无法找到数据库文件"
        exit 1
    fi
else
    # 从运行中的容器备份
    docker cp ${CONTAINER_NAME}:${DB_PATH} $BACKUP_FILE || {
        echo "错误: 备份失败"
        exit 1
    }
    log_info "备份成功: $BACKUP_FILE"
fi

# 压缩备份文件
if command -v gzip &> /dev/null; then
    log_info "压缩备份文件..."
    gzip $BACKUP_FILE
    BACKUP_FILE="${BACKUP_FILE}.gz"
    log_info "压缩完成: $BACKUP_FILE"
fi

# 清理旧备份
log_info "清理 ${RETENTION_DAYS} 天前的备份..."
find $BACKUP_DIR -name "storyweaver_*.db*" -type f -mtime +${RETENTION_DAYS} -delete

log_info "备份完成！"
log_info "备份文件: $BACKUP_FILE"
log_info "备份目录: $BACKUP_DIR"

