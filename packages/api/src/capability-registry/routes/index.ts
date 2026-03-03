/**
 * Routes Index - Register all capability registry routes
 */

import type { FastifyPluginAsync } from 'fastify';
import type { ICapabilityRegistry } from '../interface';
import type { DatabasePool, RedisClient } from '@clawteam/api/common';
import type { IUserRepository } from '../repository';
import { createBotRoutes } from './bots';
import { createCapabilityRoutes } from './capabilities';
import { createHealthRoutes } from './health';
import { createAuthMiddleware } from '../middleware/auth';
import { isClawTeamError } from '@clawteam/api/common';

interface RoutesDeps {
  registry: ICapabilityRegistry;
  db?: DatabasePool;
  redis?: RedisClient | null;
  userRepo?: IUserRepository;
}

/**
 * Create the main routes plugin that registers all capability registry routes.
 *
 * Routes:
 * - POST /api/v1/bots/register - Register a new bot
 * - GET /api/v1/bots/:botId - Get bot information
 * - PUT /api/v1/bots/:botId/capabilities - Update bot capabilities
 * - PUT /api/v1/bots/:botId/status - Update bot status
 * - POST /api/v1/bots/:botId/heartbeat - Record heartbeat
 * - POST /api/v1/capabilities/search - Search capabilities
 * - GET /api/v1/capabilities/:capabilityName/bots - Find bots by capability
 * - GET /api/v1/capability-registry/health - Health check endpoint
 */
export function createRegistryRoutes(deps: RoutesDeps): FastifyPluginAsync {
  return async (fastify) => {
    // Decorate request with bot and authenticatedUser properties
    fastify.decorateRequest('bot', undefined as any);
    fastify.decorateRequest('authenticatedUser', undefined as any);

    // Create auth middleware (dual-mode: user key + bot key fallback)
    const authPreHandler = createAuthMiddleware(deps.registry, deps.userRepo);

    // Error handler for ClawTeamError (handles preHandler errors)
    fastify.setErrorHandler((error, _request, reply) => {
      if (isClawTeamError(error)) {
        return reply.status(error.statusCode).send({
          success: false,
          error: error.toJSON(),
        });
      }

      const err = error as Error;
      return reply.status(500).send({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err.message || 'Internal server error',
        },
      });
    });

    // Register health routes under /api/v1/capability-registry
    if (deps.db) {
      fastify.register(createHealthRoutes({ db: deps.db, redis: deps.redis ?? null }), {
        prefix: '/capability-registry',
      });
    }

    // Register bot routes under /api/v1/bots
    fastify.register(createBotRoutes({ ...deps, authPreHandler, db: deps.db }), { prefix: '/bots' });

    // Register capability routes under /api/v1/capabilities
    fastify.register(createCapabilityRoutes(deps), { prefix: '/capabilities' });
  };
}
