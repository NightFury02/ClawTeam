/**
 * Capability Registry Repository
 *
 * PostgreSQL data access layer for bots and capability indexes.
 */

import type { DatabasePool, PoolClient } from '@clawteam/api/common';
import type { Bot, BotCapability } from '@clawteam/shared/types';
import {
  BotRow,
  CapabilityIndexRow,
  BotCreateInput,
  CapabilityIndexInput,
  TeamRow,
  TeamInviteCodeRow,
  UserRow,
  botRowToBot,
} from './types';
import { BotNotFoundError, BotAlreadyExistsError } from './errors';
import { parseTimeToSeconds } from './utils/time-parser';

export interface IBotRepository {
  /** Create a new bot */
  create(input: BotCreateInput): Promise<Bot>;

  /** Find bot by ID */
  findById(botId: string): Promise<Bot | null>;

  /** Find bot by team ID and name */
  findByTeamAndName(teamId: string, name: string): Promise<Bot | null>;

  /** Find bot by API key hash */
  findByApiKeyHash(hash: string): Promise<Bot | null>;

  /** Find first bot owned by a user */
  findByUserId(userId: string): Promise<Bot | null>;

  /** Update bot fields */
  update(botId: string, fields: Partial<BotRow>): Promise<Bot>;

  /** Update bot capabilities */
  updateCapabilities(botId: string, capabilities: BotCapability[]): Promise<Bot>;

  /** Update bot status */
  updateStatus(botId: string, status: Bot['status']): Promise<void>;

  /** Update last seen timestamp */
  updateLastSeen(botId: string): Promise<void>;

  /** Delete a bot */
  delete(botId: string): Promise<void>;

  /** Search bots by text query (full-text + trigram) */
  searchByText(query: string, limit: number, offset: number): Promise<Bot[]>;

  /** Find bots by capability name */
  findByCapabilityName(capabilityName: string): Promise<Bot[]>;

  /** Find bots by tags */
  findByTags(tags: string[]): Promise<Bot[]>;

  /** Get default team (create if not exists) */
  getDefaultTeam(): Promise<TeamRow>;
}

export interface ICapabilityIndexRepository {
  /** Create index entries for a bot's capabilities */
  createBulk(entries: CapabilityIndexInput[]): Promise<void>;

  /** Delete all index entries for a bot */
  deleteByBotId(botId: string): Promise<void>;

  /** Search by text */
  search(query: string, limit: number, offset: number): Promise<CapabilityIndexRow[]>;
}

export interface IUserRepository {
  /** Find user by email */
  findByEmail(email: string): Promise<UserRow | null>;

  /** Find user by API key hash */
  findByApiKeyHash(hash: string): Promise<UserRow | null>;

  /** Create a new user */
  create(email: string, name: string): Promise<UserRow>;

  /** Find or create user by email */
  findOrCreate(email: string, name: string): Promise<UserRow>;
}

/**
 * PostgreSQL Bot Repository implementation
 */
export class BotRepository implements IBotRepository {
  constructor(private db: DatabasePool) {}

