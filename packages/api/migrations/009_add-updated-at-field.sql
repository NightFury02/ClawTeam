-- Up
-- 添加 updated_at 字段
-- 用于跟踪任务最后更新时间（reset、状态变更等）

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- 索引
CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at DESC);

-- 注释
COMMENT ON COLUMN tasks.updated_at IS '任务最后更新时间';

-- Down
DROP INDEX IF EXISTS idx_tasks_updated_at;
ALTER TABLE tasks DROP COLUMN IF EXISTS updated_at;
