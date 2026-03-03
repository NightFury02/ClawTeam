-- Up
-- 添加 bot 头像相关字段
-- 用于 Dashboard 显示 bot 头像颜色和自定义头像

ALTER TABLE bots ADD COLUMN IF NOT EXISTS avatar_color VARCHAR(50);
ALTER TABLE bots ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 注释
COMMENT ON COLUMN bots.avatar_color IS 'Bot 头像背景色 (hex 或 CSS 颜色名)';
COMMENT ON COLUMN bots.avatar_url IS 'Bot 自定义头像 URL';

-- Down
ALTER TABLE bots DROP COLUMN IF EXISTS avatar_url;
ALTER TABLE bots DROP COLUMN IF EXISTS avatar_color;
