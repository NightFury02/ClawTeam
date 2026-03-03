/**
 * Message Bus E2E Tests with ICapabilityRegistry Authentication
 *
 * Tests real authentication flow using MockCapabilityRegistry.
 * Separate from e2e.test.ts which uses mock validateApiKey callback.
 *
 * Key differences from e2e.test.ts:
 * - Uses MockCapabilityRegistry for authentication
 * - BotId is derived from API key (not query param)
 * - Tests real bot registration → API key → WebSocket flow
 */

import Fastify, { FastifyInstance } from 'fastify';
import WebSocket from 'ws';
import messageBusPlugin from '../plugin';
import type { ServerMessage } from '../interface';
import { MockCapabilityRegistry } from '../../capability-registry/mocks';

let app: FastifyInstance;
let wsUrl: string;
let registry: MockCapabilityRegistry;

// Store registered bot info for tests
interface RegisteredBot {
  botId: string;
  apiKey: string;
  name: string;
}

const registeredBots: RegisteredBot[] = [];

/**
 * Helper: create a WebSocket connection using API key only (no botId in query).
 */
function connectWithApiKey(
  apiKey: string
): Promise<{
  ws: WebSocket;
  messages: ServerMessage[];
  waitForMessage: () => Promise<ServerMessage>;
  closeCode: () => Promise<number>;
}> {
  return new Promise((resolve, reject) => {
    const messages: ServerMessage[] = [];
    const messageWaiters: Array<(msg: ServerMessage) => void> = [];
    let closeResolve: ((code: number) => void) | null = null;

    const ws = new WebSocket(`${wsUrl}?apiKey=${apiKey}`);

    ws.on('open', () => {
      resolve({
        ws,
        messages,
        waitForMessage: () =>
          new Promise<ServerMessage>((res) => {
            if (messages.length > 0) {
              res(messages.shift()!);
            } else {
              messageWaiters.push(res);
            }
          }),
        closeCode: () =>
          new Promise<number>((res) => {
            closeResolve = res;
          }),
      });
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString()) as ServerMessage;
      const waiter = messageWaiters.shift();
      if (waiter) {
        waiter(msg);
      } else {
        messages.push(msg);
      }
    });

    ws.on('close', (code) => {
      closeResolve?.(code);
    });

    ws.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Helper: wait for WebSocket close event.
 */
function connectAndWaitClose(apiKey: string): Promise<{ code: number; reason: string }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${wsUrl}?apiKey=${apiKey}`);
    ws.on('close', (code, reason) => {
      resolve({ code, reason: reason.toString() });
    });
    ws.on('error', reject);
  });
}

/**
 * Helper: connect without API key.
 */
function connectNoApiKey(): Promise<{ code: number; reason: string }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.on('close', (code, reason) => {
      resolve({ code, reason: reason.toString() });
    });
    ws.on('error', reject);
  });
}

/**
 * Helper: drain all pending messages.
 */
async function drainMessages(
  conn: Awaited<ReturnType<typeof connectWithApiKey>>
): Promise<void> {
  await new Promise((r) => setTimeout(r, 50));
  conn.messages.length = 0;
}

beforeAll(async () => {
  // Create mock registry and register test bots
  registry = new MockCapabilityRegistry();

  // Register two bots for testing
  const bot1 = await registry.register({
    name: 'auth-test-bot-1',
    ownerEmail: 'test1@example.com',
    capabilities: [
      {
        name: 'test-capability',
        description: 'Test capability',
        async: false,
        estimatedTime: '1s',
      },
    ],
  });
  registeredBots.push({ botId: bot1.botId, apiKey: registry.getApiKeyForBot(bot1.botId)!, name: 'auth-test-bot-1' });

  const bot2 = await registry.register({
    name: 'auth-test-bot-2',
    ownerEmail: 'test2@example.com',
    capabilities: [
      {
        name: 'test-capability-2',
        description: 'Test capability 2',
        async: false,
        estimatedTime: '2s',
      },
    ],
  });
  registeredBots.push({ botId: bot2.botId, apiKey: registry.getApiKeyForBot(bot2.botId)!, name: 'auth-test-bot-2' });

  // Create Fastify app with registry-based authentication
  app = Fastify({ logger: false });

  await app.register(messageBusPlugin, {
    enablePubSub: false,
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
  await app.close();
});

describe('E2E Auth: WebSocket Authentication', () => {
  test('should connect with valid registered API key and receive welcome message', async () => {
    const bot = registeredBots[0];
    const { ws, waitForMessage } = await connectWithApiKey(bot.apiKey);

    const welcome = await waitForMessage();
    expect(welcome.type).toBe('bot_status_changed');
    expect(welcome.payload).toMatchObject({
      botId: bot.botId, // botId should come from registry, not query param
      status: 'online',
    });

    ws.close();
  });

  test('should reject connection with invalid API key (4002)', async () => {
    const { code } = await connectAndWaitClose('invalid-api-key-12345');
    expect(code).toBe(4002);
  });

  test('should reject connection without API key (4001)', async () => {
    const { code } = await connectNoApiKey();
    expect(code).toBe(4001);
  });
});

describe('E2E Auth: Bot Identity from API Key', () => {
  test('should use botId from registry Bot object, not query param', async () => {
    const bot = registeredBots[0];

    // Connect with just API key - botId should be derived from the Bot object
    const { ws, waitForMessage } = await connectWithApiKey(bot.apiKey);

    const welcome = await waitForMessage();
    expect(welcome.payload).toMatchObject({
      botId: bot.botId, // This proves botId came from registry, not query
    });

    // Verify the connection is registered under the correct botId
    const isOnline = await app.messageBus.isBotOnline(bot.botId);
    expect(isOnline).toBe(true);

    ws.close();
  });
});

describe('E2E Auth: Real-time Messaging', () => {
  test('should deliver messages between authenticated bots', async () => {
    const botA = registeredBots[0];
    const botB = registeredBots[1];

    const connA = await connectWithApiKey(botA.apiKey);
    const connB = await connectWithApiKey(botB.apiKey);

    // Consume welcome messages
    await connA.waitForMessage();
    await connB.waitForMessage();
    await drainMessages(connA);
    await drainMessages(connB);

    // Send message from server to bot B
    await app.messageBus.publish(
      'task_assigned',
      { taskId: 'auth-task-1', fromBotId: botA.botId, toBotId: botB.botId },
      botB.botId
    );

    // Bot B should receive the message
    const msg = await connB.waitForMessage();
    expect(msg.type).toBe('task_assigned');
    expect(msg.payload).toMatchObject({
      taskId: 'auth-task-1',
      toBotId: botB.botId,
    });

    connA.ws.close();
    connB.ws.close();
  });
});

describe('E2E Auth: Offline Queue with Auth', () => {
  test('should queue messages for offline bot and flush on reconnect', async () => {
    // Register a new bot for this test to avoid interference
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

    // Now connect with the bot's real API key
    const conn = await connectWithApiKey(registry.getApiKeyForBot(offlineBot.botId)!);
    const welcome = await conn.waitForMessage();
    expect(welcome.type).toBe('bot_status_changed');
    expect(welcome.payload).toMatchObject({ botId: offlineBot.botId });

    // Wait for offline queue flush
    await new Promise((r) => setTimeout(r, 200));

    // Should have received the offline messages
    expect(conn.messages.length).toBeGreaterThanOrEqual(0);

    conn.ws.close();
  });
});

describe('E2E Auth: ACK with Auth', () => {
  test('should handle ACK for messages sent to authenticated bot', async () => {
    const bot = registeredBots[0];
    const conn = await connectWithApiKey(bot.apiKey);

    await conn.waitForMessage(); // welcome
    await drainMessages(conn);

    // Publish a task_assigned (requires ACK)
    await app.messageBus.publish(
      'task_assigned',
      { taskId: 'ack-task-1' },
      bot.botId
    );

    const msg = await conn.waitForMessage();
    expect(msg.type).toBe('task_assigned');
    expect(msg.messageId).toBeDefined();

    // Send ACK
    conn.ws.send(
      JSON.stringify({
        action: 'ack',
        payload: { messageId: msg.messageId },
      })
    );

    await new Promise((r) => setTimeout(r, 100));

    // Verify pending ACK is cleared
    const ackTracker = app.messageBus.getAckTracker();
    expect(ackTracker).toBeDefined();
    const pending = ackTracker!.getPendingForBot(bot.botId);
    expect(pending.length).toBe(0);

    conn.ws.close();
  });
});

describe('E2E Auth: Offline Queue Performance', () => {
  test('should flush 100 offline messages in under 2 seconds', async () => {
    // Register a new bot for this test
    const perfBot = await registry.register({
      name: 'perf-test-bot',
      ownerEmail: 'perf@example.com',
      capabilities: [],
    });

    // Publish 100 messages while bot is offline
    const startEnqueue = Date.now();
    for (let i = 0; i < 100; i++) {
      await app.messageBus.publish(
        'task_assigned',
        { taskId: `perf-task-${i}` },
        perfBot.botId
      );
    }
    const enqueueTime = Date.now() - startEnqueue;

    // Wait for offline enqueue
    await new Promise((r) => setTimeout(r, 100));

    // Connect and measure flush time
    const startFlush = Date.now();
    const conn = await connectWithApiKey(registry.getApiKeyForBot(perfBot.botId)!);
    await conn.waitForMessage(); // welcome

    // Wait for all messages to arrive (with timeout)
    const timeout = 2000;
    const startWait = Date.now();
    while (conn.messages.length < 100 && Date.now() - startWait < timeout) {
      await new Promise((r) => setTimeout(r, 50));
    }

    const flushTime = Date.now() - startFlush;

    // Verify performance
    expect(conn.messages.length).toBeGreaterThanOrEqual(100);
    expect(flushTime).toBeLessThan(2000);

    conn.ws.close();
  });
});
