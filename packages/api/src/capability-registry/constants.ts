/**
 * Capability Registry Constants
 */

/** Default page size for search results */
export const DEFAULT_PAGE_SIZE = 10;

/** Maximum page size for search results */
export const MAX_PAGE_SIZE = 50;

/** Default cache TTL in seconds (5 minutes) */
export const CACHE_TTL_SECONDS = 300;

/** Search cache TTL in seconds (1 minute) */
export const SEARCH_CACHE_TTL_SECONDS = 60;

/** Minimum confidence score to include in results */
export const MIN_CONFIDENCE_SCORE = 0.1;

/** API Key prefix */
export const API_KEY_PREFIX = 'clawteam';

/** API Key separator */
export const API_KEY_SEPARATOR = '_';

/** API Key total length (random part) */
export const API_KEY_RANDOM_LENGTH = 32;

/** Cache key prefixes */
export const CACHE_KEYS = {
  BOT: 'registry:bot:',
  BOT_BY_NAME: 'registry:bot:name:',
  SEARCH: 'registry:search:',
  CAPABILITY: 'registry:capability:',
} as const;

/** Redis Pub/Sub channels for registry events */
export const REGISTRY_CHANNELS = {
  BOT_REGISTERED: 'clawteam:registry:bot_registered',
  BOT_UPDATED: 'clawteam:registry:bot_updated',
  CAPABILITIES_UPDATED: 'clawteam:registry:capabilities_updated',
  BOT_STATUS_CHANGED: 'clawteam:registry:bot_status_changed',
} as const;

/** Bot status values */
export const BOT_STATUSES = ['online', 'offline', 'busy', 'focus_mode'] as const;

/** Time unit multipliers (in seconds) */
export const TIME_UNITS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
} as const;

/** Claim URL base path */
export const CLAIM_URL_BASE = '/claim/';

/** Maximum capabilities per bot */
export const MAX_CAPABILITIES_PER_BOT = 100;

/** Maximum tags per bot */
export const MAX_TAGS_PER_BOT = 50;

/** Heartbeat timeout (seconds) - bot considered offline after this */
export const HEARTBEAT_TIMEOUT_SECONDS = 300;
