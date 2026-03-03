-- Up
-- 015: Add prompt column to tasks, make capability optional
-- prompt 成为任务的主要描述方式，capability 降级为可选路由提示
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS prompt TEXT;
ALTER TABLE tasks ALTER COLUMN capability DROP NOT NULL;
ALTER TABLE tasks ALTER COLUMN capability SET DEFAULT 'general';

-- Down
ALTER TABLE tasks ALTER COLUMN capability DROP DEFAULT;
ALTER TABLE tasks ALTER COLUMN capability SET NOT NULL;
ALTER TABLE tasks DROP COLUMN IF EXISTS prompt;
