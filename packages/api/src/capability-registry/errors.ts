/**
 * Capability Registry Error Definitions
 */

import { ClawTeamError } from '@clawteam/api/common';

/**
 * Base error for capability registry operations
 */
export class RegistryError extends ClawTeamError {
  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    details?: Record<string, unknown>
  ) {
    super(message, code, statusCode, details);
    this.name = 'RegistryError';
  }
}

/**
 * Bot not found
 */
export class BotNotFoundError extends RegistryError {
  constructor(botId: string) {
    super(`Bot not found: ${botId}`, 'BOT_NOT_FOUND', 404, { botId });
    this.name = 'BotNotFoundError';
  }
}

/**
 * Bot already exists (name + team combination)
 */
export class BotAlreadyExistsError extends RegistryError {
  constructor(teamId: string, name: string) {
    super(
      `Bot "${name}" already exists in team ${teamId}`,
      'BOT_ALREADY_EXISTS',
      409,
      { teamId, name }
    );
    this.name = 'BotAlreadyExistsError';
  }
}

/**
 * Invalid API key
 */
export class InvalidApiKeyError extends RegistryError {
  constructor() {
    super('Invalid API key', 'INVALID_API_KEY', 401);
    this.name = 'InvalidApiKeyError';
  }
}

/**
 * Capability validation error
 */
export class CapabilityValidationError extends RegistryError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CAPABILITY_VALIDATION_ERROR', 400, details);
    this.name = 'CapabilityValidationError';
  }
}

/**
 * Search error
 */
export class SearchError extends RegistryError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'SEARCH_ERROR', 500, details);
    this.name = 'SearchError';
  }
}

/**
 * Index error
 */
export class IndexError extends RegistryError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'INDEX_ERROR', 500, details);
    this.name = 'IndexError';
  }
}
