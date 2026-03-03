/**
 * Authentication Middleware Tests for Task Coordinator
 */

import Fastify, { FastifyInstance } from 'fastify';
import { MockCapabilityRegistry } from '@clawteam/api/capability-registry';
import { MockTaskCoordinator } from '../mocks';
import { createTaskRoutes } from '../routes';
import type { BotCapability } from '@clawteam/shared/types';

describe('Task Coordinator Auth Middleware', () => {
  let app: FastifyInstance;
  let registry: MockCapabilityRegistry;
  let coordinator: MockTaskCoordinator;

  const sampleCapability: BotCapability = {
    name: 'run_query',
    description: 'Execute SQL queries',
    async: true,
    estimatedTime: '5s',
  };

  beforeAll(async () => {
    registry = new MockCapabilityRegistry();
    coordinator = new MockTaskCoordinator();
    app = Fastify();
    await app.register(
      createTaskRoutes({ coordinator, registry }),
      { prefix: '/api/v1/tasks' }
    );
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    registry.reset();
    coordinator.resetAll();
  });

  // Helper to register a bot and return botId + apiKey
  async function registerBot(name = 'test-bot', capabilities: BotCapability[] = [sampleCapability]) {
    const result = await registry.register({
      name,
      capabilities,
    });
    const apiKey = registry.getApiKeyForBot(result.botId)!;
    return { botId: result.botId, apiKey };
  }

  // === Protected endpoints: auth required ===

  describe('POST /api/v1/tasks/create (protected)', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/tasks/create',
        payload: {
          prompt: 'test task',
          capability: 'run_query',
          parameters: { query: 'SELECT 1' },
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(false);
    });

    it('should return 401 with invalid API key', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/tasks/create',
        headers: {
          authorization: 'Bearer invalid-key-12345',
        },
        payload: {
          prompt: 'test task',
          capability: 'run_query',
          parameters: { query: 'SELECT 1' },
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(false);
    });

    it('should return 401 with malformed header (no Bearer prefix)', async () => {
      const { apiKey } = await registerBot('alice');

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/tasks/create',
        headers: {
          authorization: apiKey,
        },
        payload: {
          prompt: 'test task',
          capability: 'run_query',
          parameters: { query: 'SELECT 1' },
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(false);
    });

    it('should return 201 with valid API key', async () => {
      const alice = await registerBot('alice');

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/tasks/create',
        headers: {
          authorization: `Bearer ${alice.apiKey}`,
        },
        payload: {
          prompt: 'test task',
          capability: 'run_query',
          parameters: { query: 'SELECT 1' },
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.taskId).toBeDefined();
    });
  });

  describe('GET /api/v1/tasks/pending (protected)', () => {
    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/tasks/pending',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 200 with valid auth', async () => {
      const { apiKey } = await registerBot('bob');

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/tasks/pending',
        headers: {
          authorization: `Bearer ${apiKey}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.tasks).toBeInstanceOf(Array);
    });
  });

  describe('POST /api/v1/tasks/:taskId/accept (protected)', () => {
    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/tasks/some-task-id/accept',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should accept task with valid auth', async () => {
      const alice = await registerBot('alice');
      const bob = await registerBot('bob');

      // Alice delegates to Bob
      const task = await coordinator.createTask(
        { prompt: 'test task', capability: 'run_query', parameters: {} },
        alice.botId
      );
      await coordinator.delegate(task.id, bob.botId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/tasks/${task.id}/accept`,
        headers: {
          authorization: `Bearer ${bob.apiKey}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('processing');
    });
  });

  describe('POST /api/v1/tasks/:taskId/complete (protected)', () => {
    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/tasks/some-task-id/complete',
        payload: { status: 'completed', result: {} },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /api/v1/tasks/:taskId/cancel (protected)', () => {
    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/tasks/some-task-id/cancel',
        payload: { reason: 'test' },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /api/v1/tasks (protected)', () => {
    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/tasks',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 200 with valid auth', async () => {
      const { apiKey } = await registerBot('alice');

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/tasks',
        headers: {
          authorization: `Bearer ${apiKey}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
    });
  });

  // === GET /:taskId requires auth ===

  describe('GET /api/v1/tasks/:taskId (protected)', () => {
    it('should work with valid API key', async () => {
      const alice = await registerBot('alice');
      const bob = await registerBot('bob');

      // Delegate a task first
      const task = await coordinator.createTask(
        { prompt: 'test task', capability: 'run_query', parameters: {} },
        alice.botId
      );
      await coordinator.delegate(task.id, bob.botId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/tasks/${task.id}`,
        headers: {
          authorization: `Bearer ${alice.apiKey}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(task.id);
    });

    it('should return 404 for non-existent task', async () => {
      const alice = await registerBot('alice');

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/tasks/non-existent-id',
        headers: {
          authorization: `Bearer ${alice.apiKey}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/tasks/some-task-id',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // === End-to-end with auth ===

  describe('End-to-end flow with auth', () => {
    it('should complete create → delegate → poll → accept → complete with API keys', async () => {
      const alice = await registerBot('alice');
      const bob = await registerBot('bob');

      // 1. Alice creates a task
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/tasks/create',
        headers: { authorization: `Bearer ${alice.apiKey}` },
        payload: {
          prompt: 'run sql query',
          capability: 'run_query',
          parameters: { query: 'SELECT COUNT(*) FROM users' },
        },
      });

      expect(createRes.statusCode).toBe(201);
      const { taskId } = JSON.parse(createRes.payload).data;

      // 2. Alice delegates to Bob
      const delegateRes = await app.inject({
        method: 'POST',
        url: `/api/v1/tasks/${taskId}/delegate`,
        headers: { authorization: `Bearer ${alice.apiKey}` },
        payload: { toBotId: bob.botId },
      });

      expect(delegateRes.statusCode).toBe(200);

      // 2. Bob polls pending tasks
      const pollRes = await app.inject({
        method: 'GET',
        url: '/api/v1/tasks/pending',
        headers: { authorization: `Bearer ${bob.apiKey}` },
      });

      expect(pollRes.statusCode).toBe(200);
      const { tasks } = JSON.parse(pollRes.payload).data;
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe(taskId);

      // 3. Bob accepts the task
      const acceptRes = await app.inject({
        method: 'POST',
        url: `/api/v1/tasks/${taskId}/accept`,
        headers: { authorization: `Bearer ${bob.apiKey}` },
      });

      expect(acceptRes.statusCode).toBe(200);

      // 4. Bob completes the task
      const completeRes = await app.inject({
        method: 'POST',
        url: `/api/v1/tasks/${taskId}/complete`,
        headers: { authorization: `Bearer ${bob.apiKey}` },
        payload: {
          status: 'completed',
          result: { count: 42 },
        },
      });

      expect(completeRes.statusCode).toBe(200);

      // 5. Alice checks task status (using API key since GET /:taskId requires auth)
      const getRes = await app.inject({
        method: 'GET',
        url: `/api/v1/tasks/${taskId}`,
        headers: { authorization: `Bearer ${alice.apiKey}` },
      });

      expect(getRes.statusCode).toBe(200);
      const taskData = JSON.parse(getRes.payload).data;
      expect(taskData.status).toBe('completed');
      expect(taskData.result).toEqual({ count: 42 });
    });
  });
});
