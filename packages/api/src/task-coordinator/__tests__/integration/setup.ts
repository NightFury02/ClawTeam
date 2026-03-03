/**
 * Integration Test Setup for Task Coordinator
 *
 * Provides utilities to create a full Fastify app with real DB-backed
 * capability-registry and task-coordinator for integration testing.
 *
 * Requires: docker-compose up -d postgres && npm run migrate:up
 *
 * Usage:
 * ```typescript
 * import {
 *   cleanDatabase,
 *   seedTestTeam,
 *   registerTestBot,
 *   createTestApp,
 *   closeTestDatabase,
 * } from './setup';
 *
 * let testApp: TestApp;
 * beforeAll(async () => { testApp = await createTestApp(); });
 * beforeEach(async () => { await cleanDatabase(); await seedTestTeam(); });
 * afterAll(async () => { await testApp.app.close(); await closeTestDatabase(); });
 * ```
 */

import Fastify, { FastifyInstance } from 'fastify';
import type { BotCapability } from '@clawteam/shared/types';
import type { DatabasePool, RedisClient, Logger } from '@clawteam/api/common';
import type { ICapabilityRegistry } from '@clawteam/api/capability-registry';
import type { ITaskCoordinator } from '../../interface';
import type { TimeoutDetector } from '../../timeout-detector';
import { createCapabilityRegistry } from '@clawteam/api/capability-registry';
import { createRegistryRoutes } from '@clawteam/api/capability-registry';
import { createUserRepository } from '@clawteam/api/capability-registry';
import { MockMessageBus } from '@clawteam/api/message-bus';
import { createTaskCoordinator } from '../../index';
import { createTaskRoutes } from '../../routes';

// ─── Database Utilities (re-exported from capability-registry setup) ─────────

import {
  getTestDatabase,
  seedTestTeam,
  seedTestUser,
  registerTestBot,
  closeTestDatabase,
} from '@clawteam/api/capability-registry/__tests__/integration/setup';

export { getTestDatabase, seedTestTeam, seedTestUser, registerTestBot, closeTestDatabase };

/**
 * Clean all tables in dependency order (respecting foreign keys).
 * Extends capability-registry's cleanDatabase by cleaning tasks table first.
 */
export async function cleanDatabase(): Promise<void> {
  const db = getTestDatabase();
  // tasks depends on bots (from_bot_id, to_bot_id) — delete first
  await db.query('DELETE FROM tasks');
  // Then clean registry tables in FK order
  await db.query('DELETE FROM capability_index');
  await db.query('DELETE FROM bots');
  await db.query('DELETE FROM users');
  await db.query('DELETE FROM teams');
}

// ─── Mock Factories ──────────────────────────────────────────────────────────

/**
 * Create a mock RedisClient for integration tests.
 * Uses in-memory Maps/arrays to simulate basic Redis operations.
 */
