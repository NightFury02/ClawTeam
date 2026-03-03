/**
 * Primitive Metadata Routes - 原语元数据查询 API
 *
 * Endpoints (public, no auth):
 * - GET /           列出所有原语（可按 layer 过滤），含实现状态
 * - GET /:name      获取单个原语详情，含实现状态
 */

import type { FastifyPluginAsync } from 'fastify';
import type { IPrimitiveService } from './interface';
import type { PrimitiveName } from '@clawteam/shared/types';
import { randomUUID } from 'crypto';

export interface PrimitiveRoutesDeps {
  primitiveService: IPrimitiveService;
}

/**
 * Implementation status for each primitive, based on PRIMITIVE_SYSTEM_AUDIT.md.
 *
 * Levels:
 * - 'full'          — Real module integration + REST API equivalent exists
 * - 'service_real'  — Service implementation with real module, but no dedicated REST API
 * - 'service_mem'   — Service implementation with in-memory Map only
 * - 'stub'          — Stub/hardcoded return values
 */
type ImplStatus = 'full' | 'service_real' | 'service_mem' | 'stub';

interface OperationStatus {
  operation: string;
  status: ImplStatus;
  restEquivalent?: string;
  notes?: string;
}

const IMPLEMENTATION_STATUS: Record<string, { summary: ImplStatus; operations: OperationStatus[] }> = {
  identity: {
    summary: 'full',
    operations: [
      { operation: 'register', status: 'full', restEquivalent: 'POST /api/v1/bots/register' },
      { operation: 'verify', status: 'full', restEquivalent: 'GET /api/v1/bots/:id' },
    ],
  },
  presence: {
    summary: 'service_real',
    operations: [
      { operation: 'announce', status: 'service_real', restEquivalent: 'PUT /api/v1/bots/:id/status' },
      { operation: 'observe', status: 'service_mem', notes: 'In-memory only' },
    ],
  },
  discover: {
    summary: 'service_real',
    operations: [
      { operation: 'search', status: 'service_real', restEquivalent: 'POST /api/v1/capabilities/search' },
      { operation: 'expose', status: 'service_mem', notes: 'In-memory only' },
    ],
  },
  connect: {
    summary: 'service_mem',
    operations: [
      { operation: 'connect', status: 'service_mem', notes: 'In-memory only' },
      { operation: 'accept', status: 'service_mem', notes: 'In-memory only' },
    ],
  },
  message: {
    summary: 'full',
    operations: [
      { operation: 'send', status: 'full', restEquivalent: 'POST /api/v1/messages/send' },
      { operation: 'receive', status: 'full', restEquivalent: 'GET /api/v1/messages/inbox' },
    ],
  },
  publish: {
    summary: 'service_mem',
    operations: [
      { operation: 'publish', status: 'service_mem', notes: 'In-memory Map, logic complete' },
      { operation: 'browse', status: 'service_mem', notes: 'In-memory Map with filtering/pagination' },
    ],
  },
  share: {
    summary: 'service_mem',
    operations: [
      { operation: 'share', status: 'service_mem', notes: 'In-memory, no delivery' },
    ],
  },
  request: {
    summary: 'service_mem',
    operations: [
      { operation: 'request', status: 'service_mem', notes: 'In-memory Map' },
      { operation: 'respond', status: 'service_mem', notes: 'In-memory Map' },
    ],
  },
  invite: {
    summary: 'service_mem',
    operations: [
      { operation: 'invite', status: 'service_mem', notes: 'In-memory Map' },
      { operation: 'join', status: 'service_mem', notes: 'In-memory Map' },
    ],
  },
  subscribe: {
    summary: 'service_mem',
    operations: [
      { operation: 'subscribe', status: 'service_mem', notes: 'In-memory Map' },
      { operation: 'notify', status: 'service_mem', notes: 'In-memory Map' },
    ],
  },
  delegate: {
    summary: 'full',
    operations: [
      { operation: 'delegate', status: 'full', restEquivalent: 'POST /api/v1/tasks/delegate', notes: 'Supports auto bot matching' },
      { operation: 'execute', status: 'full', restEquivalent: 'POST /api/v1/tasks/:id/complete' },
    ],
  },
  transfer: {
    summary: 'service_mem',
    operations: [
      { operation: 'send', status: 'service_mem', notes: 'In-memory, no file transfer' },
      { operation: 'receive', status: 'service_mem', notes: 'In-memory, no file transfer' },
    ],
  },
  // L2 — all in-memory stubs
  negotiate: { summary: 'service_mem', operations: [{ operation: 'propose', status: 'service_mem' }, { operation: 'counter', status: 'service_mem' }] },
  teach: { summary: 'service_mem', operations: [{ operation: 'teach', status: 'service_mem' }, { operation: 'learn', status: 'service_mem' }] },
  coordinate: { summary: 'service_mem', operations: [{ operation: 'orchestrate', status: 'service_mem' }, { operation: 'participate', status: 'service_mem' }] },
  aggregate: { summary: 'service_mem', operations: [{ operation: 'collect', status: 'service_mem' }, { operation: 'contribute', status: 'service_mem' }] },
  escalate: { summary: 'service_mem', operations: [{ operation: 'escalate', status: 'service_mem' }, { operation: 'handle', status: 'service_mem' }] },
  handoff: { summary: 'service_mem', operations: [{ operation: 'handoff', status: 'service_mem' }, { operation: 'takeover', status: 'service_mem' }] },
  vote: { summary: 'service_mem', operations: [{ operation: 'initiate', status: 'service_mem' }, { operation: 'cast', status: 'service_mem' }] },
  arbitrate: { summary: 'service_mem', operations: [{ operation: 'appeal', status: 'service_mem' }, { operation: 'judge', status: 'service_mem' }] },
  // L3 — all in-memory stubs
  broadcast: { summary: 'service_mem', operations: [{ operation: 'broadcast', status: 'service_mem' }] },
  authorize: { summary: 'service_mem', operations: [{ operation: 'grant', status: 'service_mem' }, { operation: 'request', status: 'service_mem' }] },
  audit: { summary: 'service_mem', operations: [{ operation: 'log', status: 'service_mem' }, { operation: 'query', status: 'service_mem' }] },
  comply: { summary: 'service_mem', operations: [{ operation: 'check', status: 'service_mem' }, { operation: 'report', status: 'stub', notes: 'Hardcoded return' }] },
  quota: { summary: 'service_mem', operations: [{ operation: 'allocate', status: 'service_mem' }, { operation: 'consume', status: 'service_mem' }] },
  federate: { summary: 'service_mem', operations: [{ operation: 'federate', status: 'service_mem' }, { operation: 'sync', status: 'service_mem' }] },
};

