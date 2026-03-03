#!/bin/bash

##############################################################################
# ClawTeam Platform - 快速启动脚本
#
# 用途：一键启动所有服务并运行基本验证
# 使用方法：
#   bash scripts/quick-start.sh
##############################################################################

set -e

# 颜色输出
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

separator() {
    echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
}

##############################################################################
# 主流程
##############################################################################

separator
echo -e "${GREEN}🚀 ClawTeam Platform - 快速启动${NC}"
separator
echo ""

# 1. 检查 Docker
log_info "检查 Docker..."
if ! docker info &> /dev/null; then
    echo ""
    echo -e "${YELLOW}⚠️  Docker daemon 未运行${NC}"
    echo ""
    echo "请先启动 Docker Desktop，然后重新运行此脚本"
    echo ""
    exit 1
fi

log_success "Docker 运行中 ✓"
echo ""

# 2. 启动 Docker Compose
log_info "启动 Docker 服务（PostgreSQL + Redis）..."
docker-compose up -d

echo ""
log_info "等待服务健康检查（最多 30 秒）..."

WAIT_TIME=0
MAX_WAIT=30

while [ $WAIT_TIME -lt $MAX_WAIT ]; do
    POSTGRES_STATUS=$(docker-compose ps -q postgres | xargs docker inspect -f '{{.State.Health.Status}}' 2>/dev/null || echo "starting")
    REDIS_STATUS=$(docker-compose ps -q redis | xargs docker inspect -f '{{.State.Health.Status}}' 2>/dev/null || echo "starting")

    if [ "$POSTGRES_STATUS" = "healthy" ] && [ "$REDIS_STATUS" = "healthy" ]; then
        echo ""
        log_success "所有服务已启动 ✓"
        break
    fi

    echo -n "."
    sleep 2
    WAIT_TIME=$((WAIT_TIME + 2))
done

echo ""

if [ $WAIT_TIME -ge $MAX_WAIT ]; then
    echo ""
    echo -e "${YELLOW}⚠️  服务启动超时${NC}"
    echo ""
    echo "请检查日志: docker-compose logs"
    echo ""
    exit 1
fi

# 3. 验证数据库
log_info "验证数据库..."

TABLE_COUNT=$(docker-compose exec -T postgres psql -U postgres -d clawteam -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';" 2>/dev/null | tr -d ' ' || echo "0")

if [ "$TABLE_COUNT" -eq 9 ]; then
    log_success "数据库 Schema 正常 ✓"
else
    echo ""
    echo -e "${YELLOW}⚠️  数据库未初始化（表数量: $TABLE_COUNT / 9）${NC}"
    echo ""
    echo "运行以下命令初始化数据库:"
    echo "  cat DATABASE_SCHEMA.sql | docker-compose exec -T postgres psql -U postgres -d clawteam"
    echo ""
    echo "或运行完整部署脚本:"
    echo "  bash scripts/setup-dev-environment.sh"
    echo ""
    exit 1
fi

echo ""

# 4. 显示状态
separator
log_success "✅ 服务已启动"
separator

echo ""
echo -e "${GREEN}服务状态${NC}"
docker-compose ps

echo ""
echo -e "${BLUE}快速命令${NC}"
echo ""
echo "  # 运行测试"
echo "  npm test                    # 单元测试（5 秒）"
echo "  npm run test:integration    # 集成测试（5 秒）"
echo ""
echo "  # 启动 API 服务器"
echo "  npm run dev:api             # http://localhost:3000"
echo ""
echo "  # 查看日志"
echo "  docker-compose logs -f postgres"
echo "  docker-compose logs -f redis"
echo ""
echo "  # 连接数据库"
echo "  docker-compose exec postgres psql -U postgres -d clawteam"
echo ""
echo "  # 停止服务"
echo "  docker-compose down"
echo ""

separator
echo ""
