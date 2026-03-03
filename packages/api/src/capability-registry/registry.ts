/**
 * BotRegistrar - Bot 注册逻辑
 *
 * Handles bot registration, API key generation, and capability indexing.
 */

import type { Bot, BotCapability } from '@clawteam/shared/types';
import type { Logger } from '@clawteam/api/common';
import type { IBotRepository, ICapabilityIndexRepository, IUserRepository } from './repository';
import type { IRegistryCache } from './cache';
import type { CapabilityIndexInput, UserRow } from './types';
import type { BotRegisterRequest, BotRegisterResponse, CapabilityUpdateResponse, HeartbeatResponse } from './interface';
import { hashApiKey } from './utils/api-key';
import { generateAvatarColor } from './utils/avatar';
import { BotNotFoundError, CapabilityValidationError } from './errors';
import {
  MAX_CAPABILITIES_PER_BOT,
  MAX_TAGS_PER_BOT,
} from './constants';

export interface BotRegistrarDeps {
  botRepo: IBotRepository;
  indexRepo: ICapabilityIndexRepository;
  userRepo?: IUserRepository;
  cache: IRegistryCache;
  logger: Logger;
}

/**
 * BotRegistrar handles registration, capability updates, and status management.
 */
export class BotRegistrar {
  private botRepo: IBotRepository;
  private indexRepo: ICapabilityIndexRepository;
  private userRepo?: IUserRepository;
  private cache: IRegistryCache;
  private logger: Logger;

  constructor(deps: BotRegistrarDeps) {
    this.botRepo = deps.botRepo;
    this.indexRepo = deps.indexRepo;
    this.userRepo = deps.userRepo;
    this.cache = deps.cache;
    this.logger = deps.logger;
  }

  /**
   * Register a new bot.
   *
   * 1. Validate capabilities
   * 2. Get default team
   * 3. Use authenticatedUser for userId/ownerEmail
   * 4. Create bot record (no API key generation)
   * 5. Build capability index
   * 6. Return { botId }
   */
  async register(req: BotRegisterRequest, authenticatedUser?: UserRow): Promise<BotRegisterResponse> {
    this.logger.info('Registering bot', { name: req.name, ownerEmail: req.ownerEmail, clientType: req.clientType });

    // Normalize + validate capabilities
    const capabilities = req.capabilities.map((c) => ({
      ...c,
      async: c.async ?? false,
      estimatedTime: c.estimatedTime ?? '1s',
    }));
    this.validateCapabilities(capabilities);
    this.validateTags(req.tags);

    // Get default team
    const team = await this.botRepo.getDefaultTeam();

    // Resolve userId from authenticatedUser or legacy userId field
    let userId: string | null = null;
    let ownerEmail: string | null = req.ownerEmail ?? null;

    if (authenticatedUser) {
      userId = authenticatedUser.id;
      ownerEmail = ownerEmail || authenticatedUser.email;
    } else if (req.userId && this.userRepo) {
      const userName = req.userName || (req.ownerEmail ? req.ownerEmail.split('@')[0] : req.name);
      const user = await this.userRepo.findOrCreate(req.userId, userName);
      userId = user.id;
      this.logger.info('User associated with bot', { userId: user.id, userEmail: req.userId });
    }

    // Create bot (no API key generation — user-level key handles auth)
    const bot = await this.botRepo.create({
      teamId: team.id,
      name: req.name,
      ownerEmail,
      apiKeyHash: null,
      capabilities,
      tags: req.tags ?? [],
      availability: req.availability ?? null,
      userId,
      clientType: req.clientType ?? 'custom',
      avatarColor: generateAvatarColor(req.name),
    });

    // Build capability index (async, best effort)
    this.indexCapabilities(bot).catch((err) => {
      this.logger.error('Failed to index capabilities', {
        botId: bot.id,
        error: (err as Error).message,
      });
    });

    // Cache the new bot
    await this.cache.setBot(bot);

    this.logger.info('Bot registered successfully', { botId: bot.id, name: bot.name, clientType: req.clientType });

    return {
      botId: bot.id,
    };
  }

