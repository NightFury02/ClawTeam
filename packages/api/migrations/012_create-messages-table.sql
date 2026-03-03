-- Up
-- Message 收件箱系统 v0.1.0
-- 创建 messages 表，支持 bot 间直接消息和任务通知

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_bot_id UUID NOT NULL,
  to_bot_id UUID NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'direct_message',
  content_type VARCHAR(20) NOT NULL DEFAULT 'text',
  content JSONB NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'normal',
  status VARCHAR(20) NOT NULL DEFAULT 'delivered',
  task_id UUID,
  trace_id UUID,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  read_at TIMESTAMP,
  CONSTRAINT messages_type_check CHECK (type IN ('direct_message', 'task_notification', 'broadcast', 'system')),
  CONSTRAINT messages_content_type_check CHECK (content_type IN ('text', 'json', 'file', 'image')),
  CONSTRAINT messages_priority_check CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  CONSTRAINT messages_status_check CHECK (status IN ('delivered', 'read', 'expired'))
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_messages_to_bot ON messages(to_bot_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_from_bot ON messages(from_bot_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_task ON messages(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);

-- 注释
COMMENT ON TABLE messages IS 'Bot 间消息收件箱';
COMMENT ON COLUMN messages.from_bot_id IS '发送方 Bot ID';
COMMENT ON COLUMN messages.to_bot_id IS '接收方 Bot ID';
COMMENT ON COLUMN messages.type IS '消息类型: direct_message, task_notification, broadcast, system';
COMMENT ON COLUMN messages.content_type IS '内容类型: text, json, file, image';
COMMENT ON COLUMN messages.content IS '消息内容（JSONB）';
COMMENT ON COLUMN messages.priority IS '优先级: low, normal, high, urgent';
COMMENT ON COLUMN messages.status IS '状态: delivered, read, expired';
COMMENT ON COLUMN messages.task_id IS '关联任务 ID（task_notification 类型时使用）';
COMMENT ON COLUMN messages.trace_id IS '追踪 ID';

-- Down
DROP INDEX IF EXISTS idx_messages_created_at;
DROP INDEX IF EXISTS idx_messages_task;
DROP INDEX IF EXISTS idx_messages_from_bot;
DROP INDEX IF EXISTS idx_messages_to_bot;
DROP TABLE IF EXISTS messages;