export function createMockRedis(): RedisClient {
  const store = new Map<string, string>();
  const lists = new Map<string, string[]>();
  const hashes = new Map<string, Map<string, string>>();
  const sortedSets = new Map<string, { member: string; score: number }[]>();

  return {
    // String operations
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => { store.set(key, value); }),
    del: jest.fn(async (key: string) => {
      const existed = store.has(key) || lists.has(key) || hashes.has(key);
      store.delete(key);
      lists.delete(key);
      hashes.delete(key);
      return existed ? 1 : 0;
    }),
    exists: jest.fn(async (key: string) => store.has(key) || lists.has(key) || hashes.has(key)),
    expire: jest.fn(async () => true),
    ttl: jest.fn(async () => -1),
    mget: jest.fn(async (...keys: string[]) => keys.map((k) => store.get(k) ?? null)),
    mset: jest.fn(async (...pairs: string[]) => {
      for (let i = 0; i < pairs.length; i += 2) {
        store.set(pairs[i], pairs[i + 1]);
      }
    }),

    // Hash operations
    hget: jest.fn(async (key: string, field: string) => {
      return hashes.get(key)?.get(field) ?? null;
    }),
    hset: jest.fn(async (key: string, field: string, value: string) => {
      if (!hashes.has(key)) hashes.set(key, new Map());
      hashes.get(key)!.set(field, value);
      return 1;
    }),
    hgetall: jest.fn(async (key: string) => {
      const h = hashes.get(key);
      if (!h) return {};
      return Object.fromEntries(h.entries());
    }),
    hdel: jest.fn(async (key: string, field: string) => {
      return hashes.get(key)?.delete(field) ? 1 : 0;
    }),
    hincrby: jest.fn(async (key: string, field: string, increment: number) => {
      if (!hashes.has(key)) hashes.set(key, new Map());
      const current = parseInt(hashes.get(key)!.get(field) || '0', 10);
      const next = current + increment;
      hashes.get(key)!.set(field, String(next));
      return next;
    }),

    // List operations
    lpush: jest.fn(async (key: string, value: string) => {
      if (!lists.has(key)) lists.set(key, []);
      lists.get(key)!.unshift(value);
      return lists.get(key)!.length;
    }),
    rpush: jest.fn(async (key: string, value: string) => {
      if (!lists.has(key)) lists.set(key, []);
      lists.get(key)!.push(value);
      return lists.get(key)!.length;
    }),
    lpop: jest.fn(async (key: string) => {
      return lists.get(key)?.shift() ?? null;
    }),
    rpop: jest.fn(async (key: string) => {
      return lists.get(key)?.pop() ?? null;
    }),
    lrange: jest.fn(async (key: string, start: number, stop: number) => {
      const list = lists.get(key) || [];
      const end = stop === -1 ? list.length : stop + 1;
      return list.slice(start, end);
    }),
    llen: jest.fn(async (key: string) => {
      return lists.get(key)?.length ?? 0;
    }),
    lrem: jest.fn(async (key: string, count: number, value: string) => {
      const list = lists.get(key);
      if (!list) return 0;
      let removed = 0;
      const newList = list.filter((item) => {
        if (item === value && (count === 0 || removed < Math.abs(count))) {
          removed++;
          return false;
        }
        return true;
      });
      lists.set(key, newList);
      return removed;
    }),

    // Set operations
    sadd: jest.fn(async () => 1),
    srem: jest.fn(async () => 1),
    smembers: jest.fn(async () => []),
    sismember: jest.fn(async () => false),

    // Sorted set operations
    zadd: jest.fn(async (key: string, score: string, member: string) => {
      if (!sortedSets.has(key)) sortedSets.set(key, []);
      const set = sortedSets.get(key)!;
      const idx = set.findIndex((e) => e.member === member);
      if (idx >= 0) {
        set[idx].score = parseFloat(score);
        return 0;
      }
      set.push({ member, score: parseFloat(score) });
      return 1;
    }),
    zrem: jest.fn(async (key: string, member: string) => {
      const set = sortedSets.get(key);
      if (!set) return 0;
      const idx = set.findIndex((e) => e.member === member);
      if (idx >= 0) {
        set.splice(idx, 1);
        return 1;
      }
      return 0;
    }),
    zrangebyscore: jest.fn(async (key: string, min: number, max: number) => {
      const set = sortedSets.get(key) || [];
      return set
        .filter((e) => e.score >= min && e.score <= max)
        .sort((a, b) => a.score - b.score)
        .map((e) => e.member);
    }),

    // Connection management
    getClient: jest.fn(),
    duplicate: jest.fn(),
    close: jest.fn(async () => {}),
    isConnected: jest.fn(() => true),
  } as unknown as RedisClient;
}

/**
 * Create a silent logger for integration tests.
 */
export function createSilentLogger(): Logger {
  const logger: any = {
    trace: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
    child: jest.fn(() => logger),
  };
  return logger as Logger;
}

// ─── Test App Factory ────────────────────────────────────────────────────────

export interface TestApp {
  app: FastifyInstance;
  registry: ICapabilityRegistry;
  coordinator: ITaskCoordinator & { timeoutDetector?: TimeoutDetector };
  messageBus: MockMessageBus;
  redis: RedisClient;
}

/**
 * Create a Fastify app with both capability-registry and task-coordinator routes.
 *
 * - Capability Registry: backed by real PostgreSQL, NullCache (no Redis)
 * - Task Coordinator: backed by real PostgreSQL, mock Redis, real registry, MockMessageBus
 * - Auth middleware enabled on task-coordinator protected endpoints
 */
export async function createTestApp(): Promise<TestApp> {
  const db = getTestDatabase();
  const redis = createMockRedis();
  const logger = createSilentLogger();
  const messageBus = new MockMessageBus();

  // Build real capability-registry (uses NullCache when redis=null)
  const registry = createCapabilityRegistry({ db, redis: null, logger });
  const userRepo = createUserRepository(db);

  // Build real task-coordinator
  const coordinator = createTaskCoordinator({
    db,
    redis,
    registry,
    messageBus,
    logger,
  });

  // Create Fastify app
  const app = Fastify({ logger: false });

  // Register capability-registry routes (for bot registration in tests)
  await app.register(createRegistryRoutes({ registry, userRepo }), { prefix: '/api/v1' });

  // Register task-coordinator routes (with auth middleware)
  await app.register(
    createTaskRoutes({ coordinator, registry }),
    { prefix: '/api/v1/tasks' }
  );

  await app.ready();

  return { app, registry, coordinator, messageBus, redis };
}

// ─── HTTP Helpers ────────────────────────────────────────────────────────────

export interface DelegatePayload {
  toBotId: string;
  prompt: string;
  capability?: string;
  parameters?: Record<string, unknown>;
  priority?: 'urgent' | 'high' | 'normal' | 'low';
  humanContext?: string;
  timeoutSeconds?: number;
}

