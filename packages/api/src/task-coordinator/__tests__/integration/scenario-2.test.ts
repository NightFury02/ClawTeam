/**
 * Scenario 2: WebSocket Real-time Push Integration Test
 *
 * Tests that WebSocket clients receive real-time task_assigned events
 * when tasks are delegated to them.
 *
 * Prerequisites:
 * - PostgreSQL running (docker-compose up -d postgres)
 * - Database migrated (npm run migrate:up)
 *
 * Run:
 *   npx jest --testPathPattern='scenario-2' --testPathIgnorePatterns='/node_modules/' --no-coverage
 */

import Fastify, { FastifyInstance } from 'fastify';
import WebSocket from 'ws';
import type { DatabasePool, Logger } from '@clawteam/api/common';
import type { ICapabilityRegistry } from '@clawteam/api/capability-registry';
import type { ITaskCoordinator } from '../../interface';
import { createCapabilityRegistry, createRegistryRoutes, createUserRepository } from '@clawteam/api/capability-registry';
import messageBusPlugin, { type MessageBusPluginOptions } from '@clawteam/api/message-bus';
import { createTaskCoordinator } from '../../index';
import { createTaskRoutes } from '../../routes';
import {
  getTestDatabase,
  seedTestTeam,
  seedTestUser,
  registerTestBot,
  closeTestDatabase,
  cleanDatabase,
  createMockRedis,
  createSilentLogger,
} from './setup';

interface Scenario2TestApp {
  app: FastifyInstance;
  registry: ICapabilityRegistry;
  coordinator: ITaskCoordinator;
  port: number;
}

/**
 * Create a test app with real WebSocket support for Scenario 2.
 */
async function createScenario2TestApp(): Promise<Scenario2TestApp> {
  const db = getTestDatabase();
  const redis = createMockRedis();
  const logger = createSilentLogger();

  // Build real capability-registry
  const registry = createCapabilityRegistry({ db, redis: null, logger });
  const userRepo = createUserRepository(db);

  // Create Fastify app
  const app = Fastify({ logger: false });

  // Register message-bus plugin with WebSocket support
  // Use registry for API key validation
  await app.register(messageBusPlugin, {
    enablePubSub: false, // No Redis Pub/Sub needed for test
    registry,
  } as MessageBusPluginOptions);

  // Register capability-registry routes
  await app.register(createRegistryRoutes({ registry, userRepo }), { prefix: '/api/v1' });

  // Build task-coordinator with the real message bus from plugin
  const coordinator = createTaskCoordinator({
    db,
    redis,
    registry,
    messageBus: app.messageBus,
    logger,
  });

  // Register task-coordinator routes
  await app.register(
    createTaskRoutes({ coordinator, registry }),
    { prefix: '/api/v1/tasks' }
  );

  await app.ready();

  // Listen on random port
  const address = await app.listen({ port: 0, host: '127.0.0.1' });
  const port = (app.server.address() as any).port;

  return { app, registry, coordinator, port };
}

