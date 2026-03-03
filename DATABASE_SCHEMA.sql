-- ClawTeam Platform - 完整数据库结构
--
-- 使用方法：
--   1. 启动 PostgreSQL: docker-compose up -d postgres
--   2. 创建数据库: createdb clawteam
--   3. 执行此文件: psql -d clawteam -f DATABASE_SCHEMA.sql
--
-- 重建数据库（清空所有数据）：
--   dropdb clawteam && createdb clawteam && psql -d clawteam -f DATABASE_SCHEMA.sql
--
-- 最后更新: 2026-02-02
-- 版本: 1.0.0

-- ============================================================
-- 扩展
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- 用于全文搜索

-- ============================================================
-- 1. Teams 表（团队）
-- ============================================================

CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,  -- 团队标识符，如 "engineering"
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 2. Users 表（用户，持有 API Key）
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE,
  name VARCHAR(255) NOT NULL,
  api_key_hash VARCHAR(64) UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_api_key_hash ON users(api_key_hash);

-- ============================================================
-- 3. Bots 表（Bot 注册信息）
-- 模块: Capability Registry
-- ============================================================

CREATE TABLE IF NOT EXISTS bots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  owner_email VARCHAR(255),
  api_key_hash VARCHAR(64) UNIQUE,  -- SHA-256 哈希（deprecated, 用户级 key 在 users 表）
  user_id UUID REFERENCES users(id),

  -- 状态
  status VARCHAR(50) DEFAULT 'online',  -- online, offline, busy, focus_mode

  -- 能力（JSONB 数组）
  capabilities JSONB NOT NULL DEFAULT '[]',
  -- 格式: [{"name": "run_sql_query", "description": "...", "parameters": {...}, "async": true}]

  -- 元数据
  tags TEXT[] DEFAULT '{}',
  availability JSONB,  -- 可用时间配置
  metadata JSONB,

  -- 头像
  avatar_color VARCHAR(20),   -- 持久化头像颜色（hex，如 #3b82f6）
  avatar_url VARCHAR(500),    -- 头像图片 URL（可选）

  -- 时间戳
  created_at TIMESTAMP DEFAULT NOW(),
  last_seen TIMESTAMP DEFAULT NOW(),

  -- 约束
  UNIQUE(team_id, name),
  CONSTRAINT bots_status_check CHECK (status IN ('online', 'offline', 'busy', 'focus_mode'))
);

-- Bots 表索引
CREATE INDEX IF NOT EXISTS idx_bots_team ON bots(team_id);
CREATE INDEX IF NOT EXISTS idx_bots_status ON bots(status);
CREATE INDEX IF NOT EXISTS idx_bots_api_key_hash ON bots(api_key_hash);
CREATE INDEX IF NOT EXISTS idx_bots_tags ON bots USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_bots_capabilities_search ON bots USING gin((capabilities::text) gin_trgm_ops);

-- ============================================================
-- 3. Team Invite Codes 表（团队邀请码）
-- 模块: Capability Registry
-- ============================================================

CREATE TABLE IF NOT EXISTS team_invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  code VARCHAR(32) NOT NULL UNIQUE,
  created_by VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP,
  max_uses INT,
  use_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invite_codes_team ON team_invite_codes(team_id);
CREATE INDEX IF NOT EXISTS idx_invite_codes_code ON team_invite_codes(code);

-- ============================================================
-- 4. Capability Index 表（能力索引，用于高级搜索）
-- 模块: Capability Registry
-- ============================================================

CREATE TABLE IF NOT EXISTS capability_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  capability_name VARCHAR(255) NOT NULL,
  capability_description TEXT,
  search_vector TSVECTOR,  -- 全文搜索向量
  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(bot_id, capability_name)
);

CREATE INDEX IF NOT EXISTS idx_capability_bot ON capability_index(bot_id);
CREATE INDEX IF NOT EXISTS idx_capability_name ON capability_index(capability_name);
CREATE INDEX IF NOT EXISTS idx_capability_search ON capability_index USING gin(search_vector);

-- ============================================================
-- 5. Tasks 表（任务记录）
-- 模块: Task Coordinator
-- ============================================================

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Bot 关联
  from_bot_id UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  to_bot_id UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,

  -- 任务定义
  capability VARCHAR(255) DEFAULT 'general',
  prompt TEXT,
  parameters JSONB NOT NULL DEFAULT '{}',

  -- 状态管理
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  priority VARCHAR(20) NOT NULL DEFAULT 'normal',

  -- 结果
  result JSONB,
  error JSONB,

  -- 超时和重试
  timeout_seconds INT NOT NULL DEFAULT 300,
  retry_count INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 3,

  -- 时间戳
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,

  -- 上下文
  human_context TEXT,
  conversation_id VARCHAR(255),
  workflow_id UUID,  -- 关联 workflows 表（如果属于工作流）
  metadata JSONB,

  -- 任务类型和层级
  type VARCHAR(20) DEFAULT 'new',
  title VARCHAR(500),
  parent_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,

  -- Session 关联
  sender_session_key VARCHAR(255),
  executor_session_key VARCHAR(255),

  -- 更新追踪
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Heartbeat 监控
  last_heartbeat_at TIMESTAMP,
  session_status VARCHAR(50),
  heartbeat_details JSONB,

  -- 约束
  CONSTRAINT tasks_status_check CHECK (status IN ('pending', 'accepted', 'processing', 'waiting_for_input', 'completed', 'failed', 'timeout', 'cancelled')),
  CONSTRAINT tasks_priority_check CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  CONSTRAINT tasks_type_check CHECK (type IN ('new', 'sub-task'))
);

