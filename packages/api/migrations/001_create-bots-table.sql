-- Up
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE bots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  owner_email VARCHAR(255) NOT NULL,
  api_key_hash VARCHAR(64) NOT NULL UNIQUE,
  status VARCHAR(50) DEFAULT 'online'
    CHECK (status IN ('online', 'offline', 'busy', 'focus_mode')),
  capabilities JSONB NOT NULL DEFAULT '[]',
  tags TEXT[] DEFAULT '{}',
  availability JSONB,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  last_seen TIMESTAMP DEFAULT NOW(),
  UNIQUE(team_id, name)
);

CREATE INDEX idx_bots_capabilities_search ON bots USING gin((capabilities::text) gin_trgm_ops);
CREATE INDEX idx_bots_tags ON bots USING gin(tags);
CREATE INDEX idx_bots_status ON bots(status);
CREATE INDEX idx_bots_api_key_hash ON bots(api_key_hash);
CREATE INDEX idx_bots_team ON bots(team_id);

-- Down
DROP TABLE bots;
