/**
 * Capability Registry Cache
 *
 * Redis caching layer for bots and search results.
 */

import type { RedisClient } from '@clawteam/api/common';
import type { Bot, CapabilityMatch, PaginatedResponse } from '@clawteam/shared/types';
import { createHash } from 'crypto';
import { CACHE_KEYS, CACHE_TTL_SECONDS, SEARCH_CACHE_TTL_SECONDS } from './constants';

export interface IRegistryCache {
  /** Get a bot by ID from cache */
  getBot(botId: string): Promise<Bot | null>;

  /** Set a bot in cache */
  setBot(bot: Bot): Promise<void>;

  /** Invalidate a bot in cache */
  invalidateBot(botId: string): Promise<void>;

  /** Get search results from cache */
  getSearchResults(queryHash: string): Promise<PaginatedResponse<CapabilityMatch> | null>;

  /** Set search results in cache */
  setSearchResults(queryHash: string, results: PaginatedResponse<CapabilityMatch>): Promise<void>;

  /** Invalidate all search cache (when capabilities change) */
  invalidateSearchCache(): Promise<void>;

  /** Get bots by capability name from cache */
  getBotsByCapability(capabilityName: string): Promise<Bot[] | null>;

  /** Set bots by capability name in cache */
  setBotsByCapability(capabilityName: string, bots: Bot[]): Promise<void>;

  /** Hash a search query for cache key */
  hashQuery(query: object): string;
}

/**
 * Redis cache implementation
 */
export class RegistryCache implements IRegistryCache {
  constructor(private redis: RedisClient) {}

  async getBot(botId: string): Promise<Bot | null> {
    const key = CACHE_KEYS.BOT + botId;
    const data = await this.redis.get(key);
    if (!data) return null;

    try {
      return JSON.parse(data) as Bot;
    } catch {
      return null;
    }
  }

  async setBot(bot: Bot): Promise<void> {
    const key = CACHE_KEYS.BOT + bot.id;
    await this.redis.set(key, JSON.stringify(bot), CACHE_TTL_SECONDS);
  }

  async invalidateBot(botId: string): Promise<void> {
    const key = CACHE_KEYS.BOT + botId;
    await this.redis.del(key);
  }

  async getSearchResults(queryHash: string): Promise<PaginatedResponse<CapabilityMatch> | null> {
    const key = CACHE_KEYS.SEARCH + queryHash;
    const data = await this.redis.get(key);
    if (!data) return null;

    try {
      return JSON.parse(data) as PaginatedResponse<CapabilityMatch>;
    } catch {
      return null;
    }
  }

  async setSearchResults(
    queryHash: string,
    results: PaginatedResponse<CapabilityMatch>
  ): Promise<void> {
    const key = CACHE_KEYS.SEARCH + queryHash;
    await this.redis.set(key, JSON.stringify(results), SEARCH_CACHE_TTL_SECONDS);
  }

  async invalidateSearchCache(): Promise<void> {
    // In production, use SCAN to find and delete keys
    // For simplicity, we rely on TTL expiration
    // A full implementation would use Redis SCAN + DELETE
  }

  async getBotsByCapability(capabilityName: string): Promise<Bot[] | null> {
    const key = CACHE_KEYS.CAPABILITY + capabilityName;
    const data = await this.redis.get(key);
    if (!data) return null;

    try {
      return JSON.parse(data) as Bot[];
    } catch {
      return null;
    }
  }

  async setBotsByCapability(capabilityName: string, bots: Bot[]): Promise<void> {
    const key = CACHE_KEYS.CAPABILITY + capabilityName;
    await this.redis.set(key, JSON.stringify(bots), CACHE_TTL_SECONDS);
  }

  hashQuery(query: object): string {
    const normalized = JSON.stringify(query, Object.keys(query).sort());
    return createHash('md5').update(normalized).digest('hex');
  }
}

/**
 * Null cache implementation (no-op, for testing without Redis)
 */
export class NullCache implements IRegistryCache {
  async getBot(): Promise<Bot | null> {
    return null;
  }

  async setBot(): Promise<void> {}

  async invalidateBot(): Promise<void> {}

  async getSearchResults(): Promise<PaginatedResponse<CapabilityMatch> | null> {
    return null;
  }

  async setSearchResults(): Promise<void> {}

  async invalidateSearchCache(): Promise<void> {}

  async getBotsByCapability(): Promise<Bot[] | null> {
    return null;
  }

  async setBotsByCapability(): Promise<void> {}

  hashQuery(query: object): string {
    const normalized = JSON.stringify(query, Object.keys(query).sort());
    return createHash('md5').update(normalized).digest('hex');
  }
}

/**
 * Create cache instance
 */
export function createRegistryCache(redis: RedisClient | null): IRegistryCache {
  if (!redis) {
    return new NullCache();
  }
  return new RegistryCache(redis);
}