describe('Scenario 2: WebSocket Real-time Push', () => {
  let testApp: Scenario2TestApp;
  let teamId: string;
  let testApiKey: string;

  beforeAll(async () => {
    await cleanDatabase();
    const seed = await seedTestTeam();
    teamId = seed.teamId;
    const { apiKey } = await seedTestUser();
    testApiKey = apiKey;

    testApp = await createScenario2TestApp();
  }, 30000);

  afterAll(async () => {
    await testApp.app.close();
    await closeTestDatabase();
  });

  beforeEach(async () => {
    // Clean tasks between tests but keep team/bots
    const db = getTestDatabase();
    await db.query('DELETE FROM tasks');
  });

  it('should push task_assigned event via WebSocket when task is delegated', async () => {
    // 1. Register Alice (task sender) and Lily (task receiver)
    const alice = await registerTestBot(testApp.app, {
      name: 'scenario2_alice',
    }, testApiKey);

    const lily = await registerTestBot(testApp.app, {
      name: 'scenario2_lily',
      capabilities: [
        { name: 'test_capability', description: 'Test', async: false, estimatedTime: '5s' },
      ],
    }, testApiKey);

    // 2. Lily connects via WebSocket
    const wsUrl = `ws://127.0.0.1:${testApp.port}/ws?apiKey=${lily.apiKey}`;
    const ws = new WebSocket(wsUrl);

    // 3. Wait for connection
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', (err) => reject(err));
      setTimeout(() => reject(new Error('WebSocket connection timeout')), 5000);
    });

    // 4. Set up message listener
    const receivedMessages: any[] = [];
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      receivedMessages.push(msg);
    });

    // Wait for welcome message
    await new Promise((resolve) => setTimeout(resolve, 100));

    // 5. Alice delegates a task to Lily via HTTP
    const delegateResponse = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/tasks/delegate',
      headers: { authorization: `Bearer ${alice.apiKey}` },
      payload: {
        toBotId: lily.botId,
        prompt: 'test capability task',
        capability: 'test_capability',
        parameters: { foo: 'bar' },
        priority: 'normal',
      },
    });

    expect(delegateResponse.statusCode).toBe(201);
    const taskId = JSON.parse(delegateResponse.payload).data.taskId;

    // 6. Wait for WebSocket message
    await new Promise((resolve) => setTimeout(resolve, 500));

    // 7. Verify Lily received task_assigned event
    const taskAssignedMsg = receivedMessages.find(
      (m) => m.type === 'task_assigned'
    );

    expect(taskAssignedMsg).toBeDefined();
    expect(taskAssignedMsg.payload.taskId).toBe(taskId);
    expect(taskAssignedMsg.payload.capability).toBe('test_capability');
    expect(taskAssignedMsg.payload.fromBotId).toBe(alice.botId);

    ws.close();
  }, 15000);

  it('should deliver messages to bot that connects after task delegation (offline queue simulation)', async () => {
    // This test simulates the scenario where a bot receives tasks while offline
    // and gets them when reconnecting. Since we're using MockMessageBus for
    // task-coordinator, we test the WebSocket delivery path separately.

    // 1. Register bots
    const alice = await registerTestBot(testApp.app, {
      name: 'scenario2_alice_offline',
    }, testApiKey);

    const lily = await registerTestBot(testApp.app, {
      name: 'scenario2_lily_offline',
      capabilities: [
        { name: 'test_capability', description: 'Test', async: false, estimatedTime: '5s' },
      ],
    }, testApiKey);

    // 2. Alice delegates tasks while Lily is offline
    const task1Response = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/tasks/delegate',
      headers: { authorization: `Bearer ${alice.apiKey}` },
      payload: {
        toBotId: lily.botId,
        prompt: 'offline task 1',
        capability: 'test_capability',
        parameters: { offline: 1 },
      },
    });
    expect(task1Response.statusCode).toBe(201);
    const task1Id = JSON.parse(task1Response.payload).data.taskId;

    const task2Response = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/tasks/delegate',
      headers: { authorization: `Bearer ${alice.apiKey}` },
      payload: {
        toBotId: lily.botId,
        prompt: 'offline task 2',
        capability: 'test_capability',
        parameters: { offline: 2 },
      },
    });
    expect(task2Response.statusCode).toBe(201);
    const task2Id = JSON.parse(task2Response.payload).data.taskId;

    // 3. Lily comes online and polls for pending tasks
    const pollResponse = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/tasks/pending',
      headers: { authorization: `Bearer ${lily.apiKey}` },
    });

    expect(pollResponse.statusCode).toBe(200);
    const tasks = JSON.parse(pollResponse.payload).data.tasks;

    // 4. Verify both tasks are available via polling
    expect(tasks.length).toBeGreaterThanOrEqual(2);
    const taskIds = tasks.map((t: any) => t.id);
    expect(taskIds).toContain(task1Id);
    expect(taskIds).toContain(task2Id);
  }, 15000);

  it('should handle multiple WebSocket connections for the same bot', async () => {
    // 1. Register bot
    const lily = await registerTestBot(testApp.app, {
      name: 'scenario2_lily_multi',
      capabilities: [
        { name: 'test_capability', description: 'Test', async: false, estimatedTime: '5s' },
      ],
    }, testApiKey);

    const alice = await registerTestBot(testApp.app, {
      name: 'scenario2_alice_multi',
    }, testApiKey);

    // 2. Open two WebSocket connections for Lily
    const wsUrl = `ws://127.0.0.1:${testApp.port}/ws?apiKey=${lily.apiKey}`;
    const ws1 = new WebSocket(wsUrl);
    const ws2 = new WebSocket(wsUrl);

    await Promise.all([
      new Promise<void>((resolve) => ws1.on('open', resolve)),
      new Promise<void>((resolve) => ws2.on('open', resolve)),
    ]);

    const messages1: any[] = [];
    const messages2: any[] = [];

    ws1.on('message', (data) => messages1.push(JSON.parse(data.toString())));
    ws2.on('message', (data) => messages2.push(JSON.parse(data.toString())));

    // Wait for welcome messages
    await new Promise((resolve) => setTimeout(resolve, 100));

    // 3. Alice delegates a task
    const delegateResponse = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/tasks/delegate',
      headers: { authorization: `Bearer ${alice.apiKey}` },
      payload: {
        toBotId: lily.botId,
        prompt: 'multi connection task',
        capability: 'test_capability',
        parameters: { multi: true },
      },
    });
    expect(delegateResponse.statusCode).toBe(201);

    // 4. Wait for messages
    await new Promise((resolve) => setTimeout(resolve, 500));

    // 5. Both connections should receive the task_assigned event
    const taskMsg1 = messages1.find((m) => m.type === 'task_assigned');
    const taskMsg2 = messages2.find((m) => m.type === 'task_assigned');

    expect(taskMsg1).toBeDefined();
    expect(taskMsg2).toBeDefined();

    ws1.close();
    ws2.close();
  }, 15000);

  it('should reject WebSocket connection with invalid API key', async () => {
    const wsUrl = `ws://127.0.0.1:${testApp.port}/ws?apiKey=invalid-api-key`;
    const ws = new WebSocket(wsUrl);

    const closePromise = new Promise<{ code: number; reason: string }>((resolve) => {
      ws.on('close', (code, reason) => {
        resolve({ code, reason: reason.toString() });
      });
    });

    const result = await closePromise;

    // Should be closed with invalid API key code (4002)
    expect(result.code).toBe(4002);
    expect(result.reason).toContain('Invalid');
  }, 10000);

  it('should reject WebSocket connection without API key', async () => {
    const wsUrl = `ws://127.0.0.1:${testApp.port}/ws`;
    const ws = new WebSocket(wsUrl);

    const closePromise = new Promise<{ code: number; reason: string }>((resolve) => {
      ws.on('close', (code, reason) => {
        resolve({ code, reason: reason.toString() });
      });
    });

    const result = await closePromise;

    // Should be closed with missing params code (4001)
    expect(result.code).toBe(4001);
    expect(result.reason).toContain('Missing');
  }, 10000);
});
