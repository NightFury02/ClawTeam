-- Up
-- 添加心跳监控字段
-- 用于 TaskRouter 上报 session 状态心跳 (Session Status Monitor)

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMP;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS session_status VARCHAR(50);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS heartbeat_details JSONB;

-- 索引：查找心跳过期的 processing 任务
CREATE INDEX IF NOT EXISTS idx_tasks_heartbeat
  ON tasks(last_heartbeat_at)
  WHERE status = 'processing' AND last_heartbeat_at IS NOT NULL;

-- 注释
COMMENT ON COLUMN tasks.last_heartbeat_at IS '最后一次心跳时间 (由 TaskRouter 上报)';
COMMENT ON COLUMN tasks.session_status IS 'Session 状态: active/tool_calling/waiting/idle/errored/completed/dead/unknown';
COMMENT ON COLUMN tasks.heartbeat_details IS '心跳详细信息 (JSONB): sessionKey, lastActivityAt, alive, jsonlAnalysis 等';

-- Down
DROP INDEX IF EXISTS idx_tasks_heartbeat;
ALTER TABLE tasks DROP COLUMN IF EXISTS heartbeat_details;
ALTER TABLE tasks DROP COLUMN IF EXISTS session_status;
ALTER TABLE tasks DROP COLUMN IF EXISTS last_heartbeat_at;
