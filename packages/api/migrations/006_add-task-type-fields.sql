-- Up
-- 添加任务类型和父任务 ID 字段
-- 用于支持 new/followup/correction 任务类型和会话管理

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'new';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_task_id UUID;

-- 添加约束
ALTER TABLE tasks ADD CONSTRAINT tasks_type_check CHECK (type IN ('new', 'followup', 'correction'));
ALTER TABLE tasks ADD CONSTRAINT tasks_parent_task_fk FOREIGN KEY (parent_task_id) REFERENCES tasks(id) ON DELETE SET NULL;

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id) WHERE parent_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type);

-- 注释
COMMENT ON COLUMN tasks.type IS '任务类型: new=新任务, followup=追加任务, correction=修正任务';
COMMENT ON COLUMN tasks.parent_task_id IS '父任务 ID (用于 followup/correction 类型)';

-- Down
DROP INDEX IF EXISTS idx_tasks_type;
DROP INDEX IF EXISTS idx_tasks_parent;
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_parent_task_fk;
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_type_check;
ALTER TABLE tasks DROP COLUMN IF EXISTS parent_task_id;
ALTER TABLE tasks DROP COLUMN IF EXISTS type;
