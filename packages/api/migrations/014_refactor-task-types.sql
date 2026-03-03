-- Up
-- 014: Refactor task types — merge followup/correction into sub-task, add title
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS title VARCHAR(500);
UPDATE tasks SET type = 'sub-task' WHERE type IN ('followup', 'correction');
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_type_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_type_check CHECK (type IN ('new', 'sub-task'));

-- Down
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_type_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_type_check CHECK (type IN ('new', 'followup', 'correction', 'sub-task'));
ALTER TABLE tasks DROP COLUMN IF EXISTS title;
