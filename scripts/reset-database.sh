#!/bin/bash

##############################################################################
# ClawTeam Platform - 数据库重置脚本
#
# 用途：快速重置数据库到初始状态（保留 Schema）
# 适用场景：
#   - 测试后清理数据
#   - 重置到干净状态
#   - 修复数据损坏
#
# 使用方法：
#   bash scripts/reset-database.sh
#   bash scripts/reset-database.sh --full  # 完全重建（删除并重新创建数据库）
##############################################################################

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

separator() {
    echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
}

##############################################################################
# 解析参数
##############################################################################

FULL_REBUILD=false

if [ "$1" = "--full" ]; then
    FULL_REBUILD=true
fi

##############################################################################
# 主流程
##############################################################################

separator
if [ "$FULL_REBUILD" = true ]; then
    log_warn "⚠️  完全重建模式：将删除并重新创建数据库"
else
    log_info "重置数据库到初始状态"
fi
separator
echo ""

# 确认操作
read -p "$(echo -e ${YELLOW}确认继续？此操作将删除所有数据！[y/N]: ${NC})" -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_info "操作已取消"
    exit 0
fi

echo ""

if [ "$FULL_REBUILD" = true ]; then
    # 完全重建
    log_info "正在删除数据库..."
    docker-compose exec -T postgres dropdb -U postgres --if-exists clawteam

    log_info "正在重新创建数据库..."
    docker-compose exec -T postgres createdb -U postgres clawteam

    log_info "正在执行 Schema..."
    cat DATABASE_SCHEMA.sql | docker-compose exec -T postgres psql -U postgres -d clawteam

    log_success "数据库完全重建完成 ✅"
else
    # 仅清空数据
    log_info "正在清空所有表数据（保留 Schema）..."

    # 按外键依赖顺序删除
    docker-compose exec -T postgres psql -U postgres -d clawteam << 'EOF'
-- 禁用触发器和约束检查（加速删除）
SET session_replication_role = replica;

-- 删除数据（按依赖顺序）
DELETE FROM audit_logs;
DELETE FROM workflow_executions;
DELETE FROM tasks;
DELETE FROM capability_index;
DELETE FROM bots;
DELETE FROM team_invite_codes;
DELETE FROM permissions;
DELETE FROM workflows;
DELETE FROM teams;

-- 重新启用约束
SET session_replication_role = DEFAULT;

-- 重新插入初始数据
INSERT INTO teams (id, name, slug, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Test Team',
  'test-team',
  NOW(),
  NOW()
);

INSERT INTO team_invite_codes (team_id, code, created_by, expires_at, max_uses, use_count)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'TEST-INVITE-CODE',
  'system',
  NOW() + INTERVAL '365 days',
  NULL,
  0
);
EOF

    log_success "数据库已重置到初始状态 ✅"
fi

echo ""

# 验证
log_info "验证数据库状态..."

TABLE_COUNT=$(docker-compose exec -T postgres psql -U postgres -d clawteam -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';" | tr -d ' ')
TEAM_COUNT=$(docker-compose exec -T postgres psql -U postgres -d clawteam -t -c "SELECT COUNT(*) FROM teams;" | tr -d ' ')
BOT_COUNT=$(docker-compose exec -T postgres psql -U postgres -d clawteam -t -c "SELECT COUNT(*) FROM bots;" | tr -d ' ')
TASK_COUNT=$(docker-compose exec -T postgres psql -U postgres -d clawteam -t -c "SELECT COUNT(*) FROM tasks;" | tr -d ' ')

echo ""
separator
log_success "数据库重置完成"
separator
echo ""
echo -e "${GREEN}数据库状态${NC}"
echo "  • 表数量: $TABLE_COUNT / 9"
echo "  • Teams: $TEAM_COUNT"
echo "  • Bots: $BOT_COUNT"
echo "  • Tasks: $TASK_COUNT"
echo ""

log_info "可以开始测试了！"
echo ""
