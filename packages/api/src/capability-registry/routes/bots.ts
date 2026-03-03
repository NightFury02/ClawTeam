/**
 * Bot Routes - Bot registration and management endpoints
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply, preHandlerHookHandler } from 'fastify';
import type { ApiResponse } from '@clawteam/shared/types';
import type { ICapabilityRegistry, BotRegisterRequest, BotRegisterResponse, CapabilityUpdateResponse, HeartbeatResponse } from '../interface';
import type { BotCapability, Bot } from '@clawteam/shared/types';
import { registerBotSchema, registerBotResponseSchema } from '../schemas/register.schema';
import {
  updateCapabilitiesSchema,
  updateCapabilitiesResponseSchema,
  updateStatusSchema,
  botParamsSchema,
} from '../schemas/update.schema';
import { isClawTeamError } from '@clawteam/api/common';
import { randomUUID } from 'crypto';

interface BotRoutesDeps {
  registry: ICapabilityRegistry;
  authPreHandler?: preHandlerHookHandler;
  db?: any; // Database pool for listing all bots
}

interface RegisterBody {
  name: string;
  ownerEmail?: string;
  capabilities: BotCapability[];
  tags?: string[];
  availability?: {
    timezone: string;
    workingHours: string;
    autoRespond: boolean;
  };
}

interface UpdateCapabilitiesBody {
  capabilities: BotCapability[];
}

interface UpdateStatusBody {
  status: Bot['status'];
}

interface BotParams {
  botId: string;
}

/**
 * Create bot routes plugin
 */
