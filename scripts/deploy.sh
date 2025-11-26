#!/bin/bash#!/bin/bash



# StoryWeaver 一键部署脚本# StoryWeaver 部署脚本

# 用法: ./scripts/deploy.sh [command]# 用于在服务器上部署和更新应用

# 命令: start | stop | restart | logs | status | build | clean

set -e

set -e

# 配置

# 颜色定义IMAGE_NAME="${DOCKER_USERNAME:-yourusername}/storyweaver"

RED='\033[0;31m'IMAGE_TAG="${IMAGE_TAG:-latest}"

GREEN='\033[0;32m'COMPOSE_FILE="docker-compose.yml"

YELLOW='\033[1;33m'BACKUP_DIR="./backups"

BLUE='\033[0;34m'HEALTH_CHECK_URL="http://localhost:3001/health"

NC='\033[0m' # No ColorMAX_RETRIES=5

RETRY_DELAY=10

# 日志函数

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }# 颜色输出

log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }RED='\033[0;31m'

log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }GREEN='\033[0;32m'

log_error() { echo -e "${RED}[ERROR]${NC} $1"; }YELLOW='\033[1;33m'

NC='\033[0m' # No Color

# 检查 Docker 环境

check_docker() {# 日志函数

    if ! command -v docker &> /dev/null; thenlog_info() {

        log_error "Docker 未安装，请先安装 Docker"    echo -e "${GREEN}[INFO]${NC} $1"

        exit 1}

    fi

    log_warn() {

    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then    echo -e "${YELLOW}[WARN]${NC} $1"

        log_error "Docker Compose 未安装，请先安装 Docker Compose"}

        exit 1

    filog_error() {

}    echo -e "${RED}[ERROR]${NC} $1"

}

# 检查环境变量文件

