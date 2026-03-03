/**
 * Mock Capability Registry Implementation
 *
 * In-memory implementation for testing and parallel development.
 * Satisfies the ICapabilityRegistry interface.
 */

import type {
  Bot,
  BotCapability,
  CapabilitySearchQuery,
  CapabilityMatch,
  PaginatedResponse,
} from '@clawteam/shared/types';
import type {
  ICapabilityRegistry,
  BotRegisterRequest,
  BotRegisterResponse,
  CapabilityUpdateResponse,
  HeartbeatResponse,
} from './interface';
import { BotNotFoundError } from './errors';
import { scoreCapabilityMatch } from './utils/similarity';
import { isWithinTimeLimit } from './utils/time-parser';
import type { UserRow } from './types';
import { hashApiKey } from './utils/api-key';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MIN_CONFIDENCE_SCORE } from './constants';

/**
 * MockCapabilityRegistry - In-memory implementation.
 *
 * Usage:
 * ```typescript
 * const registry = new MockCapabilityRegistry();
 * const result = await registry.register({
 *   name: 'test-bot',
 *   ownerEmail: 'test@example.com',
 *   capabilities: [{ name: 'search', description: 'Search code', parameters: {}, async: false, estimatedTime: '5s' }],
 * });
 * ```
 */
export class MockCapabilityRegistry implements ICapabilityRegistry {
  private bots = new Map<string, Bot>();
  private botApiKeys = new Map<string, string>(); // botId → plaintext key (test only)
  private defaultTeam = { teamId: 'team-001', slug: 'clawteam' };
  private counter = 0;

  constructor() {}

  async register(req: BotRegisterRequest, _authenticatedUser?: UserRow): Promise<BotRegisterResponse> {
    const team = this.defaultTeam;

    const botId = `bot-${++this.counter}`;
    // Generate internal key for validateApiKey to work in tests
    const internalKey = `clawteam_${team.slug}_${req.name}_mock${botId}`;

    const bot: Bot = {
      id: botId,
      teamId: team.teamId,
      name: req.name,
      ownerEmail: req.ownerEmail,
      apiKeyHash: hashApiKey(internalKey),
      status: 'online',
      capabilities: req.capabilities,
      tags: req.tags ?? [],
      availability: req.availability ?? {
        timezone: 'UTC',
        workingHours: '00:00-24:00',
        autoRespond: false,
      },
      createdAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    };

    this.bots.set(botId, bot);
    this.botApiKeys.set(botId, internalKey);

    return {
      botId,
    };
  }

  async updateCapabilities(botId: string, capabilities: BotCapability[]): Promise<CapabilityUpdateResponse> {
    const bot = this.bots.get(botId);
    if (!bot) throw new BotNotFoundError(botId);

    bot.capabilities = capabilities;
    this.bots.set(botId, bot);

    return {
      botId,
      capabilitiesCount: capabilities.length,
      updatedAt: new Date().toISOString(),
    };
  }

  async getBot(botId: string): Promise<Bot | null> {
    return this.bots.get(botId) ?? null;
  }

  async search(query: CapabilitySearchQuery): Promise<PaginatedResponse<CapabilityMatch>> {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

    const allMatches: CapabilityMatch[] = [];

    for (const bot of this.bots.values()) {
      if (bot.status === 'offline') continue;

      for (const cap of bot.capabilities) {
        // Apply filters
        if (query.filters) {
          if (query.filters.tags?.length) {
            if (!query.filters.tags.some((t) => bot.tags.includes(t))) continue;
          }
          if (query.filters.maxResponseTime) {
            if (!isWithinTimeLimit(cap.estimatedTime, query.filters.maxResponseTime)) continue;
          }
          if (query.filters.async !== undefined && cap.async !== query.filters.async) continue;
        }

        const confidence = scoreCapabilityMatch(cap.name, cap.description, bot.tags, query.query);
        if (confidence < MIN_CONFIDENCE_SCORE) continue;

        allMatches.push({
          botId: bot.id,
          botName: bot.name,
          ownerEmail: bot.ownerEmail,
          capability: cap,
          confidence: Math.round(confidence * 100) / 100,
          lastModified: bot.lastSeen,
        });
      }
    }

    allMatches.sort((a, b) => b.confidence - a.confidence);

    const start = (page - 1) * pageSize;
    const items = allMatches.slice(start, start + pageSize);

    return {
      items,
      total: allMatches.length,
      page,
      pageSize,
      hasMore: start + pageSize < allMatches.length,
    };
  }

  async findByCapability(capabilityName: string): Promise<Bot[]> {
    const result: Bot[] = [];
    for (const bot of this.bots.values()) {
      if (bot.capabilities.some((c) => c.name === capabilityName)) {
        result.push(bot);
      }
    }
    return result;
  }

  async updateStatus(botId: string, status: Bot['status']): Promise<void> {
    const bot = this.bots.get(botId);
    if (!bot) throw new BotNotFoundError(botId);
    bot.status = status;
    this.bots.set(botId, bot);
  }

  async heartbeat(botId: string): Promise<HeartbeatResponse> {
    const bot = this.bots.get(botId);
    if (!bot) throw new BotNotFoundError(botId);
    bot.lastSeen = new Date().toISOString();
    this.bots.set(botId, bot);

    return {
      botId: bot.id,
      status: bot.status,
      lastSeen: bot.lastSeen,
    };
  }

  async validateApiKey(apiKey: string): Promise<Bot | null> {
    const hash = hashApiKey(apiKey);
    for (const bot of this.bots.values()) {
      if (bot.apiKeyHash === hash) {
        return bot;
      }
    }
    return null;
  }

  // Test helpers

  /** Set the default team for bot registration */
  addInviteCode(code: string, teamId: string, slug: string): void {
    this.defaultTeam = { teamId, slug };
  }

  /** Get all registered bots */
  getAllBots(): Bot[] {
    return Array.from(this.bots.values());
  }

  /** Get bot count */
  getBotCount(): number {
    return this.bots.size;
  }

  /** Reset all state */
  reset(): void {
    this.bots.clear();
    this.botApiKeys.clear();
    this.counter = 0;
    this.defaultTeam = { teamId: 'team-001', slug: 'clawteam' };
  }

  /** Get internal API key for a bot (test helper) */
  getApiKeyForBot(botId: string): string | null {
    return this.botApiKeys.get(botId) ?? null;
  }
}
