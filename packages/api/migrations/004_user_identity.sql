-- Up
-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 用户团队关系表
CREATE TABLE IF NOT EXISTS team_members (
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'member',
  joined_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (team_id, user_id)
);

-- 扩展 bots 表（注意：team_id 已存在，只需添加 user_id 和 client_type）
ALTER TABLE bots ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);
ALTER TABLE bots ADD COLUMN IF NOT EXISTS client_type VARCHAR(50) DEFAULT 'custom'
  CHECK (client_type IN ('openclaw', 'custom', 'sdk'));

-- 索引
CREATE INDEX IF NOT EXISTS idx_bots_user_id ON bots(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);

-- Down
DROP INDEX IF EXISTS idx_team_members_user;
DROP INDEX IF EXISTS idx_bots_user_id;
ALTER TABLE bots DROP COLUMN IF EXISTS client_type;
ALTER TABLE bots DROP COLUMN IF EXISTS user_id;
DROP TABLE IF EXISTS team_members;
DROP TABLE IF EXISTS users;
