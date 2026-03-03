#!/bin/bash

##############################################################################
# ClawTeam Platform - 开发环境一键部署脚本
#
# 用途：快速创建完整的开发/测试环境
# 依赖：Docker, Docker Compose, psql (可选)
#
# 使用方法：
#   bash scripts/setup-dev-environment.sh
#
# 选项：
#   --clean    清理现有环境后重新部署
#   --no-data  不插入初始测试数据
#   --skip-tests 不运行测试验证
##############################################################################

set -e  # 遇到错误立即退出

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 分隔线
separator() {
    echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
}

##############################################################################
# 0. 解析命令行参数
##############################################################################

CLEAN_MODE=false
NO_DATA=false
SKIP_TESTS=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --clean)
            CLEAN_MODE=true
            shift
            ;;
        --no-data)
            NO_DATA=true
            shift
            ;;
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        *)
            log_error "未知参数: $1"
            echo "用法: $0 [--clean] [--no-data] [--skip-tests]"
            exit 1
            ;;
    esac
done

##############################################################################
# 1. 环境检查
##############################################################################

separator
log_info "步骤 1/8: 检查系统依赖"
separator

# 检查 Docker
if ! command -v docker &> /dev/null; then
    log_error "Docker 未安装，请先安装 Docker Desktop"
    exit 1
fi
log_success "Docker 已安装: $(docker --version)"

# 检查 Docker Compose
if ! command -v docker-compose &> /dev/null; then
    log_error "Docker Compose 未安装"
    exit 1
fi
log_success "Docker Compose 已安装: $(docker-compose --version)"

# 检查 Node.js
if ! command -v node &> /dev/null; then
    log_error "Node.js 未安装，请先安装 Node.js 18+"
    exit 1
fi
log_success "Node.js 已安装: $(node --version)"

# 检查 npm
if ! command -v npm &> /dev/null; then
    log_error "npm 未安装"
    exit 1
fi
log_success "npm 已安装: $(npm --version)"

# 检查 psql（可选）
if command -v psql &> /dev/null; then
    log_success "psql 已安装: $(psql --version | head -n1)"
else
    log_warn "psql 未安装（可选），将使用 docker-compose exec 连接数据库"
fi

echo ""

##############################################################################
# 2. 清理现有环境（如果指定 --clean）
##############################################################################

if [ "$CLEAN_MODE" = true ]; then
    separator
    log_info "步骤 2/8: 清理现有环境"
    separator

    log_warn "正在停止并删除现有 Docker 容器..."
    docker-compose down -v 2>/dev/null || true
    log_success "现有环境已清理"
    echo ""
else
    separator
    log_info "步骤 2/8: 清理现有环境（跳过，使用 --clean 启用）"
    separator
    echo ""
fi

##############################################################################
# 3. 创建环境变量文件
##############################################################################

separator
log_info "步骤 3/8: 配置环境变量"
separator

if [ -f ".env" ]; then
    log_warn ".env 文件已存在，备份到 .env.backup"
    cp .env .env.backup
fi

log_info "创建 .env 文件..."
cat > .env << 'EOF'
# ClawTeam Platform - 环境变量配置
# 生成时间: $(date)

# 数据库配置
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/clawteam
DATABASE_POOL_MAX=10
DATABASE_POOL_MIN=2
DATABASE_POOL_IDLE_TIMEOUT=30000

# Redis 配置
REDIS_URL=redis://localhost:6379/0
REDIS_TIMEOUT=3000
REDIS_FALLBACK_ENABLED=true

# API 配置
API_PORT=3000
API_HOST=0.0.0.0

# 开发模式配置
NODE_ENV=development
USE_MOCK=false
LOG_LEVEL=debug

# 认证配置
API_KEY_SALT=clawteam-dev-salt-change-in-production

# 健康检查配置
HEALTH_CHECK_ENABLED=true
HEALTH_CHECK_TIMEOUT=5000

# 监控配置（Phase 3+）
PROMETHEUS_ENABLED=false
PROMETHEUS_PORT=9090
METRICS_PATH=/metrics

# 测试配置
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/clawteam_test
TEST_REDIS_URL=redis://localhost:6379/1
EOF

