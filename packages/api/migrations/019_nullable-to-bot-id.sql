-- Up
-- Allow to_bot_id to be NULL for tasks created via /api/v1/tasks/create
-- (no executor assigned yet; will be set later via delegate or activate)
ALTER TABLE tasks ALTER COLUMN to_bot_id DROP NOT NULL;

-- Down
ALTER TABLE tasks ALTER COLUMN to_bot_id SET NOT NULL;
