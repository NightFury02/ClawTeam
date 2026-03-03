#!/bin/bash

##############################################################################
# ClawTeam Platform - 脚本测试工具
#
# 用途：测试所有部署脚本的语法和基本功能
# 使用方法：
#   bash scripts/test-scripts.sh
##############################################################################

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS_COUNT=0
FAIL_COUNT=0

check_script() {
    local SCRIPT=$1
    local NAME=$(basename $SCRIPT)

    echo -ne "  检查 ${BLUE}$NAME${NC}... "

    # 检查文件存在
    if [ ! -f "$SCRIPT" ]; then
        echo -e "${RED}✗ 文件不存在${NC}"
        FAIL_COUNT=$((FAIL_COUNT + 1))
        return 1
    fi

    # 检查可执行权限
    if [ ! -x "$SCRIPT" ]; then
        echo -e "${RED}✗ 无执行权限${NC}"
        FAIL_COUNT=$((FAIL_COUNT + 1))
        return 1
    fi

    # 检查语法（bash -n）
    if ! bash -n "$SCRIPT" 2>/dev/null; then
        echo -e "${RED}✗ 语法错误${NC}"
        FAIL_COUNT=$((FAIL_COUNT + 1))
        return 1
    fi

    # 检查 shebang
    if ! head -n1 "$SCRIPT" | grep -q "#!/bin/bash"; then
        echo -e "${YELLOW}⚠ 缺少 shebang${NC}"
        FAIL_COUNT=$((FAIL_COUNT + 1))
        return 1
    fi

    # 检查 set -e
    if ! grep -q "set -e" "$SCRIPT"; then
        echo -e "${YELLOW}⚠ 缺少 set -e${NC}"
        FAIL_COUNT=$((FAIL_COUNT + 1))
        return 1
    fi

    echo -e "${GREEN}✓ 通过${NC}"
    PASS_COUNT=$((PASS_COUNT + 1))
}

echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}ClawTeam Platform - 脚本测试${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo ""

echo "📋 检查脚本文件..."
echo ""

check_script "scripts/setup-dev-environment.sh"
check_script "scripts/quick-start.sh"
check_script "scripts/verify-environment.sh"
check_script "scripts/reset-database.sh"

echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"

if [ $FAIL_COUNT -eq 0 ]; then
    echo -e "${GREEN}✅ 所有脚本测试通过${NC}"
else
    echo -e "${RED}❌ 部分脚本测试失败${NC}"
fi

echo ""
echo "总计: ${GREEN}$PASS_COUNT 通过${NC} | ${RED}$FAIL_COUNT 失败${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
    exit 0
else
    exit 1
fi
