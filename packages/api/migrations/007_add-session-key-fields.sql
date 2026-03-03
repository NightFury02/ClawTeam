-- Up
-- 添加会话标识字段
-- 用于支持双向可寻址的会话路由架构 (Phase 6)

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sender_session_key VARCHAR(255);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS executor_session_key VARCHAR(255);

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_tasks_sender_session_key ON tasks(sender_session_key) WHERE sender_session_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_executor_session_key ON tasks(executor_session_key) WHERE executor_session_key IS NOT NULL;

-- 注释
COMMENT ON COLUMN tasks.sender_session_key IS '委托方的会话标识 (OpenClaw sessionKey)';
COMMENT ON COLUMN tasks.executor_session_key IS '执行方的会话标识 (OpenClaw sessionKey)';

-- Down
DROP INDEX IF EXISTS idx_tasks_executor_session_key;
DROP INDEX IF EXISTS idx_tasks_sender_session_key;
ALTER TABLE tasks DROP COLUMN IF EXISTS executor_session_key;
ALTER TABLE tasks DROP COLUMN IF EXISTS sender_session_key;
