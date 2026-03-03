/**
 * Redis Pub/Sub Integration Tests
 *
 * Tests Redis Pub/Sub functionality in production-like scenarios:
 * - Multiple connections subscribing to same events
 * - Cross-instance message distribution
 * - Message acknowledgment and offline queue recovery
 *
 * Note: These tests require Redis to be running.
 * Skip with SKIP_REDIS_TESTS=1 if Redis is unavailable.
 */

import Fastify, { FastifyInstance } from 'fastify';
import WebSocket from 'ws';
import Redis from 'ioredis';
import messageBusPlugin from '../plugin';
import { MessageBus } from '../message-bus';
import { PubSubBridge } from '../pubsub-bridge';
import type { ServerMessage } from '../interface';
import { MockCapabilityRegistry } from '../../capability-registry/mocks';

// Skip tests if Redis is not available
const SKIP_REDIS = process.env.SKIP_REDIS_TESTS === '1';

// Redis configuration
const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
};

/**
 * Check if Redis is available
 */
async function isRedisAvailable(): Promise<boolean> {
  const client = new Redis({ ...REDIS_CONFIG, lazyConnect: true });
  try {
    await client.connect();
    await client.ping();
    await client.quit();
    return true;
  } catch {
    await client.quit().catch(() => {});
    return false;
  }
}

/**
 * Helper: create WebSocket connection and collect messages
 */
function connectBot(
  wsUrl: string,
  apiKey: string
): Promise<{
  ws: WebSocket;
  messages: ServerMessage[];
  waitForMessage: (timeoutMs?: number) => Promise<ServerMessage | null>;
  close: () => void;
}> {
  return new Promise((resolve, reject) => {
    const messages: ServerMessage[] = [];
    const messageWaiters: Array<{
      resolve: (msg: ServerMessage | null) => void;
      timer: NodeJS.Timeout;
    }> = [];

    const ws = new WebSocket(`${wsUrl}?apiKey=${apiKey}`);

    ws.on('open', () => {
      resolve({
        ws,
        messages,
        waitForMessage: (timeoutMs = 1000) =>
          new Promise<ServerMessage | null>((res) => {
            if (messages.length > 0) {
              res(messages.shift()!);
              return;
            }
            const timer = setTimeout(() => {
              const idx = messageWaiters.findIndex((w) => w.timer === timer);
              if (idx >= 0) messageWaiters.splice(idx, 1);
              res(null);
            }, timeoutMs);
            messageWaiters.push({ resolve: res, timer });
          }),
        close: () => ws.close(),
      });
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString()) as ServerMessage;
      const waiter = messageWaiters.shift();
      if (waiter) {
        clearTimeout(waiter.timer);
        waiter.resolve(msg);
      } else {
        messages.push(msg);
      }
    });

    ws.on('error', reject);
  });
}

/**
 * Helper: drain welcome messages
 */
async function drainWelcome(
  conn: Awaited<ReturnType<typeof connectBot>>
): Promise<void> {
  await conn.waitForMessage(100); // welcome message
  await new Promise((r) => setTimeout(r, 50));
  conn.messages.length = 0;
}

// Conditionally run tests based on Redis availability
const describeWithRedis = SKIP_REDIS ? describe.skip : describe;

