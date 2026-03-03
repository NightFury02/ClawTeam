-- Up
-- 插入默认团队和永久邀请码
-- 邀请码 CLAWTEAM2025 无使用次数限制、无过期时间

INSERT INTO teams (name, slug)
VALUES ('ClawTeam', 'clawteam')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO team_invite_codes (team_id, code, created_by)
SELECT id, 'CLAWTEAM2025', 'system'
FROM teams WHERE slug = 'clawteam'
ON CONFLICT (code) DO NOTHING;

-- Down
DELETE FROM team_invite_codes WHERE code = 'CLAWTEAM2025';
DELETE FROM teams WHERE slug = 'clawteam';
