-- Up
-- Task Coordinator 数据库迁移 v0.1.0
-- 创建 tasks 表

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_bot_id UUID NOT NULL,
  to_bot_id UUID NOT NULL,
  capability VARCHAR(255) NOT NULL,
  parameters JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  priority VARCHAR(20) NOT NULL DEFAULT 'normal',
  result JSONB,
  error JSONB,
  timeout_seconds INT NOT NULL DEFAULT 300,
  retry_count INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 3,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  human_context TEXT,
  conversation_id VARCHAR(255),
  workflow_id UUID,
  metadata JSONB,
  CONSTRAINT tasks_status_check CHECK (status IN ('pending', 'accepted', 'processing', 'completed', 'failed', 'timeout', 'cancelled')),
  CONSTRAINT tasks_priority_check CHECK (priority IN ('low', 'normal', 'high', 'urgent'))
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_tasks_to_bot_status ON tasks(to_bot_id, status, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_from_bot ON tasks(from_bot_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_workflow ON tasks(workflow_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_status_timeout ON tasks(status, created_at) WHERE status IN ('pending', 'accepted', 'processing');
CREATE INDEX IF NOT EXISTS idx_tasks_poll ON tasks(to_bot_id, status, priority) INCLUDE (id, capability, from_bot_id, parameters, created_at, timeout_seconds);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);

-- 注释
COMMENT ON TABLE tasks IS 'Bot 间任务委托记录';
COMMENT ON COLUMN tasks.from_bot_id IS '发起 Bot ID';
COMMENT ON COLUMN tasks.to_bot_id IS '执行 Bot ID';
COMMENT ON COLUMN tasks.capability IS '能力名称';
COMMENT ON COLUMN tasks.parameters IS '能力参数（JSONB）';
COMMENT ON COLUMN tasks.status IS '任务状态';
COMMENT ON COLUMN tasks.priority IS '优先级';
COMMENT ON COLUMN tasks.result IS '任务结果（JSONB）';
COMMENT ON COLUMN tasks.error IS '错误信息（JSONB）';
COMMENT ON COLUMN tasks.human_context IS '人类可读上下文';
COMMENT ON COLUMN tasks.conversation_id IS '会话 ID';
COMMENT ON COLUMN tasks.workflow_id IS '工作流 ID';

-- Down
DROP INDEX IF EXISTS idx_tasks_created_at;
DROP INDEX IF EXISTS idx_tasks_poll;
DROP INDEX IF EXISTS idx_tasks_status_timeout;
DROP INDEX IF EXISTS idx_tasks_workflow;
DROP INDEX IF EXISTS idx_tasks_from_bot;
DROP INDEX IF EXISTS idx_tasks_to_bot_status;
DROP TABLE IF EXISTS tasks;