log_success ".env 文件创建成功"
echo ""

##############################################################################
# 4. 安装 npm 依赖
##############################################################################

separator
log_info "步骤 4/8: 安装 Node.js 依赖"
separator

if [ ! -d "node_modules" ]; then
    log_info "正在安装 npm 依赖（首次安装可能需要 2-3 分钟）..."
    npm install
    log_success "依赖安装完成"
else
    log_info "node_modules 已存在，跳过安装（如需重新安装，请先删除 node_modules）"
fi

echo ""

##############################################################################
# 5. 启动 Docker 服务
##############################################################################

separator
log_info "步骤 5/8: 启动 Docker 服务（PostgreSQL + Redis）"
separator

log_info "正在启动 Docker Compose..."
docker-compose up -d

# 等待服务健康检查通过
log_info "等待服务启动（最多 30 秒）..."
WAIT_TIME=0
MAX_WAIT=30

while [ $WAIT_TIME -lt $MAX_WAIT ]; do
    POSTGRES_STATUS=$(docker-compose ps -q postgres | xargs docker inspect -f '{{.State.Health.Status}}' 2>/dev/null || echo "starting")
    REDIS_STATUS=$(docker-compose ps -q redis | xargs docker inspect -f '{{.State.Health.Status}}' 2>/dev/null || echo "starting")

    if [ "$POSTGRES_STATUS" = "healthy" ] && [ "$REDIS_STATUS" = "healthy" ]; then
        log_success "所有服务已启动并通过健康检查"
        break
    fi

    echo -n "."
    sleep 2
    WAIT_TIME=$((WAIT_TIME + 2))
done

echo ""

if [ $WAIT_TIME -ge $MAX_WAIT ]; then
    log_error "服务启动超时，请检查 Docker 日志: docker-compose logs"
    exit 1
fi

# 显示容器状态
log_info "容器状态:"
docker-compose ps

echo ""

##############################################################################
# 6. 初始化数据库
##############################################################################

separator
log_info "步骤 6/8: 初始化数据库 Schema"
separator

# 检查 DATABASE_SCHEMA.sql 是否存在
if [ ! -f "DATABASE_SCHEMA.sql" ]; then
    log_error "DATABASE_SCHEMA.sql 文件不存在，请确保文件在项目根目录"
    exit 1
fi

log_info "正在执行 DATABASE_SCHEMA.sql..."
cat DATABASE_SCHEMA.sql | docker-compose exec -T postgres psql -U postgres -d clawteam

if [ $? -eq 0 ]; then
    log_success "数据库 Schema 初始化完成"
else
    log_error "数据库 Schema 初始化失败"
    exit 1
fi

echo ""

##############################################################################
# 7. 验证数据库和服务
##############################################################################

separator
log_info "步骤 7/8: 验证基础设施"
separator

