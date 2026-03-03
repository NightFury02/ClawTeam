-- Up
-- 016: Seed test API keys for development/testing

-- User: fei (key: clawteam_sk_24cc7be6b055132c80659c3ff13ce609)
INSERT INTO users (name, email, api_key_hash)
VALUES ('fei', 'fei@clawteam.dev', encode(sha256('clawteam_sk_24cc7be6b055132c80659c3ff13ce609'::bytea), 'hex'))
ON CONFLICT (email) DO UPDATE SET api_key_hash = EXCLUDED.api_key_hash;

-- User: alice (key: clawteam_sk_test_alice)
INSERT INTO users (name, email, api_key_hash)
VALUES ('alice', 'alice@clawteam.dev', encode(sha256('clawteam_sk_test_alice'::bytea), 'hex'))
ON CONFLICT (email) DO UPDATE SET api_key_hash = EXCLUDED.api_key_hash;

-- User: bob (key: clawteam_sk_test_bob)
INSERT INTO users (name, email, api_key_hash)
VALUES ('bob', 'bob@clawteam.dev', encode(sha256('clawteam_sk_test_bob'::bytea), 'hex'))
ON CONFLICT (email) DO UPDATE SET api_key_hash = EXCLUDED.api_key_hash;

-- Down
DELETE FROM users WHERE email IN ('fei@clawteam.dev', 'alice@clawteam.dev', 'bob@clawteam.dev');
