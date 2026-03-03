-- Up
CREATE TABLE team_invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  code VARCHAR(32) NOT NULL UNIQUE,
  created_by VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP,
  max_uses INT,
  use_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_invite_codes_code ON team_invite_codes(code);
CREATE INDEX idx_invite_codes_team ON team_invite_codes(team_id);

-- Down
DROP TABLE team_invite_codes;
