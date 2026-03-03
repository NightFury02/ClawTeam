/**
 * Integration Test Setup Utilities
 *
 * This module provides reusable utilities for integration tests across all modules.
 *
 * Usage in Task Coordinator:
 * ```typescript
 * import {
 *   getTestDatabase,
 *   cleanDatabase,
 *   seedTestTeam,
 *   registerTestBot,
 *   closeTestDatabase,
 * } from '@clawteam/api/capability-registry/__tests__/integration/setup';
 * ```
 */

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import type { FastifyInstance } from 'fastify';
import type { BotCapability } from '@clawteam/shared/types';
import type { DatabasePool } from '@clawteam/api/common';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/clawteam';

let pool: Pool | null = null;
let dbPool: DatabasePool | null = null;

/**
 * Get or create a test database connection pool that satisfies DatabasePool interface.
 */
export function getTestDatabase(): DatabasePool {
  if (!dbPool) {
    pool = new Pool({ connectionString: DATABASE_URL });

    dbPool = {
      query: <T extends QueryResultRow = QueryResultRow>(
        text: string,
        values?: unknown[]
      ): Promise<QueryResult<T>> => {
        return pool!.query<T>(text, values);
      },
      getClient: (): Promise<PoolClient> => {
        return pool!.connect();
      },
      transaction: async <T>(fn: (client: PoolClient) => Promise<T>): Promise<T> => {
        const client = await pool!.connect();
        try {
          await client.query('BEGIN');
          const result = await fn(client);
          await client.query('COMMIT');
          return result;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      },
      close: async (): Promise<void> => {
        await pool!.end();
      },
      isConnected: (): boolean => {
        return pool !== null;
      },
    };
  }
  return dbPool;
}

/**
 * Clean all tables in dependency order (respecting foreign keys).
 * Uses TRUNCATE CASCADE for clean slate and resets auto-increment sequences.
 */
export async function cleanDatabase(): Promise<void> {
  const db = getTestDatabase();
  // Use TRUNCATE CASCADE to force delete all data regardless of FK constraints
  // RESTART IDENTITY resets auto-increment sequences
  // This is safe for test environments
  await db.query('TRUNCATE TABLE tasks, capability_index, bots, users, team_invite_codes, teams RESTART IDENTITY CASCADE');
}

/**
 * Seed a test team.
 * Returns the team ID.
 *
 * This function is idempotent using INSERT...ON CONFLICT.
 */
export async function seedTestTeam(): Promise<{ teamId: string }> {
  const db = getTestDatabase();

  // Use a transaction to ensure atomicity
  return await db.transaction(async (client) => {
    // Insert or update team (UPSERT)
    const teamResult = await client.query(
      `INSERT INTO teams (name, slug, created_at, updated_at)
       VALUES ('Test Team', 'test-team', NOW(), NOW())
       ON CONFLICT (slug) DO UPDATE
       SET name = EXCLUDED.name, updated_at = NOW()
       RETURNING id`
    );
    const teamId = teamResult.rows[0].id;

    return { teamId };
  });
}

/**
 * Seed a test user with a known API key for integration tests.
 * Returns the plaintext API key.
 */
export async function seedTestUser(): Promise<{ apiKey: string }> {
  const db = getTestDatabase();
  const apiKey = 'clawteam_integration_test_key';
  // SHA-256 hash of the key
  const crypto = await import('crypto');
  const hash = crypto.createHash('sha256').update(apiKey).digest('hex');

  await db.query(
    `INSERT INTO users (name, email, api_key_hash)
     VALUES ('integration-test', 'integration@test.com', $1)
     ON CONFLICT (api_key_hash) DO NOTHING`,
    [hash]
  );

  return { apiKey };
}

/**
 * Default capability used when none is provided to registerTestBot.
 */
const DEFAULT_CAPABILITY: BotCapability = {
  name: 'test_capability',
  description: 'Default test capability',
  async: false,
  estimatedTime: '5s',
};

/**
 * Register a test bot via the API (for use in integration tests).
 * Requires a seed user to be created first via seedTestUser().
 *
 * @param fastify - Fastify instance with routes registered
 * @param options - Bot registration options
 * @param authKey - API key for authentication
 * @returns Bot ID
 */
export async function registerTestBot(
  fastify: FastifyInstance,
  options: {
    name: string;
    capabilities?: BotCapability[];
    ownerEmail?: string;
    tags?: string[];
  },
  authKey?: string,
): Promise<{ botId: string; apiKey: string }> {
  const headers: Record<string, string> = {};
  if (authKey) {
    headers.authorization = `Bearer ${authKey}`;
  }

  const response = await fastify.inject({
    method: 'POST',
    url: '/api/v1/bots/register',
    headers,
    payload: {
      name: options.name,
      capabilities: options.capabilities || [DEFAULT_CAPABILITY],
      ...(options.tags ? { tags: options.tags } : {}),
    },
  });

  if (response.statusCode !== 201) {
    throw new Error(`Failed to register bot: ${response.statusCode} ${response.payload}`);
  }

  const data = JSON.parse(response.payload).data;
  return { botId: data.botId, apiKey: authKey || '' };
}

/**
 * Close the test database connection pool.
 */
export async function closeTestDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    dbPool = null;
  }
}