  async create(input: BotCreateInput): Promise<Bot> {
    const sql = `
      INSERT INTO bots (
        team_id, name, owner_email, api_key_hash,
        status, capabilities, tags, availability, user_id, client_type, avatar_color
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    try {
      const result = await this.db.query<BotRow>(sql, [
        input.teamId,
        input.name,
        input.ownerEmail ?? null,
        input.apiKeyHash ?? null,
        'online',
        JSON.stringify(input.capabilities),
        input.tags,
        input.availability ? JSON.stringify(input.availability) : null,
        input.userId ?? null,
        input.clientType ?? 'custom',
        input.avatarColor ?? null,
      ]);

      return botRowToBot(result.rows[0]);
    } catch (error: unknown) {
      const err = error as { code?: string };
      if (err.code === '23505') {
        // Unique violation
        throw new BotAlreadyExistsError(input.teamId, input.name);
      }
      throw error;
    }
  }

  async findById(botId: string): Promise<Bot | null> {
    const sql = `SELECT * FROM bots WHERE id = $1`;
    const result = await this.db.query<BotRow>(sql, [botId]);
    return result.rows[0] ? botRowToBot(result.rows[0]) : null;
  }

  async findByTeamAndName(teamId: string, name: string): Promise<Bot | null> {
    const sql = `SELECT * FROM bots WHERE team_id = $1 AND name = $2`;
    const result = await this.db.query<BotRow>(sql, [teamId, name]);
    return result.rows[0] ? botRowToBot(result.rows[0]) : null;
  }

  async findByApiKeyHash(hash: string): Promise<Bot | null> {
    const sql = `SELECT * FROM bots WHERE api_key_hash = $1`;
    const result = await this.db.query<BotRow>(sql, [hash]);
    return result.rows[0] ? botRowToBot(result.rows[0]) : null;
  }

  async findByUserId(userId: string): Promise<Bot | null> {
    const sql = `SELECT * FROM bots WHERE user_id = $1 ORDER BY last_seen DESC LIMIT 1`;
    const result = await this.db.query<BotRow>(sql, [userId]);
    return result.rows[0] ? botRowToBot(result.rows[0]) : null;
  }

  async update(botId: string, fields: Partial<BotRow>): Promise<Bot> {
    const updateFields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        updateFields.push(`${key} = $${paramIndex}`);
        values.push(key === 'capabilities' || key === 'availability' ? JSON.stringify(value) : value);
        paramIndex++;
      }
    }

    if (updateFields.length === 0) {
      const bot = await this.findById(botId);
      if (!bot) throw new BotNotFoundError(botId);
      return bot;
    }

    values.push(botId);
    const sql = `
      UPDATE bots
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.db.query<BotRow>(sql, values);
    if (result.rows.length === 0) {
      throw new BotNotFoundError(botId);
    }

    return botRowToBot(result.rows[0]);
  }

  async updateCapabilities(botId: string, capabilities: BotCapability[]): Promise<Bot> {
    const sql = `
      UPDATE bots
      SET capabilities = $1
      WHERE id = $2
      RETURNING *
    `;

    const result = await this.db.query<BotRow>(sql, [JSON.stringify(capabilities), botId]);
    if (result.rows.length === 0) {
      throw new BotNotFoundError(botId);
    }

    return botRowToBot(result.rows[0]);
  }

  async updateStatus(botId: string, status: Bot['status']): Promise<void> {
    const sql = `
      UPDATE bots
      SET status = $1, last_seen = NOW()
      WHERE id = $2
    `;

    const result = await this.db.query(sql, [status, botId]);
    if (result.rowCount === 0) {
      throw new BotNotFoundError(botId);
    }
  }

  async updateLastSeen(botId: string): Promise<void> {
    const sql = `UPDATE bots SET last_seen = NOW() WHERE id = $1`;
    await this.db.query(sql, [botId]);
  }

  async delete(botId: string): Promise<void> {
    const sql = `DELETE FROM bots WHERE id = $1`;
    const result = await this.db.query(sql, [botId]);
    if (result.rowCount === 0) {
      throw new BotNotFoundError(botId);
    }
  }