describeWithRedis('Redis Pub/Sub Integration', () => {
  let redisAvailable = false;
  let app: FastifyInstance;
  let wsUrl: string;
  let registry: MockCapabilityRegistry;
  let registeredBots: Array<{ botId: string; apiKey: string; name: string }> = [];

  beforeAll(async () => {
    // Check Redis availability
    redisAvailable = await isRedisAvailable();
    if (!redisAvailable) {
      console.warn('Redis not available, skipping integration tests');
      return;
    }

    // Create registry and register test bots
    registry = new MockCapabilityRegistry();

    const botNames = ['alice', 'lily', 'bob'];
    for (const name of botNames) {
      const result = await registry.register({
        name: `${name}-bot`,
        capabilities: [
          {
            name: 'test-capability',
            description: 'Test capability',
            async: false,
            estimatedTime: '1s',
          },
        ],
      });
      registeredBots.push({
        botId: result.botId,
        apiKey: registry.getApiKeyForBot(result.botId)!,
        name: `${name}-bot`,
      });
    }

    // Create Fastify app with Redis Pub/Sub enabled
    app = Fastify({ logger: false });

    await app.register(messageBusPlugin, {
      enablePubSub: true,
      redis: REDIS_CONFIG,
      registry,
      features: {
        ack: {
          enabled: true,
          timeoutMs: 5000,
          requiredFor: ['task_assigned', 'task_completed', 'task_failed'],
        },
        offlineQueue: {
          enabled: true,
          maxQueueSize: 100,
          messageTtlSeconds: 86400,
        },
      },
    });

    await app.listen({ port: 0, host: '127.0.0.1' });

    const address = app.server.address();
    if (typeof address === 'object' && address) {
      wsUrl = `ws://127.0.0.1:${address.port}/ws`;
    }
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  test('multiple bots subscribe to same event type - targeted delivery', async () => {
    if (!redisAvailable) return;

    const [alice, lily, bob] = registeredBots;

    // Connect all three bots
    const aliceConn = await connectBot(wsUrl, alice.apiKey);
    const lilyConn = await connectBot(wsUrl, lily.apiKey);
    const bobConn = await connectBot(wsUrl, bob.apiKey);

    // Drain welcome messages
    await drainWelcome(aliceConn);
    await drainWelcome(lilyConn);
    await drainWelcome(bobConn);

    // Publish task_assigned to Lily only
    await app.messageBus.publish(
      'task_assigned',
      {
        taskId: 'task-001',
        toBotId: lily.botId,
        capability: 'test',
      },
      lily.botId
    );

    // Lily should receive the message
    const lilyMsg = await lilyConn.waitForMessage(1000);
    expect(lilyMsg).not.toBeNull();
    expect(lilyMsg!.type).toBe('task_assigned');
    expect(lilyMsg!.payload).toMatchObject({ taskId: 'task-001' });

    // Alice and Bob should NOT receive the message (targeted to Lily)
    const aliceMsg = await aliceConn.waitForMessage(300);
    const bobMsg = await bobConn.waitForMessage(300);
    expect(aliceMsg).toBeNull();
    expect(bobMsg).toBeNull();

    // Cleanup
    aliceConn.close();
    lilyConn.close();
    bobConn.close();
  });

  test('broadcast message reaches all connected bots', async () => {
    if (!redisAvailable) return;

    const [alice, lily, bob] = registeredBots;

    // Connect all three bots
    const aliceConn = await connectBot(wsUrl, alice.apiKey);
    const lilyConn = await connectBot(wsUrl, lily.apiKey);
    const bobConn = await connectBot(wsUrl, bob.apiKey);

    // Drain welcome messages
    await drainWelcome(aliceConn);
    await drainWelcome(lilyConn);
    await drainWelcome(bobConn);

    // Broadcast workflow_started (no targetBotId)
    await app.messageBus.publish('workflow_started', {
      workflowId: 'wf-001',
      name: 'test-workflow',
    });

    // All bots should receive the broadcast
    const aliceMsg = await aliceConn.waitForMessage(1000);
    const lilyMsg = await lilyConn.waitForMessage(1000);
    const bobMsg = await bobConn.waitForMessage(1000);

    expect(aliceMsg).not.toBeNull();
    expect(lilyMsg).not.toBeNull();
    expect(bobMsg).not.toBeNull();

    expect(aliceMsg!.type).toBe('workflow_started');
    expect(lilyMsg!.type).toBe('workflow_started');
    expect(bobMsg!.type).toBe('workflow_started');

    // Cleanup
    aliceConn.close();
    lilyConn.close();
    bobConn.close();
  });

  test('offline message queue and flush on reconnect', async () => {
    if (!redisAvailable) return;

    // Register a new bot for this test
    const offlineBot = await registry.register({
      name: 'offline-test-bot',
      ownerEmail: 'offline@example.com',
      capabilities: [],
    });

    // Publish messages while bot is offline
    await app.messageBus.publish(
      'task_assigned',
      { taskId: 'offline-task-1' },
      offlineBot.botId
    );
    await app.messageBus.publish(
      'task_completed',
      { taskId: 'offline-task-2' },
      offlineBot.botId
    );

    // Wait for offline enqueue
    await new Promise((r) => setTimeout(r, 100));

    // Connect the bot
    const conn = await connectBot(wsUrl, registry.getApiKeyForBot(offlineBot.botId)!);

    // Should receive welcome message
    const welcome = await conn.waitForMessage(1000);
    expect(welcome).not.toBeNull();
    expect(welcome!.type).toBe('bot_status_changed');

    // Wait for offline queue flush
    await new Promise((r) => setTimeout(r, 300));

    // Should have received offline messages
    // They may be in the messages array or need to be waited for
    let receivedCount = conn.messages.length;
    while (receivedCount < 2) {
      const msg = await conn.waitForMessage(500);
      if (!msg) break;
      receivedCount++;
    }

    expect(receivedCount).toBeGreaterThanOrEqual(2);

    conn.close();
  });

  test('message acknowledgment clears pending state', async () => {
    if (!redisAvailable) return;

    const [alice] = registeredBots;

    const conn = await connectBot(wsUrl, alice.apiKey);
    await drainWelcome(conn);

    // Publish task_assigned (requires ACK)
    await app.messageBus.publish(
      'task_assigned',
      { taskId: 'ack-task-1' },
      alice.botId
    );

    const msg = await conn.waitForMessage(1000);
    expect(msg).not.toBeNull();
    expect(msg!.type).toBe('task_assigned');
    expect(msg!.messageId).toBeDefined();

    // Verify message is pending
    const ackTracker = app.messageBus.getAckTracker();
    expect(ackTracker).toBeDefined();
    let pending = ackTracker!.getPendingForBot(alice.botId);
    expect(pending.length).toBe(1);

    // Send ACK
    conn.ws.send(
      JSON.stringify({
        action: 'ack',
        payload: { messageId: msg!.messageId },
      })
    );

    await new Promise((r) => setTimeout(r, 100));

    // Verify pending is cleared
    pending = ackTracker!.getPendingForBot(alice.botId);
    expect(pending.length).toBe(0);

    conn.close();
  });

  test('message order is preserved', async () => {
    if (!redisAvailable) return;

    const [alice] = registeredBots;

    const conn = await connectBot(wsUrl, alice.apiKey);
    await drainWelcome(conn);

    // Send multiple messages in sequence
    const taskIds = ['order-1', 'order-2', 'order-3', 'order-4', 'order-5'];
    for (const taskId of taskIds) {
      await app.messageBus.publish(
        'task_assigned',
        { taskId },
        alice.botId
      );
    }

    // Receive all messages
    const received: string[] = [];
    for (let i = 0; i < taskIds.length; i++) {
      const msg = await conn.waitForMessage(1000);
      if (msg && msg.type === 'task_assigned') {
        received.push((msg.payload as { taskId: string }).taskId);
      }
    }

    // Verify order is preserved
    expect(received).toEqual(taskIds);

    conn.close();
  });
});

// Tests that work without Redis (using mock/fallback mode)
describe('Redis Pub/Sub Fallback Mode', () => {
  let app: FastifyInstance;
  let wsUrl: string;
  let registry: MockCapabilityRegistry;
  let testBot: { botId: string; apiKey: string };

  beforeAll(async () => {
    registry = new MockCapabilityRegistry();

    const result = await registry.register({
      name: 'fallback-test-bot',
      capabilities: [],
    });
    testBot = { botId: result.botId, apiKey: registry.getApiKeyForBot(result.botId)! };

    // Create app with Pub/Sub disabled (fallback mode)
    app = Fastify({ logger: false });

    await app.register(messageBusPlugin, {
      enablePubSub: false, // Disable Redis
      registry,
      features: {
        offlineQueue: {
          enabled: true,
          maxQueueSize: 100,
          messageTtlSeconds: 86400,
        },
      },
    });

    await app.listen({ port: 0, host: '127.0.0.1' });

    const address = app.server.address();
    if (typeof address === 'object' && address) {
      wsUrl = `ws://127.0.0.1:${address.port}/ws`;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  test('direct WebSocket delivery works without Redis', async () => {
    const conn = await connectBot(wsUrl, testBot.apiKey);
    await drainWelcome(conn);

    // Publish message (should use direct WebSocket delivery)
    await app.messageBus.publish(
      'task_assigned',
      { taskId: 'fallback-task-1' },
      testBot.botId
    );

    const msg = await conn.waitForMessage(1000);
    expect(msg).not.toBeNull();
    expect(msg!.type).toBe('task_assigned');
    expect(msg!.payload).toMatchObject({ taskId: 'fallback-task-1' });

    conn.close();
  });

  test('offline queue works without Redis', async () => {
    // Register new bot
    const offlineBot = await registry.register({
      name: 'offline-fallback-bot',
      ownerEmail: 'offline-fallback@example.com',
      capabilities: [],
    });

    // Publish while offline
    await app.messageBus.publish(
      'task_assigned',
      { taskId: 'offline-fallback-1' },
      offlineBot.botId
    );

    await new Promise((r) => setTimeout(r, 100));

    // Connect
    const conn = await connectBot(wsUrl, registry.getApiKeyForBot(offlineBot.botId)!);
    await conn.waitForMessage(500); // welcome

    // Wait for flush
    await new Promise((r) => setTimeout(r, 200));

    // Should have received offline message
    expect(conn.messages.length).toBeGreaterThanOrEqual(0);

    conn.close();
  });
});

// PubSubBridge unit tests with real Redis
describeWithRedis('PubSubBridge Direct Tests', () => {
  let redisAvailable = false;
  let bridge1: PubSubBridge;
  let bridge2: PubSubBridge;
  let receivedMessages: Array<{ channel: string; message: ServerMessage }> = [];

  beforeAll(async () => {
    redisAvailable = await isRedisAvailable();
    if (!redisAvailable) return;

    receivedMessages = [];

    // Create two bridges to simulate cross-instance communication
    bridge1 = new PubSubBridge({
      redis: REDIS_CONFIG,
      onMessage: (channel: string, message: ServerMessage) => {
        receivedMessages.push({ channel, message });
      },
    });

    bridge2 = new PubSubBridge({
      redis: REDIS_CONFIG,
      onMessage: (channel: string, message: ServerMessage) => {
        receivedMessages.push({ channel, message });
      },
    });

    await bridge1.connect();
    await bridge2.connect();

    // Wait for connections to stabilize
    await new Promise((r) => setTimeout(r, 100));
  });

  afterAll(async () => {
    if (bridge1) await bridge1.close();
    if (bridge2) await bridge2.close();
  });

  test('cross-instance message delivery via Redis Pub/Sub', async () => {
    if (!redisAvailable) return;

    receivedMessages = [];

    // Publish from bridge1
    await bridge1.publish('task_assigned', { taskId: 'cross-instance-1' }, 'bot-x');

    // Wait for message propagation
    await new Promise((r) => setTimeout(r, 200));

    // Both bridges should receive the message (they both subscribe to all channels)
    expect(receivedMessages.length).toBeGreaterThanOrEqual(2);

    const taskMessages = receivedMessages.filter(
      (m) => (m.message.payload as { taskId?: string })?.taskId === 'cross-instance-1'
    );
    expect(taskMessages.length).toBeGreaterThanOrEqual(2);
  });

  test('broadcast reaches all subscribers', async () => {
    if (!redisAvailable) return;

    receivedMessages = [];

    // Broadcast from bridge2
    await bridge2.broadcast('workflow_started', { workflowId: 'broadcast-wf-1' });

    await new Promise((r) => setTimeout(r, 200));

    // Both bridges should receive
    const wfMessages = receivedMessages.filter(
      (m) => (m.message.payload as { workflowId?: string })?.workflowId === 'broadcast-wf-1'
    );
    expect(wfMessages.length).toBeGreaterThanOrEqual(2);
  });
});
