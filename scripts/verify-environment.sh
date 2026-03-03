#!/bin/bash

##############################################################################
# ClawTeam Platform - 环境验证脚本
#
# 用途：验证开发环境是否正确配置
# 使用方法：
#   bash scripts/verify-environment.sh
##############################################################################

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

check_pass() {
    echo -e "  ${GREEN}✓${NC} $1"
    PASS_COUNT=$((PASS_COUNT + 1))
}

check_fail() {
    echo -e "  ${RED}✗${NC} $1"
    FAIL_COUNT=$((FAIL_COUNT + 1))
}

check_warn() {
    echo -e "  ${YELLOW}⚠${NC} $1"
    WARN_COUNT=$((WARN_COUNT + 1))
}

section_header() {
    echo ""
    echo -e "${CYAN}▶ $1${NC}"
}

separator() {
    echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
}

##############################################################################
# 1. 系统依赖检查
##############################################################################

section_header "系统依赖"

if command -v docker &> /dev/null; then
    check_pass "Docker: $(docker --version)"
else
    check_fail "Docker: 未安装"
fi

if command -v docker-compose &> /dev/null; then
    check_pass "Docker Compose: $(docker-compose --version)"
else
    check_fail "Docker Compose: 未安装"
fi

if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version | grep -oP 'v\d+' | grep -oP '\d+')
    if [ "$NODE_VERSION" -ge 18 ]; then
        check_pass "Node.js: $(node --version) (>= 18 ✓)"
    else
        check_warn "Node.js: $(node --version) (推荐 >= 18)"
    fi
else
    check_fail "Node.js: 未安装"
fi

if command -v npm &> /dev/null; then
    check_pass "npm: $(npm --version)"
else
    check_fail "npm: 未安装"
fi

if command -v psql &> /dev/null; then
    check_pass "psql: $(psql --version | head -n1) (可选)"
else
    check_warn "psql: 未安装（可选工具）"
fi

if command -v redis-cli &> /dev/null; then
    check_pass "redis-cli: $(redis-cli --version) (可选)"
else
    check_warn "redis-cli: 未安装（可选工具）"
fi

if command -v k6 &> /dev/null; then
    check_pass "k6: $(k6 version --quiet) (性能测试工具)"
else
    check_warn "k6: 未安装（Phase 3 性能测试需要）"
fi

##############################################################################
# 2. 项目文件检查
##############################################################################

section_header "项目文件"

if [ -f "package.json" ]; then
    check_pass "package.json: 存在"
else
    check_fail "package.json: 不存在（请确保在项目根目录运行）"
fi

if [ -d "node_modules" ]; then
    check_pass "node_modules: 已安装"
else
    check_warn "node_modules: 未安装（运行 npm install）"
fi

if [ -f ".env" ]; then
    check_pass ".env: 存在"
else
    check_warn ".env: 不存在（运行 setup-dev-environment.sh 创建）"
fi

if [ -f "DATABASE_SCHEMA.sql" ]; then
    check_pass "DATABASE_SCHEMA.sql: 存在"
else
    check_fail "DATABASE_SCHEMA.sql: 不存在"
fi

if [ -f "docker-compose.yml" ]; then
    check_pass "docker-compose.yml: 存在"
else
    check_fail "docker-compose.yml: 不存在"
fi

##############################################################################
# 3. Docker 服务检查
##############################################################################

section_header "Docker 服务"

# 检查 Docker daemon 是否运行
if docker info &> /dev/null; then
    check_pass "Docker daemon: 运行中"
else
    check_fail "Docker daemon: 未运行（请启动 Docker Desktop）"
    echo ""
    separator
    echo -e "${RED}Docker daemon 未运行，无法继续检查服务状态${NC}"
    separator
    echo ""
    echo "总计: ${GREEN}$PASS_COUNT 通过${NC} | ${YELLOW}$WARN_COUNT 警告${NC} | ${RED}$FAIL_COUNT 失败${NC}"
    exit 1
