/**
 * CapabilitySearcher - 能力搜索逻辑
 *
 * Full-text search + similarity scoring for capability matching.
 */

import type {
  Bot,
  BotCapability,
  CapabilitySearchQuery,
  CapabilityMatch,
  PaginatedResponse,
} from '@clawteam/shared/types';
import type { Logger } from '@clawteam/api/common';
import type { IBotRepository } from './repository';
import type { IRegistryCache } from './cache';
import { scoreCapabilityMatch } from './utils/similarity';
import { parseTimeToSeconds, isWithinTimeLimit } from './utils/time-parser';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MIN_CONFIDENCE_SCORE } from './constants';

export interface CapabilitySearcherDeps {
  botRepo: IBotRepository;
  cache: IRegistryCache;
  logger: Logger;
}

/**
 * CapabilitySearcher handles search queries with filtering and scoring.
 */
export class CapabilitySearcher {
  private botRepo: IBotRepository;
  private cache: IRegistryCache;
  private logger: Logger;

  constructor(deps: CapabilitySearcherDeps) {
    this.botRepo = deps.botRepo;
    this.cache = deps.cache;
    this.logger = deps.logger;
  }

  /**
   * Search for capabilities matching a query.
   *
   * Algorithm:
   * 1. Check cache
   * 2. Full-text search in DB
   * 3. Apply filters (tags, maxResponseTime, async)
   * 4. Score each capability match
   * 5. Sort by confidence (descending)
   * 6. Paginate
   * 7. Cache results
   */
  async search(query: CapabilitySearchQuery): Promise<PaginatedResponse<CapabilityMatch>> {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

    this.logger.debug('Searching capabilities', {
      query: query.query,
      filters: query.filters,
      page,
      pageSize,
    });

    // Check cache
    const queryHash = this.cache.hashQuery(query);
    const cached = await this.cache.getSearchResults(queryHash);
    if (cached) {
      this.logger.debug('Search cache hit', { queryHash });
      return cached;
    }

    // Fetch candidate bots from DB (broad search, get more than needed)
    const candidateLimit = MAX_PAGE_SIZE * 3;
    const candidates = await this.botRepo.searchByText(query.query, candidateLimit, 0);

    // Score and filter all capabilities
    const allMatches = this.scoreAndFilterMatches(candidates, query);

    // Sort by confidence
    allMatches.sort((a, b) => b.confidence - a.confidence);

    // Paginate
    const total = allMatches.length;
    const start = (page - 1) * pageSize;
    const items = allMatches.slice(start, start + pageSize);

    const result: PaginatedResponse<CapabilityMatch> = {
      items,
      total,
      page,
      pageSize,
      hasMore: start + pageSize < total,
    };

    // Cache results
    await this.cache.setSearchResults(queryHash, result);

    this.logger.debug('Search completed', { total, returned: items.length });

    return result;
  }

  /**
   * Find bots by exact capability name (with cache).
   */
  async findByCapability(capabilityName: string): Promise<Bot[]> {
    // Check cache
    const cached = await this.cache.getBotsByCapability(capabilityName);
    if (cached) {
      return cached;
    }

    const bots = await this.botRepo.findByCapabilityName(capabilityName);
    await this.cache.setBotsByCapability(capabilityName, bots);

    return bots;
  }

  /**
   * Score and filter all capability matches from candidate bots.
   */
  private scoreAndFilterMatches(
    bots: Bot[],
    query: CapabilitySearchQuery
  ): CapabilityMatch[] {
    const matches: CapabilityMatch[] = [];

    for (const bot of bots) {
      // Only consider online/busy bots
      if (bot.status === 'offline') continue;

      for (const cap of bot.capabilities) {
        // Apply filters
        if (!this.passesFilters(cap, bot, query.filters)) continue;

        // Calculate confidence score
        const confidence = scoreCapabilityMatch(
          cap.name,
          cap.description,
          bot.tags,
          query.query
        );

        // Filter by minimum confidence
        if (confidence < MIN_CONFIDENCE_SCORE) continue;

        matches.push({
          botId: bot.id,
          botName: bot.name,
          ownerEmail: bot.ownerEmail,
          capability: cap,
          confidence: Math.round(confidence * 100) / 100,
          lastModified: bot.lastSeen,
        });
      }
    }

    return matches;
  }

  /**
   * Check if a capability passes all filters.
   */
  private passesFilters(
    capability: BotCapability,
    bot: Bot,
    filters?: CapabilitySearchQuery['filters']
  ): boolean {
    if (!filters) return true;

    // Tag filter
    if (filters.tags && filters.tags.length > 0) {
      const hasMatchingTag = filters.tags.some((tag) => bot.tags.includes(tag));
      if (!hasMatchingTag) return false;
    }

    // Max response time filter
    if (filters.maxResponseTime) {
      if (!isWithinTimeLimit(capability.estimatedTime, filters.maxResponseTime)) {
        return false;
      }
    }

    // Async filter
    if (filters.async !== undefined) {
      if (capability.async !== filters.async) return false;
    }

    return true;
  }
}