export function createBotRoutes(deps: BotRoutesDeps): FastifyPluginAsync {
  const { registry, authPreHandler, db } = deps;

  return async (fastify) => {
    /**
     * GET /api/v1/bots
     * List all bots
     */
    fastify.get(
      '/',
      async (request, reply) => {
        const traceId = randomUUID();

        try {
          if (db) {
            // Query all bots from database
            const result = await db.query(
              'SELECT id, name, owner_email, team_id, status, capabilities, tags, last_seen, created_at, avatar_color, avatar_url FROM bots ORDER BY created_at DESC LIMIT 100'
            );

            // Convert snake_case to camelCase
            const bots = result.rows.map((row: any) => ({
              id: row.id,
              name: row.name,
              ownerEmail: row.owner_email,
              teamId: row.team_id,
              status: row.status,
              capabilities: row.capabilities || [],
              tags: row.tags || [],
              lastSeen: row.last_seen,
              createdAt: row.created_at,
              avatarColor: row.avatar_color || undefined,
              avatarUrl: row.avatar_url || undefined,
            }));

            return reply.send(bots);
          }

          // Fallback: return empty array
          return reply.send([]);
        } catch (error) {
          return handleError(error, reply, traceId);
        }
      }
    );

    /**
     * GET /api/v1/bots/me
     * Identify the caller by API key, return bot info + all bots owned by the same user
     */
    fastify.get(
      '/me',
      {
        ...(authPreHandler ? { preHandler: authPreHandler } : {}),
      },
      async (request, reply) => {
        const traceId = randomUUID();

        try {
          const bot = request.bot;
          const user = request.authenticatedUser;

          if (!bot && !user) {
            return reply.status(401).send({
              success: false,
              error: { code: 'UNAUTHORIZED', message: 'Valid API key required' },
              traceId,
            });
          }

          // Find all bots owned by this user
          let ownedBots: any[] = [];
          const queryCondition = user
            ? { sql: 'WHERE user_id = $1', param: user.id }
            : bot?.ownerEmail
              ? { sql: 'WHERE owner_email = $1', param: bot.ownerEmail }
              : null;

          if (db && queryCondition) {
            const result = await db.query(
              `SELECT id, name, owner_email, team_id, status, capabilities, tags, last_seen, created_at, avatar_color, avatar_url FROM bots ${queryCondition.sql} ORDER BY created_at DESC`,
              [queryCondition.param]
            );
            ownedBots = result.rows.map((row: any) => ({
              id: row.id,
              name: row.name,
              ownerEmail: row.owner_email,
              teamId: row.team_id,
              status: row.status,
              capabilities: row.capabilities || [],
              tags: row.tags || [],
              lastSeen: row.last_seen,
              createdAt: row.created_at,
              avatarColor: row.avatar_color || undefined,
              avatarUrl: row.avatar_url || undefined,
            }));
          }

          // For user-level auth, use the first owned bot as currentBot
          const currentBot = bot || (ownedBots.length > 0 ? ownedBots[0] : null);
          const ownerEmail = user?.email || bot?.ownerEmail;

          return reply.send({
            success: true,
            data: {
              currentBot: currentBot ? {
                id: currentBot.id,
                name: currentBot.name,
                ownerEmail: currentBot.ownerEmail || ownerEmail,
                teamId: currentBot.teamId,
                status: currentBot.status,
                avatarColor: currentBot.avatarColor,
                avatarUrl: currentBot.avatarUrl,
              } : null,
              ownerEmail,
              ownedBots,
            },
            traceId,
          });
        } catch (error) {
          return handleError(error, reply, traceId);
        }
      }
    );

    /**
     * POST /api/v1/bots/register
     * Register a new bot
     */
    fastify.post<{ Body: RegisterBody }>(
      '/register',
      {
        schema: {
          body: registerBotSchema,
          response: {
            200: registerBotResponseSchema,
          },
        },
        ...(authPreHandler ? { preHandler: authPreHandler } : {}),
      },
      async (request, reply) => {
        const traceId = randomUUID();

        try {
          const result = await registry.register(request.body, request.authenticatedUser);

          const response: ApiResponse<BotRegisterResponse> = {
            success: true,
            data: result,
            traceId,
          };

          return reply.status(201).send(response);
        } catch (error) {
          return handleError(error, reply, traceId);
        }
      }
    );

    /**
     * GET /api/v1/bots/:botId
     * Get bot information
     */
    fastify.get<{ Params: BotParams }>(
      '/:botId',
      {
        schema: {
          params: botParamsSchema,
        },
      },
      async (request, reply) => {
        const traceId = randomUUID();

        try {
          const bot = await registry.getBot(request.params.botId);

          if (!bot) {
            return reply.status(404).send({
              success: false,
              error: {
                code: 'BOT_NOT_FOUND',
                message: `Bot not found: ${request.params.botId}`,
              },
              traceId,
            });
          }

          // Don't expose apiKeyHash
          const sanitizedBot = { ...bot };
          delete (sanitizedBot as Partial<Bot> & { apiKeyHash?: string }).apiKeyHash;

          const response: ApiResponse<Omit<Bot, 'apiKeyHash'>> = {
            success: true,
            data: sanitizedBot as Omit<Bot, 'apiKeyHash'>,
            traceId,
          };

          return reply.send(response);
        } catch (error) {
          return handleError(error, reply, traceId);
        }
      }
    );

    /**
     * PUT /api/v1/bots/:botId/capabilities
     * Update bot capabilities
     */
    fastify.put<{ Params: BotParams; Body: UpdateCapabilitiesBody }>(
      '/:botId/capabilities',
      {
        schema: {
          params: botParamsSchema,
          body: updateCapabilitiesSchema,
          response: {
            200: updateCapabilitiesResponseSchema,
          },
        },
        ...(authPreHandler ? { preHandler: authPreHandler } : {}),
      },
      async (request, reply) => {
        const traceId = randomUUID();

        try {
          const result = await registry.updateCapabilities(
            request.params.botId,
            request.body.capabilities
          );

          const response: ApiResponse<CapabilityUpdateResponse> = {
            success: true,
            data: result,
            traceId,
          };

          return reply.send(response);
        } catch (error) {
          return handleError(error, reply, traceId);
        }
      }
    );

    /**
     * PUT /api/v1/bots/:botId/status
     * Update bot status
     */
    fastify.put<{ Params: BotParams; Body: UpdateStatusBody }>(
      '/:botId/status',
      {
        schema: {
          params: botParamsSchema,
          body: updateStatusSchema,
        },
        ...(authPreHandler ? { preHandler: authPreHandler } : {}),
      },
      async (request, reply) => {
        const traceId = randomUUID();

        try {
          await registry.updateStatus(request.params.botId, request.body.status);

          const response: ApiResponse<{ botId: string; status: string }> = {
            success: true,
            data: {
              botId: request.params.botId,
              status: request.body.status,
            },
            traceId,
          };

          return reply.send(response);
        } catch (error) {
          return handleError(error, reply, traceId);
        }
      }
    );

    /**
     * POST /api/v1/bots/:botId/heartbeat
     * Record bot heartbeat
     */
    fastify.post<{ Params: BotParams }>(
      '/:botId/heartbeat',
      {
        schema: {
          params: botParamsSchema,
        },
        ...(authPreHandler ? { preHandler: authPreHandler } : {}),
      },
      async (request, reply) => {
        const traceId = randomUUID();

        try {
          const result = await registry.heartbeat(request.params.botId);

          const response: ApiResponse<HeartbeatResponse> = {
            success: true,
            data: result,
            traceId,
          };

          return reply.send(response);
        } catch (error) {
          return handleError(error, reply, traceId);
        }
      }
    );
  };
}

/**
 * Handle errors and send appropriate response
 */
function handleError(error: unknown, reply: FastifyReply, traceId: string): FastifyReply {
  if (isClawTeamError(error)) {
    return reply.status(error.statusCode).send({
      success: false,
      error: error.toJSON(),
      traceId,
    });
  }

  // Unknown error
  const err = error as Error;
  return reply.status(500).send({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: err.message || 'Internal server error',
    },
    traceId,
  });
}
