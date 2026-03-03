-- Up
-- 扩展 messages 表 type CHECK constraint，支持 human-in-the-loop 事件消息
-- human_input_request: bot 调用 /need-human-input 的事件记录
-- human_input_response: 人类回复并 resume 的事件记录

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_type_check
  CHECK (type IN ('direct_message', 'task_notification', 'broadcast', 'system', 'human_input_request', 'human_input_response'));

-- 更新注释
COMMENT ON COLUMN messages.type IS '消息类型: direct_message, task_notification, broadcast, system, human_input_request, human_input_response';

-- Down
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_type_check
  CHECK (type IN ('direct_message', 'task_notification', 'broadcast', 'system'));

COMMENT ON COLUMN messages.type IS '消息类型: direct_message, task_notification, broadcast, system';
