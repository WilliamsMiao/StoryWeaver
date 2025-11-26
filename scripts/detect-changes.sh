#!/bin/bash

# 变更检测脚本
# 用于判断代码变更是否需要Docker构建还是只需代码同步
# 用法: ./scripts/detect-changes.sh [base_commit] [head_commit]
# 默认比较 HEAD 和 HEAD~1

set -e

BASE_COMMIT="${1:-HEAD~1}"
HEAD_COMMIT="${2:-HEAD}"

# 需要Docker构建的文件模式
DOCKER_BUILD_PATTERNS=(
    "Dockerfile"
    "docker-compose.yml"
    "package.json"
    "package-lock.json"
    "frontend/package.json"
    "frontend/package-lock.json"
    "frontend/vite.config.js"
    "frontend/tailwind.config.js"
    "frontend/postcss.config.js"
    "backend/package.json"
    "nginx/nginx.conf"
    "nginx/conf.d/"
)

# 仅需代码同步的文件模式（如果只变更这些，不需要Docker构建）
CODE_SYNC_PATTERNS=(
    "backend/"
    "frontend/src/"
    "nginx/conf.d/"
)

echo "检测代码变更..."
echo "比较范围: $BASE_COMMIT -> $HEAD_COMMIT"

# 获取变更的文件列表
CHANGED_FILES=$(git diff --name-only $BASE_COMMIT $HEAD_COMMIT 2>/dev/null || echo "")

if [ -z "$CHANGED_FILES" ]; then
    echo "没有检测到文件变更"
    echo "DEPLOY_TYPE=skip"
    exit 0
fi

echo "变更的文件:"
echo "$CHANGED_FILES" | while read -r file; do
    echo "  - $file"
done

# 检查是否需要Docker构建
NEEDS_DOCKER_BUILD=false

for pattern in "${DOCKER_BUILD_PATTERNS[@]}"; do
    if echo "$CHANGED_FILES" | grep -q "^$pattern\|^.*/$pattern"; then
        echo "检测到需要Docker构建的变更: $pattern"
        NEEDS_DOCKER_BUILD=true
        break
    fi
done

# 输出结果
if [ "$NEEDS_DOCKER_BUILD" = true ]; then
    echo "DEPLOY_TYPE=docker"
    echo "需要Docker构建和部署"
else
    echo "DEPLOY_TYPE=rsync"
    echo "仅需代码同步部署"
fi

# 输出变更文件列表（供后续使用）
echo "CHANGED_FILES<<EOF" >> $GITHUB_OUTPUT 2>/dev/null || true
echo "$CHANGED_FILES" >> $GITHUB_OUTPUT 2>/dev/null || true
echo "EOF" >> $GITHUB_OUTPUT 2>/dev/null || true

exit 0