  async searchByText(query: string, limit: number, offset: number): Promise<Bot[]> {
    // Use full-text search with trigram similarity fallback
    const sql = `
      SELECT *,
        ts_rank(to_tsvector('english', capabilities::text || ' ' || array_to_string(tags, ' ')),
                plainto_tsquery('english', $1)) AS rank,
        similarity(capabilities::text || ' ' || array_to_string(tags, ' '), $1) AS sim
      FROM bots
      WHERE
        to_tsvector('english', capabilities::text || ' ' || array_to_string(tags, ' '))
          @@ plainto_tsquery('english', $1)
        OR
        similarity(capabilities::text || ' ' || array_to_string(tags, ' '), $1) > 0.1
      ORDER BY rank DESC, sim DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await this.db.query<BotRow>(sql, [query, limit, offset]);
    return result.rows.map(botRowToBot);
  }

  async findByCapabilityName(capabilityName: string): Promise<Bot[]> {
    const sql = `
      SELECT * FROM bots
      WHERE capabilities @> $1::jsonb
    `;

    const result = await this.db.query<BotRow>(sql, [
      JSON.stringify([{ name: capabilityName }]),
    ]);
    return result.rows.map(botRowToBot);
  }

  async findByTags(tags: string[]): Promise<Bot[]> {
    const sql = `SELECT * FROM bots WHERE tags && $1`;
    const result = await this.db.query<BotRow>(sql, [tags]);
    return result.rows.map(botRowToBot);
  }

  async getDefaultTeam(): Promise<TeamRow> {
    // Try to find existing default team
    const findSql = `SELECT * FROM teams WHERE slug = 'clawteam' LIMIT 1`;
    const result = await this.db.query<TeamRow>(findSql);
    if (result.rows.length > 0) {
      return result.rows[0];
    }

    // Create default team if not exists
    const createSql = `
      INSERT INTO teams (name, slug)
      VALUES ('ClawTeam', 'clawteam')
      ON CONFLICT (slug) DO UPDATE SET name = 'ClawTeam'
      RETURNING *
    `;
    const created = await this.db.query<TeamRow>(createSql);
    return created.rows[0];
  }
}

/**
 * PostgreSQL Capability Index Repository implementation
 */
export class CapabilityIndexRepository implements ICapabilityIndexRepository {
  constructor(private db: DatabasePool) {}

  async createBulk(entries: CapabilityIndexInput[]): Promise<void> {
    if (entries.length === 0) return;

    // Build bulk insert values
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let paramIndex = 1;

    for (const entry of entries) {
      placeholders.push(
        `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2})`
      );
      values.push(
        entry.botId,
        entry.capabilityName,
        entry.capabilityDescription
      );
      paramIndex += 3;
    }

    const sql = `
      INSERT INTO capability_index (
        bot_id, capability_name, capability_description
      )
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (bot_id, capability_name) DO UPDATE
        SET capability_description = EXCLUDED.capability_description
    `;

    await this.db.query(sql, values);
  }

  async deleteByBotId(botId: string): Promise<void> {
    const sql = `DELETE FROM capability_index WHERE bot_id = $1`;
    await this.db.query(sql, [botId]);
  }

  async search(query: string, limit: number, offset: number): Promise<CapabilityIndexRow[]> {
    const sql = `
      SELECT *
      FROM capability_index
      WHERE
        search_vector @@ plainto_tsquery('english', $1)
        OR capability_name ILIKE $2
        OR capability_description ILIKE $2
      LIMIT $3 OFFSET $4
    `;

    const result = await this.db.query<CapabilityIndexRow>(sql, [
      query,
      `%${query}%`,
      limit,
      offset,
    ]);

    return result.rows;
  }
}

/**
 * Create repository factory functions
 */
export function createBotRepository(db: DatabasePool): IBotRepository {
  return new BotRepository(db);
}

export function createCapabilityIndexRepository(db: DatabasePool): ICapabilityIndexRepository {
  return new CapabilityIndexRepository(db);
}

/**
 * PostgreSQL User Repository implementation
 */
export class UserRepository implements IUserRepository {
  constructor(private db: DatabasePool) {}

  async findByEmail(email: string): Promise<UserRow | null> {
    const sql = `SELECT * FROM users WHERE email = $1`;
    const result = await this.db.query<UserRow>(sql, [email]);
    return result.rows[0] || null;
  }

  async findByApiKeyHash(hash: string): Promise<UserRow | null> {
    const sql = `SELECT * FROM users WHERE api_key_hash = $1`;
    const result = await this.db.query<UserRow>(sql, [hash]);
    return result.rows[0] || null;
  }

  async create(email: string, name: string): Promise<UserRow> {
    const sql = `
      INSERT INTO users (email, name)
      VALUES ($1, $2)
      RETURNING *
    `;
    const result = await this.db.query<UserRow>(sql, [email, name]);
    return result.rows[0];
  }

  async findOrCreate(email: string, name: string): Promise<UserRow> {
    // Try to find existing user
    const existing = await this.findByEmail(email);
    if (existing) {
      return existing;
    }

    // Create new user
    return await this.create(email, name);
  }
}

export function createUserRepository(db: DatabasePool): IUserRepository {
  return new UserRepository(db);
}