fi

# 检查 PostgreSQL 容器
if docker-compose ps postgres 2>/dev/null | grep -q "Up"; then
    POSTGRES_HEALTH=$(docker-compose ps -q postgres | xargs docker inspect -f '{{.State.Health.Status}}' 2>/dev/null || echo "none")
    if [ "$POSTGRES_HEALTH" = "healthy" ]; then
        check_pass "PostgreSQL: 运行中 (healthy)"
    elif [ "$POSTGRES_HEALTH" = "none" ]; then
        check_warn "PostgreSQL: 运行中 (无健康检查)"
    else
        check_warn "PostgreSQL: 运行中 ($POSTGRES_HEALTH)"
    fi
else
    check_fail "PostgreSQL: 未运行（运行 docker-compose up -d）"
fi

# 检查 Redis 容器
if docker-compose ps redis 2>/dev/null | grep -q "Up"; then
    REDIS_HEALTH=$(docker-compose ps -q redis | xargs docker inspect -f '{{.State.Health.Status}}' 2>/dev/null || echo "none")
    if [ "$REDIS_HEALTH" = "healthy" ]; then
        check_pass "Redis: 运行中 (healthy)"
    elif [ "$REDIS_HEALTH" = "none" ]; then
        check_warn "Redis: 运行中 (无健康检查)"
    else
        check_warn "Redis: 运行中 ($REDIS_HEALTH)"
    fi
else
    check_fail "Redis: 未运行（运行 docker-compose up -d）"
fi

##############################################################################
# 4. 数据库连接和结构检查
##############################################################################

section_header "数据库状态"