export function createPrimitiveRoutes(deps: PrimitiveRoutesDeps): FastifyPluginAsync {
  const { primitiveService } = deps;

  return async (fastify) => {

    /** GET / — List all primitives with implementation status */
    fastify.get<{ Querystring: { layer?: string } }>(
      '/',
      async (request, reply) => {
        const traceId = randomUUID();

        try {
          const result = await primitiveService.listPrimitives(request.query.layer);

          if (!result.success) {
            return reply.status(400).send({
              success: false,
              error: result.error,
              traceId,
            });
          }

          const primitives = result.data!.map((p) => {
            const implStatus = IMPLEMENTATION_STATUS[p.name.toLowerCase()];
            return {
              ...p,
              implementationStatus: implStatus?.summary || 'unknown',
              operations: implStatus?.operations || [],
            };
          });

          return reply.send({
            success: true,
            data: {
              primitives,
              total: primitives.length,
            },
            traceId,
          });
        } catch (error) {
          return reply.status(500).send({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: (error as Error).message },
            traceId,
          });
        }
      },
    );

    /** GET /:name — Get single primitive metadata with implementation status */
    fastify.get<{ Params: { name: string } }>(
      '/:name',
      async (request, reply) => {
        const traceId = randomUUID();

        try {
          const name = request.params.name.toLowerCase();
          const result = await primitiveService.getPrimitiveMetadata(name);

          if (!result.success) {
            return reply.status(404).send({
              success: false,
              error: result.error,
              traceId,
            });
          }

          const implStatus = IMPLEMENTATION_STATUS[name];

          return reply.send({
            success: true,
            data: {
              ...result.data,
              implementationStatus: implStatus?.summary || 'unknown',
              operations: implStatus?.operations || [],
            },
            traceId,
          });
        } catch (error) {
          return reply.status(500).send({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: (error as Error).message },
            traceId,
          });
        }
      },
    );
  };
}