check_env() {# 检查命令是否存在

    if [ ! -f ".env" ]; thencheck_command() {

        log_warn ".env 文件不存在"    if ! command -v $1 &> /dev/null; then

        if [ -f ".env.example" ]; then        log_error "$1 未安装，请先安装"

            log_info "从 .env.example 创建 .env 文件..."        exit 1

            cp .env.example .env    fi

            log_warn "请编辑 .env 文件配置必要的环境变量（如 API Key）"}

        else

            log_error "未找到 .env.example 模板文件"# 健康检查

            exit 1health_check() {

        fi    local retries=0

    fi    log_info "执行健康检查..."

}    

    while [ $retries -lt $MAX_RETRIES ]; do

# 构建镜像        if curl -f -s $HEALTH_CHECK_URL > /dev/null 2>&1; then

build() {            log_info "健康检查通过"

    log_info "开始构建 Docker 镜像..."            return 0

    docker-compose build --no-cache        fi

    log_success "镜像构建完成"        

}        retries=$((retries + 1))

        if [ $retries -lt $MAX_RETRIES ]; then

# 启动服务            log_warn "健康检查失败，${RETRY_DELAY}秒后重试 (${retries}/${MAX_RETRIES})..."

start() {            sleep $RETRY_DELAY

    check_docker        fi

    check_env    done

        

    log_info "启动 StoryWeaver 服务..."    log_error "健康检查失败，已达到最大重试次数"

        return 1

    # 先启动静态文件初始化容器}

    docker-compose up -d static-init

    sleep 3# 备份数据库

    backup_database() {

    # 启动后端和 Nginx    log_info "备份数据库..."

    docker-compose up -d storyweaver-app nginx    mkdir -p $BACKUP_DIR

        

    log_success "服务启动完成"    local backup_file="$BACKUP_DIR/storyweaver_$(date +%Y%m%d_%H%M%S).db"

    log_info "等待服务就绪..."    

    sleep 5    if docker-compose exec -T storyweaver-app cp /app/data/storyweaver.db $backup_file 2>/dev/null || \

           docker cp $(docker-compose ps -q storyweaver-app):/app/data/storyweaver.db $backup_file 2>/dev/null; then

    # 健康检查        log_info "数据库备份成功: $backup_file"

    if curl -s http://localhost/health > /dev/null 2>&1; then        return 0

        log_success "服务已就绪，访问 http://localhost 开始使用"    else

    else        log_warn "数据库备份失败，继续部署..."

        log_warn "服务可能需要更多时间启动，请稍后检查"        return 1

    fi    fi

}}



# 停止服务# 拉取最新镜像

stop() {pull_image() {

    log_info "停止 StoryWeaver 服务..."    log_info "拉取最新镜像: ${IMAGE_NAME}:${IMAGE_TAG}"

    docker-compose down    docker pull ${IMAGE_NAME}:${IMAGE_TAG} || {

    log_success "服务已停止"        log_error "拉取镜像失败"

}        exit 1

    }

# 重启服务}

restart() {

    log_info "重启 StoryWeaver 服务..."# 停止旧容器

    docker-compose restartstop_containers() {

    log_success "服务已重启"    log_info "停止旧容器..."

}    docker-compose -f $COMPOSE_FILE down || true

}

# 查看日志

logs() {# 启动新容器

    local service=${1:-""}start_containers() {

    if [ -n "$service" ]; then    log_info "启动新容器..."

        docker-compose logs -f "$service"    

    else    # 更新镜像标签

        docker-compose logs -f    export IMAGE_TAG=$IMAGE_TAG

    fi    

}    docker-compose -f $COMPOSE_FILE up -d || {

        log_error "启动容器失败"

# 查看状态        exit 1

status() {    }

    log_info "服务状态:"    

    docker-compose ps    log_info "等待容器启动..."

        sleep 10

    echo ""}

    log_info "健康检查:"

    if curl -s http://localhost/health > /dev/null 2>&1; then# 回滚

        log_success "服务运行正常"rollback() {

        curl -s http://localhost/health | python3 -m json.tool 2>/dev/null || curl -s http://localhost/health    log_error "部署失败，开始回滚..."

    else    

        log_error "服务不可用"    # 停止当前容器

    fi    docker-compose -f $COMPOSE_FILE down

}    

    # 如果有备份，恢复备份

# 清理资源    local latest_backup=$(ls -t $BACKUP_DIR/*.db 2>/dev/null | head -1)

clean() {    if [ -n "$latest_backup" ]; then

    log_warn "这将删除所有容器、镜像和数据卷！"        log_info "恢复数据库备份: $latest_backup"

    read -p "确认继续? (y/N): " confirm        # 这里可以添加恢复逻辑

    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then    fi

        log_info "清理 Docker 资源..."    

        docker-compose down -v --rmi all    log_error "回滚完成"

        log_success "清理完成"    exit 1

    else}

        log_info "操作已取消"

    fi# 主部署流程

}main() {

    log_info "开始部署 StoryWeaver..."

# 备份数据    

backup() {    # 检查必要命令

    local backup_dir="./backup"    check_command docker

    local backup_file="storyweaver-$(date +%Y%m%d-%H%M%S).db"    check_command docker-compose

        check_command curl

    mkdir -p "$backup_dir"    

        # 备份数据库

    log_info "备份数据库..."    backup_database || true

    docker cp storyweaver-app:/app/data/storyweaver.db "$backup_dir/$backup_file"    

        # 拉取最新镜像

    if [ -f "$backup_dir/$backup_file" ]; then    pull_image

        log_success "备份成功: $backup_dir/$backup_file"    

    else    # 停止旧容器

        log_error "备份失败"    stop_containers

    fi    

}    # 启动新容器

    start_containers

# 显示帮助    

show_help() {    # 健康检查

    echo "StoryWeaver 部署脚本"    if health_check; then

    echo ""        log_info "部署成功！"

    echo "用法: $0 [命令]"        log_info "应用运行在: http://localhost"

    echo ""        exit 0

    echo "命令:"    else

    echo "  start     启动所有服务"        rollback

    echo "  stop      停止所有服务"    fi

    echo "  restart   重启所有服务"}

    echo "  build     重新构建镜像"

    echo "  logs      查看日志 (可选: logs [服务名])"# 执行主流程

    echo "  status    查看服务状态"main "$@"

    echo "  backup    备份数据库"

    echo "  clean     清理所有资源（危险操作）"
    echo "  help      显示此帮助信息"
    echo ""
    echo "示例:"
    echo "  $0 start          # 启动服务"
    echo "  $0 logs           # 查看所有日志"
    echo "  $0 logs storyweaver-app  # 查看后端日志"
}

# 主函数
main() {
    cd "$(dirname "$0")/.."
    
    case "${1:-help}" in
        start)
            start
            ;;
        stop)
            stop
            ;;
        restart)
            restart
            ;;
        build)
            build
            ;;
        logs)
            logs "$2"
            ;;
        status)
            status
            ;;
        backup)
            backup
            ;;
        clean)
            clean
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            log_error "未知命令: $1"
            show_help
            exit 1
            ;;
    esac
}

main "$@"