export interface DelegateResult {
  statusCode: number;
  taskId?: string;
  status?: string;
  error?: { code: string; message: string };
}

/**
 * Delegate a task via HTTP POST /api/v1/tasks/delegate
 */
export async function delegateTask(
  app: FastifyInstance,
  apiKey: string,
  payload: DelegatePayload
): Promise<DelegateResult> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/tasks/delegate',
    headers: { authorization: `Bearer ${apiKey}` },
    payload,
  });

  const body = JSON.parse(response.payload);
  return {
    statusCode: response.statusCode,
    taskId: body.data?.taskId,
    status: body.data?.status,
    error: body.error,
  };
}

/**
 * Poll pending tasks via HTTP GET /api/v1/tasks/pending
 */
export async function pollTasks(
  app: FastifyInstance,
  apiKey: string,
  limit?: number
): Promise<{ statusCode: number; tasks: any[] }> {
  const url = limit
    ? `/api/v1/tasks/pending?limit=${limit}`
    : '/api/v1/tasks/pending';

  const response = await app.inject({
    method: 'GET',
    url,
    headers: { authorization: `Bearer ${apiKey}` },
  });

  const body = JSON.parse(response.payload);
  return {
    statusCode: response.statusCode,
    tasks: body.data?.tasks || [],
  };
}

/**
 * Accept a task via HTTP POST /api/v1/tasks/:taskId/accept
 */
export async function acceptTask(
  app: FastifyInstance,
  apiKey: string,
  taskId: string
): Promise<{ statusCode: number; status?: string; error?: any }> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/tasks/${taskId}/accept`,
    headers: { authorization: `Bearer ${apiKey}` },
  });

  const body = JSON.parse(response.payload);
  return {
    statusCode: response.statusCode,
    status: body.data?.status,
    error: body.error,
  };
}

/**
 * Start a task via HTTP POST /api/v1/tasks/:taskId/start
 */
export async function startTask(
  app: FastifyInstance,
  apiKey: string,
  taskId: string
): Promise<{ statusCode: number; status?: string; error?: any }> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/tasks/${taskId}/start`,
    headers: { authorization: `Bearer ${apiKey}` },
  });

  const body = JSON.parse(response.payload);
  return {
    statusCode: response.statusCode,
    status: body.data?.status,
    error: body.error,
  };
}

/**
 * Complete a task via HTTP POST /api/v1/tasks/:taskId/complete
 */
export async function completeTask(
  app: FastifyInstance,
  apiKey: string,
  taskId: string,
  result: { status: string; result?: unknown; executionTimeMs?: number }
): Promise<{ statusCode: number; status?: string; error?: any }> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/tasks/${taskId}/complete`,
    headers: { authorization: `Bearer ${apiKey}` },
    payload: result,
  });

  const body = JSON.parse(response.payload);
  return {
    statusCode: response.statusCode,
    status: body.data?.status,
    error: body.error,
  };
}

/**
 * Cancel a task via HTTP POST /api/v1/tasks/:taskId/cancel
 */
export async function cancelTask(
  app: FastifyInstance,
  apiKey: string,
  taskId: string,
  reason: string
): Promise<{ statusCode: number; status?: string; error?: any }> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/tasks/${taskId}/cancel`,
    headers: { authorization: `Bearer ${apiKey}` },
    payload: { reason },
  });

  const body = JSON.parse(response.payload);
  return {
    statusCode: response.statusCode,
    status: body.data?.status,
    error: body.error,
  };
}

/**
 * Get task details via HTTP GET /api/v1/tasks/:taskId (public endpoint, uses X-Bot-Id)
 */
export async function getTask(
  app: FastifyInstance,
  botId: string,
  taskId: string
): Promise<{ statusCode: number; data?: any; error?: any }> {
  const response = await app.inject({
    method: 'GET',
    url: `/api/v1/tasks/${taskId}`,
    headers: { 'x-bot-id': botId },
  });

  const body = JSON.parse(response.payload);
  return {
    statusCode: response.statusCode,
    data: body.data,
    error: body.error,
  };
}

/**
 * List tasks for a bot via HTTP GET /api/v1/tasks
 */
export async function listTasks(
  app: FastifyInstance,
  apiKey: string,
  query?: { role?: string; status?: string; page?: number; limit?: number }
): Promise<{ statusCode: number; data?: any; error?: any }> {
  const params = new URLSearchParams();
  if (query?.role) params.set('role', query.role);
  if (query?.status) params.set('status', query.status);
  if (query?.page) params.set('page', String(query.page));
  if (query?.limit) params.set('limit', String(query.limit));

  const qs = params.toString();
  const url = qs ? `/api/v1/tasks?${qs}` : '/api/v1/tasks';

  const response = await app.inject({
    method: 'GET',
    url,
    headers: { authorization: `Bearer ${apiKey}` },
  });

  const body = JSON.parse(response.payload);
  return {
    statusCode: response.statusCode,
    data: body.data,
    error: body.error,
  };
}
