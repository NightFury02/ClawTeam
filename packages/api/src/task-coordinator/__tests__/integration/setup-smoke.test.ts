/**
 * Integration Test Setup Smoke Test
 *
 * Verifies that the integration test infrastructure (setup.ts) works:
 * - Database connection and cleanup
 * - Test team seeding
 * - Bot registration via HTTP
 * - TestApp factory (Fastify + real registry + real coordinator)
 * - HTTP helpers for task operations
 *
 * Run: npx jest --testPathPattern=integration/setup-smoke --no-coverage
 */

import {
  cleanDatabase,
  seedTestTeam,
  seedTestUser,
  registerTestBot,
  closeTestDatabase,
  createTestApp,
  delegateTask,
  pollTasks,
  acceptTask,
  completeTask,
  getTask,
  listTasks,
  type TestApp,
} from './setup';
import type { BotCapability } from '@clawteam/shared/types';

describe('Integration Test Setup Smoke Test', () => {
  let testApp: TestApp;
  let testApiKey: string;

  const sampleCapability: BotCapability = {
    name: 'run_query',
    description: 'Execute SQL queries',
    async: true,
    estimatedTime: '5s',
  };

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.app.close();
    await closeTestDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase();
    await seedTestTeam();
    const { apiKey } = await seedTestUser();
    testApiKey = apiKey;
    testApp.messageBus.reset();
  });

  describe('Database utilities', () => {
    it('should clean and seed database without errors', async () => {
      await cleanDatabase();
      const seed = await seedTestTeam();
      expect(seed.teamId).toBeDefined();
    });
  });

  describe('Bot registration', () => {
    it('should register a bot via HTTP and return botId + apiKey', async () => {
      const bot = await registerTestBot(testApp.app, {
        name: 'smoke-bot',
        capabilities: [sampleCapability],
      }, testApiKey);

      expect(bot.botId).toBeDefined();
      expect(bot.apiKey).toBeDefined();
      expect(bot.apiKey).toContain('clawteam_');
    });
  });

  describe('Task coordinator routes with auth', () => {
    it('should delegate a task with valid auth', async () => {
      const alice = await registerTestBot(testApp.app, {
        name: 'alice',
        capabilities: [sampleCapability],
      }, testApiKey);
      const bob = await registerTestBot(testApp.app, {
        name: 'bob',
        capabilities: [sampleCapability],
      }, testApiKey);

      const result = await delegateTask(testApp.app, alice.apiKey, {
        toBotId: bob.botId,
        prompt: 'test task',
        capability: 'run_query',
        parameters: { query: 'SELECT 1' },
      });

      expect(result.statusCode).toBe(201);
      expect(result.taskId).toBeDefined();
      expect(result.status).toBe('pending');
    });

    it('should reject delegate without auth', async () => {
      const response = await testApp.app.inject({
        method: 'POST',
        url: '/api/v1/tasks/delegate',
        payload: {
          toBotId: 'some-bot',
          prompt: 'test task',
          capability: 'test',
          parameters: {},
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('HTTP helpers', () => {
    it('should support full task lifecycle via helpers', async () => {
      const alice = await registerTestBot(testApp.app, {
        name: 'alice',
        capabilities: [sampleCapability],
      }, testApiKey);
      const bob = await registerTestBot(testApp.app, {
        name: 'bob',
        capabilities: [sampleCapability],
      }, testApiKey);

      // 1. Delegate
      const delegated = await delegateTask(testApp.app, alice.apiKey, {
        toBotId: bob.botId,
        prompt: 'test task',
        capability: 'run_query',
        parameters: { query: 'SELECT 1' },
      });
      expect(delegated.statusCode).toBe(201);
      const taskId = delegated.taskId!;

      // 2. Poll
      const polled = await pollTasks(testApp.app, bob.apiKey);
      expect(polled.statusCode).toBe(200);
      expect(polled.tasks.length).toBeGreaterThanOrEqual(1);

      // 3. Accept
      const accepted = await acceptTask(testApp.app, bob.apiKey, taskId);
      expect(accepted.statusCode).toBe(200);
      expect(accepted.status).toBe('accepted');

      // 4. Complete
      const completed = await completeTask(testApp.app, bob.apiKey, taskId, {
        status: 'completed',
        result: { count: 42 },
      });
      expect(completed.statusCode).toBe(200);
      expect(completed.status).toBe('completed');

      // 5. Get task (public endpoint)
      const task = await getTask(testApp.app, alice.botId, taskId);
      expect(task.statusCode).toBe(200);
      expect(task.data.status).toBe('completed');
      expect(task.data.result).toEqual({ count: 42 });

      // 6. List tasks
      const tasks = await listTasks(testApp.app, alice.apiKey, { role: 'from' });
      expect(tasks.statusCode).toBe(200);
      expect(tasks.data.items.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('MockMessageBus integration', () => {
    it('should capture published messages during task lifecycle', async () => {
      const alice = await registerTestBot(testApp.app, {
        name: 'alice',
        capabilities: [sampleCapability],
      }, testApiKey);
      const bob = await registerTestBot(testApp.app, {
        name: 'bob',
        capabilities: [sampleCapability],
      }, testApiKey);

      await delegateTask(testApp.app, alice.apiKey, {
        toBotId: bob.botId,
        prompt: 'test task',
        capability: 'run_query',
        parameters: { query: 'SELECT 1' },
      });

      // MockMessageBus should have captured the task_assigned event
      const messages = testApp.messageBus.getPublishedMessages();
      expect(messages.some((m) => m.event === 'task_assigned')).toBe(true);
    });
  });
});
