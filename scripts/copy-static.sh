#!/bin/bash

# 复制前端构建产物到 Nginx 静态文件卷
# 在构建后执行此脚本，将静态文件复制到 Docker 卷

set -e

VOLUME_NAME="storyweaver_static"
CONTAINER_NAME="storyweaver-nginx-temp"

# 检查前端构建产物是否存在
if [ ! -d "frontend/dist" ]; then
    echo "错误: frontend/dist 目录不存在，请先构建前端"
    exit 1
fi

echo "复制静态文件到 Docker 卷..."

# 创建临时容器来访问卷
docker run --rm -d \
    --name $CONTAINER_NAME \
    -v $VOLUME_NAME:/data \
    alpine tail -f /dev/null

# 等待容器启动
sleep 2

# 清空卷内容
docker exec $CONTAINER_NAME sh -c "rm -rf /data/*"

# 复制文件
docker cp frontend/dist/. $CONTAINER_NAME:/data/

# 停止临时容器
docker stop $CONTAINER_NAME

echo "静态文件复制完成！"

