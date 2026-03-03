/**
 * Capability Registry Module
 *
 * Bot 能力注册和发现服务
 *
 * @module capability-registry
 */

// Interface
export type {
  ICapabilityRegistry,
  BotRegisterRequest,
  BotRegisterResponse,
  CapabilityUpdateResponse,
  HeartbeatResponse,
} from './interface';

// Types
export type {
  BotRow,
  CapabilityIndexRow,
  BotCreateInput,
  CapabilityIndexInput,
  TeamRow,
  TeamInviteCodeRow,
  UserRow,
  TeamMemberRow,
} from './types';
export { botRowToBot, botToBotRow } from './types';

// Errors
export {
  RegistryError,
  BotNotFoundError,
  BotAlreadyExistsError,
  InvalidApiKeyError,
  CapabilityValidationError,
  SearchError,
  IndexError,
} from './errors';

// Constants
export * from './constants';

// Utils
export { generateApiKey, hashApiKey, verifyApiKey, parseApiKey, generateClaimToken } from './utils/api-key';
export { parseTimeToSeconds, formatSecondsToTime, isWithinTimeLimit } from './utils/time-parser';
export { calculateSimilarity, scoreCapabilityMatch, levenshteinDistance, tokenize } from './utils/similarity';

// Repository
export type { IBotRepository, ICapabilityIndexRepository, IUserRepository } from './repository';
export { BotRepository, CapabilityIndexRepository, UserRepository, createBotRepository, createCapabilityIndexRepository, createUserRepository } from './repository';

// Cache
export type { IRegistryCache } from './cache';
export { RegistryCache, NullCache, createRegistryCache } from './cache';

// Core logic
export { BotRegistrar, type BotRegistrarDeps } from './registry';
export { CapabilitySearcher, type CapabilitySearcherDeps } from './searcher';

// Mock implementation
export { MockCapabilityRegistry } from './mocks';

// Routes
export { createRegistryRoutes } from './routes';
export { createBotRoutes } from './routes/bots';
export { createCapabilityRoutes } from './routes/capabilities';

// Middleware
export { createAuthMiddleware } from './middleware/auth';

// Schemas
export { registerBotSchema, registerBotResponseSchema } from './schemas/register.schema';
export { updateCapabilitiesSchema, updateCapabilitiesResponseSchema, updateStatusSchema, botParamsSchema } from './schemas/update.schema';
export { searchCapabilitiesSchema, searchCapabilitiesResponseSchema } from './schemas/search.schema';

// Factory function to create a complete registry instance
import type { DatabasePool, RedisClient, Logger } from '@clawteam/api/common';
import type { ICapabilityRegistry } from './interface';
import { createBotRepository, createCapabilityIndexRepository, createUserRepository } from './repository';
import { createRegistryCache } from './cache';
import { BotRegistrar } from './registry';
import { CapabilitySearcher } from './searcher';

export interface CreateRegistryOptions {
  db: DatabasePool;
  redis: RedisClient | null;
  logger: Logger;
}

/**
 * Create a fully-configured capability registry instance.
 *
 * ```typescript
 * import { createCapabilityRegistry } from '@clawteam/api/capability-registry';
 * import { getDatabase, getRedis, createLogger } from '@clawteam/api/common';
 *
 * const registry = createCapabilityRegistry({
 *   db: getDatabase(),
 *   redis: getRedis(),
 *   logger: createLogger('capability-registry'),
 * });
 *
 * // Use the registry
 * const result = await registry.search({ query: 'code search' });
 * ```
 */
export function createCapabilityRegistry(options: CreateRegistryOptions): ICapabilityRegistry {
  const { db, redis, logger } = options;

  const botRepo = createBotRepository(db);
  const indexRepo = createCapabilityIndexRepository(db);
  const userRepo = createUserRepository(db);
  const cache = createRegistryCache(redis);

  const registrar = new BotRegistrar({
    botRepo,
    indexRepo,
    userRepo,
    cache,
    logger: logger,
  });

  const searcher = new CapabilitySearcher({
    botRepo,
    cache,
    logger: logger,
  });

  // Return an object that satisfies ICapabilityRegistry
  return {
    register: registrar.register.bind(registrar),
    updateCapabilities: registrar.updateCapabilities.bind(registrar),
    getBot: registrar.getBot.bind(registrar),
    updateStatus: registrar.updateStatus.bind(registrar),
    heartbeat: registrar.heartbeat.bind(registrar),
    validateApiKey: registrar.validateApiKey.bind(registrar),
    search: searcher.search.bind(searcher),
    findByCapability: searcher.findByCapability.bind(searcher),
  };
}
