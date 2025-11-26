#!/bin/bash

# 设置静态文件到 Docker 卷
# 在首次部署或更新前端后运行此脚本

set -e

VOLUME_NAME="storyweaver_static"
TEMP_CONTAINER="storyweaver-static-setup-$$"

# 检查前端构建产物
if [ ! -d "frontend/dist" ]; then
    echo "错误: frontend/dist 目录不存在"
    echo "请先构建前端: cd frontend && npm run build"
    exit 1
fi

echo "设置静态文件到 Docker 卷..."

# 创建临时容器并挂载卷
docker run --rm \
    --name $TEMP_CONTAINER \
    -v $VOLUME_NAME:/data \
    alpine sh -c "
        echo '清空卷内容...'
        rm -rf /data/*
        echo '复制静态文件...'
        # 这里我们需要从主机复制，所以使用不同的方法
    " || true

# 使用 docker cp 复制文件
echo "创建临时容器..."
docker create --name $TEMP_CONTAINER -v $VOLUME_NAME:/data alpine /bin/sh

echo "复制文件..."
docker cp frontend/dist/. $TEMP_CONTAINER:/data/

echo "清理临时容器..."
docker rm $TEMP_CONTAINER

echo "静态文件设置完成！"
echo "现在可以启动 Nginx 容器：docker-compose up -d nginx"

