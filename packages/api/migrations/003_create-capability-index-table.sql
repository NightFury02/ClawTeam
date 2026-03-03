-- Up
CREATE TABLE capability_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  capability_name VARCHAR(255) NOT NULL,
  capability_description TEXT,
  search_vector tsvector,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(bot_id, capability_name)
);

CREATE INDEX idx_capability_search ON capability_index USING gin(search_vector);
CREATE INDEX idx_capability_bot ON capability_index(bot_id);
CREATE INDEX idx_capability_name ON capability_index(capability_name);

-- Down
DROP TABLE capability_index;
