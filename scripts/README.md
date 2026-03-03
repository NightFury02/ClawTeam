# 基础设施部署脚本使用指南

本目录包含 ClawTeam Platform 开发环境的自动化部署和管理脚本。

## 📋 脚本清单

| 脚本 | 用途 | 使用场景 |
|------|------|---------|
| `setup-dev-environment.sh` | **完整环境部署** | 首次设置、完全重建 |
| `quick-start.sh` | **快速启动服务** | 日常开发、重启服务 |
| `verify-environment.sh` | **环境验证** | 问题排查、健康检查 |
| `reset-database.sh` | **数据库重置** | 测试清理、数据重置 |

---

## 🚀 快速开始

### 首次设置（完整部署）

```bash
# 1. 进入项目根目录
cd /Users/fei/WorkStation/git/ClawCode/clawteam-mvd/clawteam-platform

# 2. 添加执行权限
chmod +x scripts/*.sh

# 3. 运行完整部署脚本
bash scripts/setup-dev-environment.sh

# 预期时间：3-5 分钟
# 输出：所有服务启动、数据库初始化、测试通过
```

### 日常使用（快速启动）

```bash
# 启动服务
bash scripts/quick-start.sh

# 预期时间：10-20 秒
# 输出：Docker 服务启动、健康检查通过
```

---

## 📖 详细说明

### 1. setup-dev-environment.sh - 完整环境部署

**功能**:
- ✅ 检查系统依赖（Docker、Node.js、npm）
- ✅ 创建 `.env` 环境变量文件
- ✅ 安装 npm 依赖
- ✅ 启动 Docker 服务（PostgreSQL + Redis）
- ✅ 初始化数据库 Schema（9 张表）
- ✅ 插入初始测试数据
- ✅ 运行测试验证
- ✅ 显示快速命令和维护指南

**使用方法**:

```bash
# 标准部署
bash scripts/setup-dev-environment.sh

# 完全重建（删除现有环境）
bash scripts/setup-dev-environment.sh --clean

# 不插入初始数据
bash scripts/setup-dev-environment.sh --no-data

# 跳过测试验证（加快部署）
bash scripts/setup-dev-environment.sh --skip-tests

# 组合使用
bash scripts/setup-dev-environment.sh --clean --skip-tests
```

**输出示例**:

```
════════════════════════════════════════════════════════
[INFO] 步骤 1/8: 检查系统依赖
════════════════════════════════════════════════════════
[SUCCESS] Docker 已安装: Docker version 24.0.7
[SUCCESS] Docker Compose 已安装: Docker Compose version v2.23.0
[SUCCESS] Node.js 已安装: v18.19.0
[SUCCESS] npm 已安装: 10.2.3

...

════════════════════════════════════════════════════════
[SUCCESS] 🎉 开发环境部署完成！
════════════════════════════════════════════════════════

✅ 基础设施状态
  • PostgreSQL: 运行中（端口 5432）
  • Redis: 运行中（端口 6379）
  • 数据库: clawteam（9 张表）
  • 初始数据: Test Team + 邀请码
```

**适用场景**:
- 🆕 首次设置开发环境
- 🔄 完全重建环境（使用 `--clean`）
- 🐛 修复环境问题
- 📦 拉取新代码后重新部署

---

### 2. quick-start.sh - 快速启动服务

**功能**:
- ✅ 检查 Docker 是否运行
- ✅ 启动 Docker Compose 服务
- ✅ 等待健康检查通过
- ✅ 验证数据库 Schema
- ✅ 显示服务状态和快速命令

**使用方法**:

```bash
bash scripts/quick-start.sh
```

**输出示例**:

```
════════════════════════════════════════════════════════
🚀 ClawTeam Platform - 快速启动
════════════════════════════════════════════════════════

[INFO] 检查 Docker...
[SUCCESS] Docker 运行中 ✓

[INFO] 启动 Docker 服务（PostgreSQL + Redis）...
[INFO] 等待服务健康检查（最多 30 秒）...
...........
[SUCCESS] 所有服务已启动 ✓

[INFO] 验证数据库...
[SUCCESS] 数据库 Schema 正常 ✓

════════════════════════════════════════════════════════
[SUCCESS] ✅ 服务已启动
════════════════════════════════════════════════════════

服务状态
NAME                           STATUS
clawteam-platform-postgres-1   Up (healthy)
clawteam-platform-redis-1      Up (healthy)
```

**适用场景**:
- 🌅 每天开始工作
- 🔌 重启电脑后
- 🛑 docker-compose down 后
- ⚡ 快速启动测试

---

### 3. verify-environment.sh - 环境验证

**功能**:
- ✅ 检查系统依赖（Docker、Node.js、k6 等）
- ✅ 检查项目文件（package.json、.env、Schema）
- ✅ 检查 Docker 服务状态
- ✅ 检查数据库连接和表结构
- ✅ 检查 Redis 连接和数据
- ✅ 检查端口占用（5432、6379、3000）
- ✅ 检查环境变量配置
- ✅ 生成验证报告

**使用方法**:

```bash
bash scripts/verify-environment.sh
```

**输出示例**:

```
▶ 系统依赖
  ✓ Docker: Docker version 24.0.7
  ✓ Docker Compose: Docker Compose version v2.23.0
  ✓ Node.js: v18.19.0 (>= 18 ✓)
  ✓ npm: 10.2.3
  ✓ psql: psql (PostgreSQL) 15.5 (可选)
  ⚠ redis-cli: 未安装（可选工具）
  ⚠ k6: 未安装（Phase 3 性能测试需要）

▶ 项目文件
  ✓ package.json: 存在
  ✓ node_modules: 已安装
  ✓ .env: 存在
  ✓ DATABASE_SCHEMA.sql: 存在
  ✓ docker-compose.yml: 存在

▶ Docker 服务
  ✓ Docker daemon: 运行中
  ✓ PostgreSQL: 运行中 (healthy)
  ✓ Redis: 运行中 (healthy)

▶ 数据库状态
  ✓ PostgreSQL 连接: 成功
  ✓ 数据库表: 9 / 9 ✓
  ✓ pg_trgm 扩展: 已安装
  ✓ 初始数据: 1 个团队
  ✓ 数据库状态: 干净（Bots: 0, Tasks: 0）

▶ Redis 状态
  ✓ Redis 连接: 成功
  ✓ Redis 版本: 7.4.7
  ✓ Redis 数据: 0 keys (干净状态)

▶ 端口状态
  ✓ 端口 5432 (PostgreSQL): 监听中
  ✓ 端口 6379 (Redis): 监听中
  ⚠ 端口 3000 (API Server): 未监听

▶ 环境变量
  ✓ DATABASE_URL: 已配置
  ✓ REDIS_URL: 已配置
  ✓ USE_MOCK: false (使用真实依赖)
  ✓ NODE_ENV: development

════════════════════════════════════════════════════════
✅ 环境验证通过！

总计: 32 通过 | 5 警告 | 0 失败
════════════════════════════════════════════════════════
```

**适用场景**:
- 🐛 排查环境问题
- ✅ 验证部署是否成功
- 📊 生成环境状态报告
- 🆘 遇到错误时第一步诊断

---

### 4. reset-database.sh - 数据库重置

**功能**:
- ✅ 清空所有表数据
- ✅ 重新插入初始数据
- ✅ 验证重置后状态
- ✅ 完全重建模式（可选）

**使用方法**:

```bash
# 标准重置（清空数据，保留 Schema）
bash scripts/reset-database.sh

# 完全重建（删除并重新创建数据库）
bash scripts/reset-database.sh --full
```

**交互示例**:

```
════════════════════════════════════════════════════════
[INFO] 重置数据库到初始状态
════════════════════════════════════════════════════════

确认继续？此操作将删除所有数据！[y/N]: y

[INFO] 正在清空所有表数据（保留 Schema）...
[SUCCESS] 数据库已重置到初始状态 ✅

[INFO] 验证数据库状态...

════════════════════════════════════════════════════════
[SUCCESS] 数据库重置完成
════════════════════════════════════════════════════════

数据库状态
  • 表数量: 9 / 9
  • Teams: 1
  • Bots: 0
  • Tasks: 0

[INFO] 可以开始测试了！
```

**适用场景**:
- 🧪 测试前清理数据
- 🔄 重置到干净状态
- 🐛 修复数据损坏
- 📊 准备演示环境

---

## 🛠️ 常见问题

### 问题 1: Docker daemon 未运行

**错误信息**:
```
[ERROR] Docker daemon 未运行，请启动 Docker Desktop
```

**解决方案**:
1. 启动 Docker Desktop 应用
2. 等待 Docker 图标显示为绿色
3. 重新运行脚本

### 问题 2: 端口冲突

**错误信息**:
```
Error: port is already allocated
```

**解决方案**:

```bash
# 查看端口占用
lsof -i :5432
lsof -i :6379

# 停止占用端口的进程
kill <PID>

# 或修改 docker-compose.yml 使用不同端口
```

### 问题 3: 数据库表数量不正确

**错误信息**:
```
[WARN] 数据库未初始化（表数量: 0 / 9）
```

**解决方案**:

```bash
# 手动执行 Schema
cat DATABASE_SCHEMA.sql | docker-compose exec -T postgres psql -U postgres -d clawteam

# 或完全重建
bash scripts/setup-dev-environment.sh --clean
```

### 问题 4: npm 依赖未安装

**错误信息**:
```
[WARN] node_modules: 未安装（运行 npm install）
```

**解决方案**:

```bash
npm install
```

### 问题 5: 集成测试失败

**参考**: `PROJECT_PHASE3_COMPLETION_EVALUATION.md` 中的修复方案

**快速修复**:

```bash
# 重置数据库
bash scripts/reset-database.sh --full

# 重新运行测试
npm run test:integration
```

---

## 📊 脚本执行时间参考

| 脚本 | 首次运行 | 后续运行 |
|------|---------|---------|
| `setup-dev-environment.sh` | 3-5 分钟 | 1-2 分钟 |
| `quick-start.sh` | 30 秒 | 10 秒 |
| `verify-environment.sh` | 10 秒 | 5 秒 |
| `reset-database.sh` | 5 秒 | 3 秒 |

---

## 🔧 脚本维护

### 添加新脚本

1. 创建脚本文件（参考现有脚本格式）
2. 添加执行权限：`chmod +x scripts/new-script.sh`
3. 更新本文档
4. 测试脚本在干净环境下的运行

### 脚本规范

所有脚本应遵循：
- ✅ 使用 `#!/bin/bash` 和 `set -e`
- ✅ 提供彩色输出（log_info、log_success、log_error）
- ✅ 包含使用说明（注释头部）
- ✅ 支持 `--help` 参数
- ✅ 验证依赖和前置条件
- ✅ 提供清晰的错误信息
- ✅ 显示执行进度

---

## 📚 相关文档

- [PHASE2.1_COMPLETION.md](../PHASE2.1_COMPLETION.md) - Phase 2.1 完成报告
- [PROJECT_PHASE3_COMPLETION_EVALUATION.md](../PROJECT_PHASE3_COMPLETION_EVALUATION.md) - Phase 3 评估报告
- [DATABASE_QUICK_REFERENCE.md](../DATABASE_QUICK_REFERENCE.md) - 数据库快速参考
- [docker-compose.yml](../docker-compose.yml) - Docker Compose 配置
- [.env.example](../.env.example) - 环境变量示例

---

**文档版本**: v1.0
**创建时间**: 2026-02-03
**维护者**: ClawTeam Platform Team