# 检查 PostgreSQL 连接
if docker-compose exec -T postgres psql -U postgres -d clawteam -c "SELECT 1" &> /dev/null; then
    check_pass "PostgreSQL 连接: 成功"

    # 检查表数量
    TABLE_COUNT=$(docker-compose exec -T postgres psql -U postgres -d clawteam -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';" 2>/dev/null | tr -d ' ')
    if [ "$TABLE_COUNT" -eq 9 ]; then
        check_pass "数据库表: $TABLE_COUNT / 9 ✓"
    else
        check_warn "数据库表: $TABLE_COUNT / 9 (预期 9 张表)"
    fi

    # 检查 pg_trgm 扩展
    if docker-compose exec -T postgres psql -U postgres -d clawteam -t -c "SELECT COUNT(*) FROM pg_extension WHERE extname = 'pg_trgm';" 2>/dev/null | grep -q "1"; then
        check_pass "pg_trgm 扩展: 已安装"
    else
        check_fail "pg_trgm 扩展: 未安装（运行 DATABASE_SCHEMA.sql）"
    fi

    # 检查初始数据
    TEAM_COUNT=$(docker-compose exec -T postgres psql -U postgres -d clawteam -t -c "SELECT COUNT(*) FROM teams;" 2>/dev/null | tr -d ' ')
    if [ "$TEAM_COUNT" -ge 1 ]; then
        check_pass "初始数据: $TEAM_COUNT 个团队"
    else
        check_warn "初始数据: 未找到测试团队"
    fi

    # 检查各表行数
    BOT_COUNT=$(docker-compose exec -T postgres psql -U postgres -d clawteam -t -c "SELECT COUNT(*) FROM bots;" 2>/dev/null | tr -d ' ')
    TASK_COUNT=$(docker-compose exec -T postgres psql -U postgres -d clawteam -t -c "SELECT COUNT(*) FROM tasks;" 2>/dev/null | tr -d ' ')

    if [ "$BOT_COUNT" -eq 0 ] && [ "$TASK_COUNT" -eq 0 ]; then
        check_pass "数据库状态: 干净（Bots: $BOT_COUNT, Tasks: $TASK_COUNT）"
    else
        check_warn "数据库状态: 有数据（Bots: $BOT_COUNT, Tasks: $TASK_COUNT）"
    fi

else
    check_fail "PostgreSQL 连接: 失败"
fi

##############################################################################
# 5. Redis 连接检查
##############################################################################

section_header "Redis 状态"

if docker-compose exec -T redis redis-cli ping 2>/dev/null | grep -q "PONG"; then
    check_pass "Redis 连接: 成功"

    # 检查 Redis 版本
    REDIS_VERSION=$(docker-compose exec -T redis redis-cli info server 2>/dev/null | grep "redis_version" | cut -d: -f2 | tr -d '\r\n')
    check_pass "Redis 版本: $REDIS_VERSION"

    # 检查 Redis 数据库大小
    REDIS_KEYS=$(docker-compose exec -T redis redis-cli dbsize 2>/dev/null | tr -d '\r\n')
    if [ "$REDIS_KEYS" = "0" ]; then
        check_pass "Redis 数据: 0 keys (干净状态)"
    else
        check_warn "Redis 数据: $REDIS_KEYS keys (有缓存数据)"
    fi

else
    check_fail "Redis 连接: 失败"
fi

##############################################################################
# 6. 端口占用检查
##############################################################################

section_header "端口状态"

check_port() {
    local PORT=$1
    local SERVICE=$2

    if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        check_pass "端口 $PORT ($SERVICE): 监听中"
    elif nc -z localhost $PORT 2>/dev/null; then
        check_pass "端口 $PORT ($SERVICE): 监听中"
    else
        check_warn "端口 $PORT ($SERVICE): 未监听"
    fi
}

check_port 5432 "PostgreSQL"
check_port 6379 "Redis"
check_port 3000 "API Server"

##############################################################################
# 7. 环境变量检查
##############################################################################

section_header "环境变量"

if [ -f ".env" ]; then
    source .env

    if [ -n "$DATABASE_URL" ]; then
        check_pass "DATABASE_URL: 已配置"
    else
        check_fail "DATABASE_URL: 未配置"
    fi

    if [ -n "$REDIS_URL" ]; then
        check_pass "REDIS_URL: 已配置"
    else
        check_fail "REDIS_URL: 未配置"
    fi

    if [ "$USE_MOCK" = "false" ]; then
        check_pass "USE_MOCK: false (使用真实依赖)"
    else
        check_warn "USE_MOCK: $USE_MOCK (可能使用 Mock 依赖)"
    fi

    if [ "$NODE_ENV" = "development" ] || [ "$NODE_ENV" = "test" ]; then
        check_pass "NODE_ENV: $NODE_ENV"
    else
        check_warn "NODE_ENV: ${NODE_ENV:-未设置}"
    fi
else
    check_fail ".env 文件: 不存在"
fi

##############################################################################
# 总结
##############################################################################

echo ""
separator

if [ $FAIL_COUNT -eq 0 ]; then
    echo -e "${GREEN}✅ 环境验证通过！${NC}"
    echo ""
    echo "总计: ${GREEN}$PASS_COUNT 通过${NC} | ${YELLOW}$WARN_COUNT 警告${NC} | ${RED}$FAIL_COUNT 失败${NC}"
else
    echo -e "${RED}❌ 环境验证失败${NC}"
    echo ""
    echo "总计: ${GREEN}$PASS_COUNT 通过${NC} | ${YELLOW}$WARN_COUNT 警告${NC} | ${RED}$FAIL_COUNT 失败${NC}"
    echo ""
    echo -e "${YELLOW}建议操作:${NC}"
    echo "  1. 运行 bash scripts/setup-dev-environment.sh 初始化环境"
    echo "  2. 确保 Docker Desktop 正在运行"
    echo "  3. 运行 docker-compose up -d 启动服务"
fi

separator
echo ""

# 退出码
if [ $FAIL_COUNT -eq 0 ]; then
    exit 0
else
    exit 1
fi
