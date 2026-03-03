/**
 * Capability Registry Internal Types
 */

import type { Bot, BotCapability, BotAvailability } from '@clawteam/shared/types';

/**
 * Database row representation of a Bot
 */
export interface BotRow {
  id: string;
  team_id: string;
  name: string;
  owner_email: string | null;
  api_key_hash: string | null;
  status: Bot['status'];
  capabilities: BotCapability[];
  tags: string[];
  availability: BotAvailability | null;
  created_at: Date;
  last_seen: Date | null;
  user_id: string | null;
  client_type: 'openclaw' | 'custom' | 'sdk';
  avatar_color: string | null;
  avatar_url: string | null;
}

/**
 * Database row representation of a capability index entry
 */
export interface CapabilityIndexRow {
  id: string;
  bot_id: string;
  capability_name: string;
  capability_description: string | null;
  search_vector: string | null;
  created_at: Date;
}

/**
 * Bot create input for repository
 */
export interface BotCreateInput {
  teamId: string;
  name: string;
  ownerEmail?: string | null;
  apiKeyHash?: string | null;
  capabilities: BotCapability[];
  tags: string[];
  availability: BotAvailability | null;
  userId?: string | null;
  clientType?: 'openclaw' | 'custom' | 'sdk';
  avatarColor?: string | null;
}

/**
 * Capability index entry for repository
 */
export interface CapabilityIndexInput {
  botId: string;
  capabilityName: string;
  capabilityDescription: string | null;
}

/**
 * Search result from database (raw)
 */
export interface RawSearchResult {
  bot: BotRow;
  rank?: number;
  similarity?: number;
}

/**
 * Cache keys structure
 */
export interface CacheKeys {
  bot: (botId: string) => string;
  botByTeamAndName: (teamId: string, name: string) => string;
  search: (queryHash: string) => string;
  capability: (capabilityName: string) => string;
}

/**
 * Team row (simplified for invite code validation)
 */
export interface TeamRow {
  id: string;
  name: string;
  slug: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * Team invite code row
 */
export interface TeamInviteCodeRow {
  id: string;
  code: string;
  team_id: string;
  created_by: string;
  expires_at: Date | null;
  max_uses: number | null;
  use_count: number;
}

/**
 * User row
 */
export interface UserRow {
  id: string;
  email: string;
  name: string;
  api_key_hash: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Team member row
 */
export interface TeamMemberRow {
  team_id: string;
  user_id: string;
  role: string;
  joined_at: Date;
}

/**
 * Convert BotRow to shared Bot type
 */
export function botRowToBot(row: BotRow): Bot {
  return {
    id: row.id,
    teamId: row.team_id,
    name: row.name,
    ownerEmail: row.owner_email ?? '',
    apiKeyHash: row.api_key_hash ?? '',
    status: row.status,
    capabilities: row.capabilities,
    tags: row.tags,
    availability: row.availability ?? {
      timezone: 'UTC',
      workingHours: '00:00-24:00',
      autoRespond: false,
    },
    createdAt: row.created_at.toISOString(),
    lastSeen: row.last_seen?.toISOString() ?? row.created_at.toISOString(),
    avatarColor: row.avatar_color ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
  };
}

/**
 * Convert shared Bot type to partial BotRow (for updates)
 */
export function botToBotRow(bot: Partial<Bot>): Partial<BotRow> {
  const row: Partial<BotRow> = {};
  if (bot.teamId !== undefined) row.team_id = bot.teamId;
  if (bot.name !== undefined) row.name = bot.name;
  if (bot.ownerEmail !== undefined) row.owner_email = bot.ownerEmail;
  if (bot.apiKeyHash !== undefined) row.api_key_hash = bot.apiKeyHash;
  if (bot.status !== undefined) row.status = bot.status;
  if (bot.capabilities !== undefined) row.capabilities = bot.capabilities;
  if (bot.tags !== undefined) row.tags = bot.tags;
  if (bot.availability !== undefined) row.availability = bot.availability;
  return row;
}