  /**
   * Update a bot's capabilities.
   */
  async updateCapabilities(botId: string, capabilities: BotCapability[]): Promise<CapabilityUpdateResponse> {
    this.logger.info('Updating capabilities', { botId, count: capabilities.length });

    this.validateCapabilities(capabilities);

    const bot = await this.botRepo.updateCapabilities(botId, capabilities);

    // Re-index capabilities
    await this.indexRepo.deleteByBotId(botId);
    await this.indexCapabilities(bot);

    // Invalidate cache
    await this.cache.invalidateBot(botId);
    await this.cache.invalidateSearchCache();

    // Cache updated bot
    await this.cache.setBot(bot);

    return {
      botId: bot.id,
      capabilitiesCount: capabilities.length,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Get bot by ID (with cache).
   */
  async getBot(botId: string): Promise<Bot | null> {
    // Check cache first
    const cached = await this.cache.getBot(botId);
    if (cached) {
      return cached;
    }

    const bot = await this.botRepo.findById(botId);
    if (bot) {
      await this.cache.setBot(bot);
    }

    return bot;
  }

  /**
   * Update bot status.
   */
  async updateStatus(botId: string, status: Bot['status']): Promise<void> {
    this.logger.info('Updating bot status', { botId, status });
    await this.botRepo.updateStatus(botId, status);
    await this.cache.invalidateBot(botId);
  }

  /**
   * Record bot heartbeat.
   */
  async heartbeat(botId: string): Promise<HeartbeatResponse> {
    await this.botRepo.updateLastSeen(botId);

    const bot = await this.getBot(botId);
    if (!bot) {
      throw new BotNotFoundError(botId);
    }

    return {
      botId: bot.id,
      status: bot.status,
      lastSeen: new Date().toISOString(),
    };
  }

  /**
   * Validate an API key and return the associated bot.
   * Checks bot-level keys first, then falls back to user-level keys.
   * Returns null if the key is invalid.
   */
  async validateApiKey(apiKey: string): Promise<Bot | null> {
    const hash = hashApiKey(apiKey);

    // 1. Try bot-level key
    const bot = await this.botRepo.findByApiKeyHash(hash);
    if (bot) {
      await this.cache.setBot(bot);
      return bot;
    }

    // 2. Fallback: try user-level key → find their most recent bot
    if (this.userRepo) {
      const user = await this.userRepo.findByApiKeyHash(hash);
      if (user) {
        const userBot = await this.botRepo.findByUserId(user.id);
        if (userBot) {
          await this.cache.setBot(userBot);
          return userBot;
        }
      }
    }

    return null;
  }

  /**
   * Build capability index for a bot.
   */
  private async indexCapabilities(bot: Bot): Promise<void> {
    const entries: CapabilityIndexInput[] = bot.capabilities.map((cap) => ({
      botId: bot.id,
      capabilityName: cap.name,
      capabilityDescription: cap.description,
    }));

    await this.indexRepo.createBulk(entries);
  }

  /**
   * Validate capabilities.
   */
  private validateCapabilities(capabilities: BotCapability[]): void {
    if (!Array.isArray(capabilities) || capabilities.length === 0) {
      throw new CapabilityValidationError('At least one capability is required');
    }

    if (capabilities.length > MAX_CAPABILITIES_PER_BOT) {
      throw new CapabilityValidationError(
        `Maximum ${MAX_CAPABILITIES_PER_BOT} capabilities per bot`,
        { count: capabilities.length, max: MAX_CAPABILITIES_PER_BOT }
      );
    }

    const names = new Set<string>();
    for (const cap of capabilities) {
      if (!cap.name || typeof cap.name !== 'string') {
        throw new CapabilityValidationError('Capability name is required');
      }
      if (!cap.description || typeof cap.description !== 'string') {
        throw new CapabilityValidationError(`Description is required for capability "${cap.name}"`);
      }
      if (names.has(cap.name)) {
        throw new CapabilityValidationError(`Duplicate capability name: "${cap.name}"`);
      }
      names.add(cap.name);
    }
  }

  /**
   * Validate tags.
   */
  private validateTags(tags?: string[]): void {
    if (!tags) return;

    if (tags.length > MAX_TAGS_PER_BOT) {
      throw new CapabilityValidationError(
        `Maximum ${MAX_TAGS_PER_BOT} tags per bot`,
        { count: tags.length, max: MAX_TAGS_PER_BOT }
      );
    }
  }
}
