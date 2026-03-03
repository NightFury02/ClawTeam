/**
 * Authentication Middleware
 *
 * Dual-mode: validates API key from Authorization header.
 * 1. Try user-level key (users table) → sets request.authenticatedUser
 * 2. Fallback to bot-level key (bots table) → sets request.bot
 */

import type { FastifyRequest, FastifyReply, preHandlerHookHandler } from 'fastify';
import type { Bot } from '@clawteam/shared/types';
import type { ICapabilityRegistry } from '../interface';
import type { IUserRepository } from '../repository';
import type { UserRow } from '../types';
import { AuthenticationError } from '@clawteam/api/common';
import { InvalidApiKeyError } from '../errors';
import { hashApiKey } from '../utils/api-key';

// Augment FastifyRequest to include bot and authenticatedUser
declare module 'fastify' {
  interface FastifyRequest {
    bot?: Bot;
    authenticatedUser?: UserRow;
  }
}

/**
 * Create an authentication middleware that validates API keys.
 *
 * Dual-mode:
 * 1. Hash the key → look up in users table (user-level key)
 * 2. If not found, validate against bots table (bot-level key, backward compat)
 */
export function createAuthMiddleware(
  registry: ICapabilityRegistry,
  userRepo?: IUserRepository,
): preHandlerHookHandler {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new AuthenticationError('Missing Authorization header');
    }

    if (!authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('Invalid Authorization header format. Expected: Bearer <api-key>');
    }

    const apiKey = authHeader.slice(7);

    if (!apiKey) {
      throw new AuthenticationError('Missing API key in Authorization header');
    }

    // 1. Try user-level key
    if (userRepo) {
      const hash = hashApiKey(apiKey);
      const user = await userRepo.findByApiKeyHash(hash);
      if (user) {
        request.authenticatedUser = user;
        return;
      }
    }

    // 2. Fallback to bot-level key
    const bot = await registry.validateApiKey(apiKey);

    if (!bot) {
      throw new InvalidApiKeyError();
    }

    request.bot = bot;
  };
}
