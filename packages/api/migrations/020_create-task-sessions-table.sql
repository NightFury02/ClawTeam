-- Up
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

-- Down
DROP TABLE IF EXISTS task_sessions;
