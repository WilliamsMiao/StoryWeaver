#!/bin/bash

# StoryWeaver 健康检查脚本
# 用于监控应用健康状态

set -e

# 配置
HEALTH_CHECK_URL="${HEALTH_CHECK_URL:-http://localhost:3001/health}"
MAX_RETRIES=3
RETRY_DELAY=5
EXIT_CODE=0

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 健康检查
check_health() {
    local retries=0
    
    while [ $retries -lt $MAX_RETRIES ]; do
        if response=$(curl -f -s $HEALTH_CHECK_URL 2>&1); then
            # 解析响应
            local status=$(echo $response | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
            
            if [ "$status" = "ok" ]; then
                log_info "健康检查通过"
                echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
                return 0
            else
                log_warn "健康检查返回状态: $status"
            fi
        else
            log_warn "健康检查失败 (尝试 $((retries + 1))/$MAX_RETRIES)"
        fi
        
        retries=$((retries + 1))
        if [ $retries -lt $MAX_RETRIES ]; then
            sleep $RETRY_DELAY
        fi
    done
    
    log_error "健康检查失败，已达到最大重试次数"
    return 1
}

# 检查容器状态
check_containers() {
    log_info "检查容器状态..."
    
    if command -v docker-compose &> /dev/null; then
        local containers=$(docker-compose ps -q 2>/dev/null || echo "")
        if [ -z "$containers" ]; then
            log_warn "未找到运行中的容器"
            return 1
        fi
        
        for container in $containers; do
            local status=$(docker inspect -f '{{.State.Status}}' $container 2>/dev/null)
            if [ "$status" != "running" ]; then
                log_error "容器 $container 状态异常: $status"
                EXIT_CODE=1
            else
                log_info "容器 $container 运行正常"
            fi
        done
    fi
}

# 主函数
main() {
    log_info "开始健康检查..."
    log_info "检查URL: $HEALTH_CHECK_URL"
    
    # 检查容器
    check_containers
    
    # 健康检查
    if check_health; then
        log_info "所有检查通过"
        exit 0
    else
        log_error "健康检查失败"
        exit 1
    fi
}

# 执行
main "$@"