-- Tasks 表索引
CREATE INDEX IF NOT EXISTS idx_tasks_to_bot_status ON tasks(to_bot_id, status, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_from_bot ON tasks(from_bot_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_status_timeout ON tasks(status, created_at) WHERE status IN ('pending', 'accepted', 'processing');
CREATE INDEX IF NOT EXISTS idx_tasks_workflow ON tasks(workflow_id) WHERE workflow_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id) WHERE parent_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type);

-- ============================================================
-- 5b. Task Sessions 表（任务-会话映射）
-- 模块: Task Coordinator
-- 一个任务可能涉及多个 bot（委托方、执行方等），每个 bot 有自己的 session
-- ============================================================

CREATE TABLE IF NOT EXISTS task_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  session_key VARCHAR(255) NOT NULL,
  bot_id UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL DEFAULT 'executor',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT task_sessions_role_check CHECK (role IN ('sender', 'executor')),
  CONSTRAINT task_sessions_unique_bot UNIQUE (task_id, bot_id)
);

CREATE INDEX IF NOT EXISTS idx_task_sessions_task ON task_sessions(task_id);
CREATE INDEX IF NOT EXISTS idx_task_sessions_bot ON task_sessions(bot_id);
CREATE INDEX IF NOT EXISTS idx_task_sessions_task_bot ON task_sessions(task_id, bot_id);

-- ============================================================
-- 6. Workflows 表（工作流定义）
-- 模块: Workflow Engine（Phase 3+）
-- ============================================================

CREATE TABLE IF NOT EXISTS workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 基本信息
  name VARCHAR(255) NOT NULL,
  description TEXT,
  owner_bot_id UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,

  -- 工作流定义（DAG）
  definition JSONB NOT NULL,
  -- 格式: {"steps": [{"id": "step1", "capability": "...", "dependsOn": []}], "edges": [...]}

  -- 状态
  status VARCHAR(50) DEFAULT 'draft',  -- draft, active, paused, archived

  -- 时间戳
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT workflows_status_check CHECK (status IN ('draft', 'active', 'paused', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_workflows_owner ON workflows(owner_bot_id);
CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status);

-- ============================================================
-- 7. Workflow Executions 表（工作流执行记录）
-- 模块: Workflow Engine（Phase 3+）
-- ============================================================

CREATE TABLE IF NOT EXISTS workflow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,

  -- 执行状态
  status VARCHAR(50) DEFAULT 'running',  -- running, completed, failed, cancelled
  current_step VARCHAR(255),

  -- 输入输出
  input JSONB,
  output JSONB,
  error JSONB,

  -- 步骤状态快照
  step_states JSONB DEFAULT '{}',
  -- 格式: {"step1": {"status": "completed", "result": {...}}, "step2": {...}}

  -- 时间戳
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,

  CONSTRAINT workflow_executions_status_check CHECK (status IN ('running', 'completed', 'failed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow ON workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_status ON workflow_executions(status);

-- ============================================================
-- 8. Permissions 表（权限规则）
-- 模块: Permission Manager（Phase 3+）
-- ============================================================

CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 权限主体
  grantor_bot_id UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,  -- 授权者
  grantee_bot_id UUID REFERENCES bots(id) ON DELETE CASCADE,  -- 被授权者（NULL 表示所有 Bot）
  grantee_team_id UUID REFERENCES teams(id) ON DELETE CASCADE,  -- 被授权团队

  -- 权限类型
  permission_type VARCHAR(50) NOT NULL,  -- delegate, execute, read, admin
  capability_pattern VARCHAR(255),  -- 能力名称模式（支持通配符 *）

  -- 限制
  rate_limit INT,  -- 每小时最大请求数
  expires_at TIMESTAMP,

  -- 元数据
  created_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT permissions_type_check CHECK (permission_type IN ('delegate', 'execute', 'read', 'admin'))
);

CREATE INDEX IF NOT EXISTS idx_permissions_grantor ON permissions(grantor_bot_id);
CREATE INDEX IF NOT EXISTS idx_permissions_grantee_bot ON permissions(grantee_bot_id);
CREATE INDEX IF NOT EXISTS idx_permissions_grantee_team ON permissions(grantee_team_id);

-- ============================================================
-- 9. Audit Logs 表（审计日志）
-- 模块: Permission Manager（Phase 3+）
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 事件信息
  event_type VARCHAR(100) NOT NULL,  -- bot.registered, task.delegated, permission.granted, etc.
  actor_bot_id UUID REFERENCES bots(id) ON DELETE SET NULL,
  target_bot_id UUID REFERENCES bots(id) ON DELETE SET NULL,

  -- 详情
  details JSONB,
  ip_address INET,

  -- 时间戳
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_event ON audit_logs(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_bot_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

-- ============================================================
-- 初始测试数据（可选）
-- ============================================================

-- 创建测试团队
INSERT INTO teams (id, name, slug) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Test Team', 'test-team')
ON CONFLICT (slug) DO NOTHING;

-- 创建测试邀请码（永不过期）
INSERT INTO team_invite_codes (team_id, code, created_by) VALUES
  ('00000000-0000-0000-0000-000000000001', 'TEST-INVITE-CODE', 'system')
ON CONFLICT (code) DO NOTHING;

-- 创建测试用户（本地开发用，api_key = 'clawteam_dev_test_key'）
INSERT INTO users (name, email, api_key_hash) VALUES
  ('dev', 'dev@test.com', encode(sha256('clawteam_dev_test_key'::bytea), 'hex'))
ON CONFLICT DO NOTHING;

-- ============================================================
-- 完成
-- ============================================================

-- 显示所有表
\dt

-- 显示表数量
SELECT COUNT(*) AS table_count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
