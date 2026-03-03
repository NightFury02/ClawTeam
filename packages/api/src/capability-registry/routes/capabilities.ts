/**
 * Capability Routes - Capability search endpoints
 */

import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import type { ApiResponse, CapabilitySearchQuery, CapabilityMatch, PaginatedResponse, Bot } from '@clawteam/shared/types';
import type { ICapabilityRegistry } from '../interface';
import { searchCapabilitiesSchema, searchCapabilitiesResponseSchema } from '../schemas/search.schema';
import { isClawTeamError } from '@clawteam/api/common';
import { randomUUID } from 'crypto';

interface CapabilityRoutesDeps {
  registry: ICapabilityRegistry;
}

interface SearchBody {
  query: string;
  filters?: {
    tags?: string[];
    maxResponseTime?: string;
    async?: boolean;
  };
  page?: number;
  pageSize?: number;
}

interface FindByCapabilityParams {
  capabilityName: string;
}

/**
 * Create capability routes plugin
 */
export function createCapabilityRoutes(deps: CapabilityRoutesDeps): FastifyPluginAsync {
  const { registry } = deps;

  return async (fastify) => {
    /**
     * POST /api/v1/capabilities/search
     * Search for capabilities
     */
    fastify.post<{ Body: SearchBody }>(
      '/search',
      {
        schema: {
          body: searchCapabilitiesSchema,
          response: {
            200: searchCapabilitiesResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const traceId = randomUUID();

        try {
          const searchQuery: CapabilitySearchQuery = {
            query: request.body.query,
            filters: request.body.filters,
            page: request.body.page,
            pageSize: request.body.pageSize,
          };

          const result = await registry.search(searchQuery);

          const response: ApiResponse<PaginatedResponse<CapabilityMatch>> = {
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
     * GET /api/v1/capabilities/:capabilityName/bots
     * Find bots by exact capability name
     */
    fastify.get<{ Params: FindByCapabilityParams }>(
      '/:capabilityName/bots',
      {
        schema: {
          params: {
            type: 'object',
            required: ['capabilityName'],
            properties: {
              capabilityName: {
                type: 'string',
                minLength: 1,
                maxLength: 255,
              },
            },
          },
        },
      },
      async (request, reply) => {
        const traceId = randomUUID();

        try {
          const bots = await registry.findByCapability(request.params.capabilityName);

          // Sanitize bots - remove apiKeyHash
          const sanitizedBots = bots.map((bot) => {
            const { apiKeyHash, ...rest } = bot as Bot & { apiKeyHash?: string };
            return rest;
          });

          const response: ApiResponse<{ bots: Omit<Bot, 'apiKeyHash'>[] }> = {
            success: true,
            data: { bots: sanitizedBots },
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
