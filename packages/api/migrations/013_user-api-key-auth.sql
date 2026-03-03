-- Up
-- 用户级 API Key 认证
-- users 表添加 api_key_hash 列，bots 表 owner_email/api_key_hash 改为可空

-- 1. users 表添加 api_key_hash
ALTER TABLE users ADD COLUMN IF NOT EXISTS api_key_hash VARCHAR(64) UNIQUE;
CREATE INDEX IF NOT EXISTS idx_users_api_key_hash ON users(api_key_hash);

-- 2. bots 表: owner_email 和 api_key_hash 改为可空（新注册的 bot 不再生成独立 key）
ALTER TABLE bots ALTER COLUMN owner_email DROP NOT NULL;
ALTER TABLE bots ALTER COLUMN api_key_hash DROP NOT NULL;

-- 3. Seed 测试用户（本地开发用，api_key = 'clawteam_dev_test_key'）
INSERT INTO users (name, email, api_key_hash)
VALUES ('dev', 'dev@test.com', encode(sha256('clawteam_dev_test_key'::bytea), 'hex'))
ON CONFLICT DO NOTHING;

-- Down
DELETE FROM users WHERE email = 'dev@test.com' AND name = 'dev';
ALTER TABLE bots ALTER COLUMN api_key_hash SET NOT NULL;
ALTER TABLE bots ALTER COLUMN owner_email SET NOT NULL;
DROP INDEX IF EXISTS idx_users_api_key_hash;
ALTER TABLE users DROP COLUMN IF EXISTS api_key_hash;
