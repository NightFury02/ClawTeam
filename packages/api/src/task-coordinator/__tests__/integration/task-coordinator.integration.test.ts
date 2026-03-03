/**
 * Task Coordinator Integration Tests
 *
 * Uses real PostgreSQL database, Fastify, real CapabilityRegistry (NullCache),
 * and MockMessageBus + mock Redis for queue/cache operations.
 *
 * Requires: docker-compose up -d postgres && npm run migrate:up
 *
 * Run:
 *   npx jest --testPathPattern=integration/task-coordinator --testPathIgnorePatterns='/node_modules/' --no-coverage
 */

import type { BotCapability } from '@clawteam/shared/types';
import {
  cleanDatabase,
  seedTestTeam,
  seedTestUser,
  registerTestBot,
  closeTestDatabase,
  getTestDatabase,
  createTestApp,
  delegateTask,
  pollTasks,
  acceptTask,
  startTask,
  completeTask,
  cancelTask,
  getTask,
  listTasks,
  type TestApp,
} from './setup';
import { MAX_QUEUE_SIZE, REDIS_KEYS } from '../../constants';

describe('Task Coordinator Integration Tests', () => {
  let testApp: TestApp;
  let testApiKey: string;

  const sqlCapability: BotCapability = {
    name: 'run_sql_query',
    description: 'Execute SQL queries on the database',
    async: true,
    estimatedTime: '10s',
  };

  const codeSearchCapability: BotCapability = {
    name: 'code_search',
    description: 'Search code in repository using semantic analysis',
    async: false,
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

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario 1: Complete task delegation flow
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Scenario 1: Complete task delegation flow', () => {
    it('should complete register → delegate → poll → accept → start → complete → query', async () => {
      // 1. Register two bots
      const alice = await registerTestBot(testApp.app, {
        name: 'alice_bot',
        capabilities: [codeSearchCapability],
      }, testApiKey);
      const lily = await registerTestBot(testApp.app, {
        name: 'lily_bot',
        capabilities: [sqlCapability],
      }, testApiKey);

      // 2. Alice delegates task to Lily
      const delegated = await delegateTask(testApp.app, alice.apiKey, {
        toBotId: lily.botId,
        prompt: 'run sql query for user count',
        capability: 'run_sql_query',
        parameters: { query: 'SELECT COUNT(*) FROM users' },
        priority: 'normal',
        humanContext: 'Alice needs user count for daily report',
      });
      expect(delegated.statusCode).toBe(201);
      expect(delegated.taskId).toBeDefined();
      expect(delegated.status).toBe('pending');
      const taskId = delegated.taskId!;

      // 3. Lily polls pending tasks
      const polled = await pollTasks(testApp.app, lily.apiKey);
      expect(polled.statusCode).toBe(200);
      expect(polled.tasks.length).toBeGreaterThanOrEqual(1);
      const polledTask = polled.tasks.find((t: any) => t.id === taskId);
      expect(polledTask).toBeDefined();
      expect(polledTask.capability).toBe('run_sql_query');

      // 4. Lily accepts the task
      const accepted = await acceptTask(testApp.app, lily.apiKey, taskId);
      expect(accepted.statusCode).toBe(200);
      expect(accepted.status).toBe('accepted');

      // 5. Lily starts the task
      const started = await startTask(testApp.app, lily.apiKey, taskId);
      expect(started.statusCode).toBe(200);
      expect(started.status).toBe('processing');

      // 6. Lily completes the task
      const completed = await completeTask(testApp.app, lily.apiKey, taskId, {
        status: 'completed',
        result: { count: 1523 },
        executionTimeMs: 420,
      });
      expect(completed.statusCode).toBe(200);
      expect(completed.status).toBe('completed');

      // 7. Alice queries the task
      const task = await getTask(testApp.app, alice.botId, taskId);
      expect(task.statusCode).toBe(200);
      expect(task.data.status).toBe('completed');
      expect(task.data.result).toEqual({ count: 1523 });

      // 8. Alice lists her tasks (as sender)
      const tasks = await listTasks(testApp.app, alice.apiKey, { role: 'from' });
      expect(tasks.statusCode).toBe(200);
      expect(tasks.data.items).toHaveLength(1);
      expect(tasks.data.items[0].id).toBe(taskId);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario 3: Task completion notification via MessageBus
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Scenario 3: Task completion notification', () => {
    it('should publish task_assigned, task_completed events through the lifecycle', async () => {
      const alice = await registerTestBot(testApp.app, {
        name: 'alice_bot',
        capabilities: [codeSearchCapability],
      }, testApiKey);
      const bob = await registerTestBot(testApp.app, {
        name: 'bob_bot',
        capabilities: [sqlCapability],
      }, testApiKey);

      // Delegate
      const delegated = await delegateTask(testApp.app, alice.apiKey, {
        toBotId: bob.botId,
        prompt: 'run sql query',
        capability: 'run_sql_query',
        parameters: { query: 'SELECT 1' },
      });
      const taskId = delegated.taskId!;

      // Verify task_assigned event published to target bot
      let messages = testApp.messageBus.getPublishedMessages();
      expect(messages.some((m) =>
        m.event === 'task_assigned' && m.targetBotId === bob.botId
      )).toBe(true);

      // Accept + complete
      await acceptTask(testApp.app, bob.apiKey, taskId);
      await completeTask(testApp.app, bob.apiKey, taskId, {
        status: 'completed',
        result: { answer: 42 },
      });

      // Verify task_completed event published to originator
      messages = testApp.messageBus.getPublishedMessages();
      expect(messages.some((m) =>
        m.event === 'task_completed' && m.targetBotId === alice.botId
      )).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario 4: Bot not found
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Scenario 4: Bot not found', () => {
    it('should return 404 when delegating to a non-existent bot', async () => {
      const alice = await registerTestBot(testApp.app, {
        name: 'alice_bot',
      }, testApiKey);

      const result = await delegateTask(testApp.app, alice.apiKey, {
        toBotId: '00000000-0000-0000-0000-000000000099',
        prompt: 'test task',
        capability: 'test',
        parameters: {},
      });

      expect(result.statusCode).toBe(404);
      expect(result.error!.code).toBe('TASK_NOT_FOUND');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario 5: Queue full
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Scenario 5: Queue full', () => {
    it('should return 429 when target bot queue is full', async () => {
      const alice = await registerTestBot(testApp.app, {
        name: 'alice_bot',
      }, testApiKey);
      const bob = await registerTestBot(testApp.app, {
        name: 'bob_bot',
        capabilities: [sqlCapability],
      }, testApiKey);

      // Pre-fill Bob's queue to MAX_QUEUE_SIZE via mock Redis
      const queueKey = `${REDIS_KEYS.TASK_QUEUE}:${bob.botId}:normal`;
      for (let i = 0; i < MAX_QUEUE_SIZE; i++) {
        await testApp.redis.rpush(queueKey, `fake-task-${i}`);
      }

      // The next delegate should fail with 429
      const result = await delegateTask(testApp.app, alice.apiKey, {
        toBotId: bob.botId,
        prompt: 'run sql query',
        capability: 'run_sql_query',
        parameters: { query: 'SELECT 1' },
      });

      expect(result.statusCode).toBe(429);
      expect(result.error!.code).toBe('QUEUE_FULL');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario 6: Invalid API Key
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Scenario 6: Invalid API Key', () => {
    it('should return 401 for all protected endpoints with invalid API key', async () => {
      const invalidKey = 'clawteam_invalidkey_1234567890abcdef';

      // POST /delegate
      const delegateRes = await testApp.app.inject({
        method: 'POST',
        url: '/api/v1/tasks/delegate',
        headers: { authorization: `Bearer ${invalidKey}` },
        payload: { toBotId: 'x', prompt: 'test task', capability: 'test', parameters: {} },
      });
      expect(delegateRes.statusCode).toBe(401);

      // GET /pending
      const pollRes = await testApp.app.inject({
        method: 'GET',
        url: '/api/v1/tasks/pending',
        headers: { authorization: `Bearer ${invalidKey}` },
      });
      expect(pollRes.statusCode).toBe(401);

      // POST /:taskId/accept
      const acceptRes = await testApp.app.inject({
        method: 'POST',
        url: '/api/v1/tasks/fake-id/accept',
        headers: { authorization: `Bearer ${invalidKey}` },
      });
      expect(acceptRes.statusCode).toBe(401);

      // POST /:taskId/complete
      const completeRes = await testApp.app.inject({
        method: 'POST',
        url: '/api/v1/tasks/fake-id/complete',
        headers: { authorization: `Bearer ${invalidKey}` },
        payload: { status: 'completed', result: {} },
      });
      expect(completeRes.statusCode).toBe(401);

      // POST /:taskId/cancel
      const cancelRes = await testApp.app.inject({
        method: 'POST',
        url: '/api/v1/tasks/fake-id/cancel',
        headers: { authorization: `Bearer ${invalidKey}` },
        payload: { reason: 'test' },
      });
      expect(cancelRes.statusCode).toBe(401);

      // GET / (task list)
      const listRes = await testApp.app.inject({
        method: 'GET',
        url: '/api/v1/tasks',
        headers: { authorization: `Bearer ${invalidKey}` },
      });
      expect(listRes.statusCode).toBe(401);
    });

    it('should return 401 when no Authorization header is provided', async () => {
      const response = await testApp.app.inject({
        method: 'POST',
        url: '/api/v1/tasks/delegate',
        payload: { toBotId: 'x', prompt: 'test task', capability: 'test', parameters: {} },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario 7: Cancel pending task
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Scenario 7: Cancel pending task', () => {
    it('should allow the sender to cancel a pending task', async () => {
      const alice = await registerTestBot(testApp.app, {
        name: 'alice_bot',
      }, testApiKey);
      const bob = await registerTestBot(testApp.app, {
        name: 'bob_bot',
        capabilities: [sqlCapability],
      }, testApiKey);

      // Alice delegates
      const delegated = await delegateTask(testApp.app, alice.apiKey, {
        toBotId: bob.botId,
        prompt: 'run sql query',
        capability: 'run_sql_query',
        parameters: { query: 'SELECT 1' },
      });
      const taskId = delegated.taskId!;

      // Alice cancels
      const cancelled = await cancelTask(
        testApp.app,
        alice.apiKey,
        taskId,
        'No longer needed'
      );
      expect(cancelled.statusCode).toBe(200);
      expect(cancelled.status).toBe('cancelled');

      // Verify task status in DB
      const task = await getTask(testApp.app, alice.botId, taskId);
      expect(task.statusCode).toBe(200);
      expect(task.data.status).toBe('cancelled');

      // Verify task_failed event sent to target bot
      const messages = testApp.messageBus.getPublishedMessages();
      expect(messages.some((m) =>
        m.event === 'task_failed' &&
        m.targetBotId === bob.botId &&
        (m.payload as any).status === 'cancelled'
      )).toBe(true);

      // Bob should no longer see the task in pending
      const polled = await pollTasks(testApp.app, bob.apiKey);
      const found = polled.tasks.find((t: any) => t.id === taskId);
      expect(found).toBeUndefined();
    });

    it('should not allow non-sender to cancel a task', async () => {
      const alice = await registerTestBot(testApp.app, {
        name: 'alice_bot',
      }, testApiKey);
      const bob = await registerTestBot(testApp.app, {
        name: 'bob_bot',
        capabilities: [sqlCapability],
      }, testApiKey);

      const delegated = await delegateTask(testApp.app, alice.apiKey, {
        toBotId: bob.botId,
        prompt: 'run sql query',
        capability: 'run_sql_query',
        parameters: {},
      });

      // Bob tries to cancel — should be forbidden
      const cancelled = await cancelTask(
        testApp.app,
        bob.apiKey,
        delegated.taskId!,
        'I want to cancel'
      );
      expect(cancelled.statusCode).toBe(403);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario 8: Task timeout retry
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Scenario 8: Task timeout retry', () => {
    it('should auto-retry a timed-out task when retry_count < max_retries', async () => {
      const alice = await registerTestBot(testApp.app, {
        name: 'alice_bot',
      }, testApiKey);
      const bob = await registerTestBot(testApp.app, {
        name: 'bob_bot',
        capabilities: [sqlCapability],
      }, testApiKey);

      // Delegate a task
      const delegated = await delegateTask(testApp.app, alice.apiKey, {
        toBotId: bob.botId,
        prompt: 'run sql query',
        capability: 'run_sql_query',
        parameters: { query: 'SELECT 1' },
      });
      const taskId = delegated.taskId!;

      // Simulate timeout: set created_at to 10 minutes ago and timeout_seconds=1
      const db = getTestDatabase();
      await db.query(
        `UPDATE tasks SET timeout_seconds = 1, created_at = NOW() - INTERVAL '10 minutes' WHERE id = $1`,
        [taskId]
      );

      // Trigger timeout detection
      const coordinator = testApp.coordinator as any;
      const handled = await coordinator.timeoutDetector.detectTimeouts();
      expect(handled).toBeGreaterThanOrEqual(1);

      // Verify task was retried: status back to 'pending', retry_count=1
      const result = await db.query(
        'SELECT status, retry_count FROM tasks WHERE id = $1',
        [taskId]
      );
      expect(result.rows[0].status).toBe('pending');
      expect(result.rows[0].retry_count).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario 9: Max retries exceeded
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Scenario 9: Max retries exceeded', () => {
    it('should mark task as timeout when retry_count >= max_retries', async () => {
      const alice = await registerTestBot(testApp.app, {
        name: 'alice_bot',
      }, testApiKey);
      const bob = await registerTestBot(testApp.app, {
        name: 'bob_bot',
        capabilities: [sqlCapability],
      }, testApiKey);

      // Delegate a task
      const delegated = await delegateTask(testApp.app, alice.apiKey, {
        toBotId: bob.botId,
        prompt: 'run sql query',
        capability: 'run_sql_query',
        parameters: { query: 'SELECT 1' },
      });
      const taskId = delegated.taskId!;

      // Simulate: set retry_count to max_retries (3), expire the task
      const db = getTestDatabase();
      await db.query(
        `UPDATE tasks SET
           timeout_seconds = 1,
           retry_count = 3,
           created_at = NOW() - INTERVAL '10 minutes'
         WHERE id = $1`,
        [taskId]
      );

      // Trigger timeout detection
      const coordinator = testApp.coordinator as any;
      const handled = await coordinator.timeoutDetector.detectTimeouts();
      expect(handled).toBeGreaterThanOrEqual(1);

      // Verify task was marked as timeout (not retried)
      const result = await db.query(
        'SELECT status, error, completed_at FROM tasks WHERE id = $1',
        [taskId]
      );
      expect(result.rows[0].status).toBe('timeout');
      expect(result.rows[0].completed_at).not.toBeNull();

      const errorData = result.rows[0].error;
      const error = typeof errorData === 'string' ? JSON.parse(errorData) : errorData;
      expect(error.code).toBe('TIMEOUT');

      // Verify task_failed event published to originator
      const messages = testApp.messageBus.getPublishedMessages();
      expect(messages.some((m) =>
        m.event === 'task_failed' &&
        m.targetBotId === alice.botId &&
        (m.payload as any).reason === 'timeout'
      )).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario 10: Capability search → task delegation
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Scenario 10: Capability search → task delegation', () => {
    it('should find a bot by capability and delegate task to it', async () => {
      const alice = await registerTestBot(testApp.app, {
        name: 'alice_bot',
        capabilities: [codeSearchCapability],
      }, testApiKey);
      const dbBot = await registerTestBot(testApp.app, {
        name: 'db_expert_bot',
        capabilities: [sqlCapability],
      }, testApiKey);

      // Wait for async indexing
      await new Promise((r) => setTimeout(r, 200));

      // Alice searches for 'sql query' capability
      const searchRes = await testApp.app.inject({
        method: 'GET',
        url: `/api/v1/capabilities/run_sql_query/bots`,
      });

      expect(searchRes.statusCode).toBe(200);
      const searchBody = JSON.parse(searchRes.payload);
      expect(searchBody.data.bots.length).toBeGreaterThanOrEqual(1);

      // Find the db_expert_bot in results
      const foundBot = searchBody.data.bots.find(
        (b: any) => b.id === dbBot.botId
      );
      expect(foundBot).toBeDefined();

      // Alice delegates task to the found bot
      const delegated = await delegateTask(testApp.app, alice.apiKey, {
        toBotId: foundBot.id,
        prompt: 'explain sql query',
        capability: 'run_sql_query',
        parameters: { query: 'EXPLAIN SELECT * FROM users' },
        humanContext: 'Found via capability search',
      });
      expect(delegated.statusCode).toBe(201);
      expect(delegated.taskId).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Additional edge cases
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Edge cases', () => {
    it('should handle multiple tasks between the same bots', async () => {
      const alice = await registerTestBot(testApp.app, {
        name: 'alice_bot',
      }, testApiKey);
      const bob = await registerTestBot(testApp.app, {
        name: 'bob_bot',
        capabilities: [sqlCapability],
      }, testApiKey);

      // Delegate 3 tasks
      const task1 = await delegateTask(testApp.app, alice.apiKey, {
        toBotId: bob.botId,
        prompt: 'run sql query 1',
        capability: 'run_sql_query',
        parameters: { query: 'SELECT 1' },
        priority: 'low',
      });
      const task2 = await delegateTask(testApp.app, alice.apiKey, {
        toBotId: bob.botId,
        prompt: 'run sql query 2',
        capability: 'run_sql_query',
        parameters: { query: 'SELECT 2' },
        priority: 'high',
      });
      const task3 = await delegateTask(testApp.app, alice.apiKey, {
        toBotId: bob.botId,
        prompt: 'run sql query 3',
        capability: 'run_sql_query',
        parameters: { query: 'SELECT 3' },
        priority: 'urgent',
      });

      expect(task1.statusCode).toBe(201);
      expect(task2.statusCode).toBe(201);
      expect(task3.statusCode).toBe(201);

      // Bob polls — should get tasks (priority ordering depends on poller impl)
      const polled = await pollTasks(testApp.app, bob.apiKey);
      expect(polled.statusCode).toBe(200);
      expect(polled.tasks.length).toBe(3);

      // Alice lists all tasks as sender
      const tasks = await listTasks(testApp.app, alice.apiKey, { role: 'from' });
      expect(tasks.data.total).toBe(3);
    });

    it('should handle task failure (non-completed status)', async () => {
      const alice = await registerTestBot(testApp.app, {
        name: 'alice_bot',
      }, testApiKey);
      const bob = await registerTestBot(testApp.app, {
        name: 'bob_bot',
        capabilities: [sqlCapability],
      }, testApiKey);

      const delegated = await delegateTask(testApp.app, alice.apiKey, {
        toBotId: bob.botId,
        prompt: 'run invalid sql',
        capability: 'run_sql_query',
        parameters: { query: 'INVALID SQL' },
      });
      const taskId = delegated.taskId!;

      await acceptTask(testApp.app, bob.apiKey, taskId);

      // Bob reports failure
      const failed = await completeTask(testApp.app, bob.apiKey, taskId, {
        status: 'failed',
        result: { error: 'syntax error at position 0' },
      });
      expect(failed.statusCode).toBe(200);
      expect(failed.status).toBe('failed');

      // Verify in DB
      const task = await getTask(testApp.app, alice.botId, taskId);
      expect(task.data.status).toBe('failed');

      // Verify task_failed event
      const messages = testApp.messageBus.getPublishedMessages();
      expect(messages.some((m) =>
        m.event === 'task_failed' && m.targetBotId === alice.botId
      )).toBe(true);
    });
  });
});