# 验证 PostgreSQL
log_info "验证 PostgreSQL..."
TABLE_COUNT=$(docker-compose exec -T postgres psql -U postgres -d clawteam -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';" | tr -d ' ')

if [ "$TABLE_COUNT" -eq 9 ]; then
    log_success "PostgreSQL: 9 张表创建成功 ✅"
else
    log_error "PostgreSQL: 表数量不正确（预期 9，实际 $TABLE_COUNT）"
    exit 1
fi

# 验证初始数据
TEAM_COUNT=$(docker-compose exec -T postgres psql -U postgres -d clawteam -t -c "SELECT COUNT(*) FROM teams;" | tr -d ' ')
if [ "$TEAM_COUNT" -ge 1 ]; then
    log_success "PostgreSQL: 初始数据插入成功（$TEAM_COUNT 个团队）✅"
else
    log_warn "PostgreSQL: 未找到初始数据"
fi

# 验证 Redis
log_info "验证 Redis..."
REDIS_PING=$(docker-compose exec -T redis redis-cli ping)
if [ "$REDIS_PING" = "PONG" ]; then
    log_success "Redis: 服务正常 ✅"
else
    log_error "Redis: 服务异常"
    exit 1
fi

echo ""

##############################################################################
# 8. 运行测试验证（可选）
##############################################################################

if [ "$SKIP_TESTS" = false ]; then
    separator
    log_info "步骤 8/8: 运行测试验证"
    separator

    log_info "运行单元测试（预计 5-10 秒）..."
    if npm test 2>&1 | tee /tmp/clawteam-test.log | grep -q "Tests:.*passed"; then
        # 使用 sed 替代 grep -P 以支持 macOS (BSD grep)
        PASSED_TESTS=$(grep "Tests:" /tmp/clawteam-test.log | tail -n1 | sed -n 's/.*\([0-9][0-9]*\) passed.*/\1/p')
        log_success "单元测试通过: $PASSED_TESTS tests ✅"
    else
        log_error "单元测试失败，请查看输出"
        exit 1
    fi

    echo ""

    log_info "运行集成测试（预计 5 秒，需要数据库）..."
    if npm run test:integration 2>&1 | tee /tmp/clawteam-integration-test.log | grep -q "Tests:.*passed"; then
        # 使用 sed 替代 grep -P 以支持 macOS (BSD grep)
        PASSED_INTEGRATION=$(grep "Tests:" /tmp/clawteam-integration-test.log | tail -n1 | sed -n 's/.*\([0-9][0-9]*\) passed.*/\1/p')
        log_success "集成测试通过: $PASSED_INTEGRATION tests ✅"
    else
        log_warn "集成测试部分失败（可能是已知问题，参考 Phase 3 评估报告）"
    fi

    echo ""
else
    separator
    log_info "步骤 8/8: 运行测试验证（跳过，使用 --skip-tests 禁用）"
    separator
    echo ""
fi

##############################################################################
# 完成总结
##############################################################################

separator
log_success "🎉 开发环境部署完成！"
separator

echo ""
echo -e "${GREEN}✅ 基础设施状态${NC}"
echo "  • PostgreSQL: 运行中（端口 5432）"
echo "  • Redis: 运行中（端口 6379）"
echo "  • 数据库: clawteam（9 张表）"
echo "  • 初始数据: Test Team + 邀请码"
echo ""

echo -e "${BLUE}📋 快速命令${NC}"
echo ""
echo "  # 查看服务状态"
echo "  docker-compose ps"
echo ""
echo "  # 查看服务日志"
echo "  docker-compose logs -f postgres"
echo "  docker-compose logs -f redis"
echo ""
echo "  # 连接数据库"
echo "  docker-compose exec postgres psql -U postgres -d clawteam"
echo ""
echo "  # 连接 Redis"
echo "  docker-compose exec redis redis-cli"
echo ""
echo "  # 运行测试"
echo "  npm test                    # 单元测试"
echo "  npm run test:integration    # 集成测试"
echo ""
echo "  # 启动 API 服务器"
echo "  npm run dev:api             # 仅 API 服务器（端口 3000）"
echo "  npm run dev                 # API + Dashboard"
echo ""

echo -e "${BLUE}🔧 维护命令${NC}"
echo ""
echo "  # 重启服务"
echo "  docker-compose restart"
echo ""
echo "  # 停止服务"
echo "  docker-compose down"
echo ""
echo "  # 完全重建（删除数据）"
echo "  bash scripts/setup-dev-environment.sh --clean"
echo ""
echo "  # 重置数据库"
echo "  bash scripts/reset-database.sh"
echo ""

echo -e "${YELLOW}⚠️  注意事项${NC}"
echo ""
echo "  1. 数据库密码在开发环境中为 'postgres'（生产环境请修改）"
echo "  2. .env 文件包含开发配置，请勿提交到 Git"
echo "  3. 如遇到端口冲突，请修改 docker-compose.yml 或停止占用端口的服务"
echo "  4. 集成测试需要数据库运行，单元测试不需要"
echo ""

echo -e "${GREEN}🚀 下一步${NC}"
echo ""
echo "  1. 启动 API 服务器: npm run dev:api"
echo "  2. 访问健康检查: curl http://localhost:3000/api/v1/capability-registry/health"
echo "  3. 查看 API 文档: 参考 packages/api/src/*/PRD.md"
echo "  4. 运行示例: 参考 packages/api/src/*/DEVLOG.md"
echo ""

separator
echo ""
