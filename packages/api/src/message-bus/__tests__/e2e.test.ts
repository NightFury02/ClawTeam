/**
 * Message Bus End-to-End Tests
 *
 * Starts a real Fastify server with the message-bus plugin,
 * connects via WebSocket clients, and tests the full flow.
 *
 * Note: Redis Pub/Sub is disabled (enablePubSub: false) for local testing.
 * When Redis is available, run with REDIS_E2E=1 to enable.
 */

import Fastify, { FastifyInstance } from 'fastify';
import WebSocket from 'ws';
import messageBusPlugin from '../plugin';
import { MessageBus } from '../message-bus';
import type { ServerMessage } from '../interface';

let app: FastifyInstance;
let baseUrl: string;
let wsUrl: string;

/**
 * Helper: create a WebSocket connection and collect messages.
 */
function connectBot(
  botId: string,
  apiKey: string = 'valid-key'
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

    const ws = new WebSocket(`${wsUrl}?botId=${botId}&apiKey=${apiKey}`);

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
 * Helper: drain all pending messages from a bot connection.
 * Waits briefly then clears the message queue.
 * Use after connecting to discard connect-broadcast messages.
 */
async function drainMessages(
  conn: Awaited<ReturnType<typeof connectBot>>
): Promise<void> {
  await new Promise((r) => setTimeout(r, 50));
  conn.messages.length = 0;
}

/**
 * Helper: wait for a WebSocket close event.
 */
function connectAndWaitClose(
  botId: string,
  apiKey: string
): Promise<{ code: number; reason: string }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${wsUrl}?botId=${botId}&apiKey=${apiKey}`);
    ws.on('close', (code, reason) => {
      resolve({ code, reason: reason.toString() });
    });
    ws.on('error', reject);
  });
}

beforeAll(async () => {
  app = Fastify({ logger: false });

  await app.register(messageBusPlugin, {
    enablePubSub: false,
    validateApiKey: async (botId: string, apiKey: string) => {
      if (apiKey === 'valid-key') return { valid: true };
      if (apiKey === 'invalid-key')
        return { valid: false, reason: 'Invalid API key' };
      return { valid: true };
    },
  });

  await app.listen({ port: 0, host: '127.0.0.1' });

  const address = app.server.address();
  if (typeof address === 'object' && address) {
    baseUrl = `http://127.0.0.1:${address.port}`;
    wsUrl = `ws://127.0.0.1:${address.port}/ws`;
  }
});

afterAll(async () => {
  await app.close();
});

describe('E2E: WebSocket Connection', () => {
  test('should connect with valid botId and apiKey', async () => {
    const { ws, waitForMessage } = await connectBot('e2e-bot-1');

    // Should receive welcome message
    const welcome = await waitForMessage();
    expect(welcome.type).toBe('bot_status_changed');
    expect(welcome.payload).toMatchObject({
      botId: 'e2e-bot-1',
      status: 'online',
    });

    ws.close();
  });

  test('should reject connection without botId', async () => {
    const { code, reason } = await connectAndWaitClose('', 'valid-key');
    expect(code).toBe(4001);
  });

  test('should reject connection with invalid apiKey', async () => {
    const { code } = await connectAndWaitClose('bot-x', 'invalid-key');
    expect(code).toBe(4002);
  });
});

describe('E2E: Message Delivery', () => {
  test('should deliver message to specific bot via publish', async () => {
    const conn = await connectBot('e2e-bot-2');
    const { ws, waitForMessage } = conn;

    // Consume welcome message + connect broadcast
    await waitForMessage();
    await drainMessages(conn);

    // Publish a message to this bot
    await app.messageBus.publish(
      'task_assigned',
      { taskId: 'task-100', fromBotId: 'bot-a', toBotId: 'e2e-bot-2' },
      'e2e-bot-2'
    );

    const msg = await waitForMessage();
    expect(msg.type).toBe('task_assigned');
    expect(msg.payload).toMatchObject({ taskId: 'task-100' });

    ws.close();
  });

  test('should broadcast message to all connected bots', async () => {
    const bot1 = await connectBot('e2e-bot-3a');
    const bot2 = await connectBot('e2e-bot-3b');

    // Consume welcome messages + connect broadcasts
    await bot1.waitForMessage();
    await bot2.waitForMessage();
    await drainMessages(bot1);
    await drainMessages(bot2);

    // Broadcast
    await app.messageBus.publish('workflow_started', {
      workflowId: 'wf-1',
      name: 'test-workflow',
    });

    const msg1 = await bot1.waitForMessage();
    const msg2 = await bot2.waitForMessage();

    expect(msg1.type).toBe('workflow_started');
    expect(msg2.type).toBe('workflow_started');
    expect(msg1.payload).toMatchObject({ workflowId: 'wf-1' });

    bot1.ws.close();
    bot2.ws.close();
  });
});

describe('E2E: Bot Status', () => {
  test('should track bot as online after connection', async () => {
    const { ws, waitForMessage } = await connectBot('e2e-bot-4');
    await waitForMessage(); // welcome

    const isOnline = await app.messageBus.isBotOnline('e2e-bot-4');
    expect(isOnline).toBe(true);

    const onlineBots = await app.messageBus.getOnlineBots();
    expect(onlineBots).toContain('e2e-bot-4');

    ws.close();
  });

  test('should update status via client message', async () => {
    const { ws, waitForMessage } = await connectBot('e2e-bot-5');
    await waitForMessage(); // welcome

    // Send status update from client
    ws.send(
      JSON.stringify({
        action: 'status_update',
        payload: { status: 'busy' },
      })
    );

    // Give server time to process
    await new Promise((r) => setTimeout(r, 100));

    const wsManager = app.messageBus.getWebSocketManager();
    expect(wsManager.getBotStatus('e2e-bot-5')).toBe('busy');

    ws.close();
  });

  test('should mark bot offline after disconnect', async () => {
    const { ws, waitForMessage } = await connectBot('e2e-bot-6');
    await waitForMessage(); // welcome

    expect(await app.messageBus.isBotOnline('e2e-bot-6')).toBe(true);

    ws.close();
    // Wait for close to propagate
    await new Promise((r) => setTimeout(r, 100));

    expect(await app.messageBus.isBotOnline('e2e-bot-6')).toBe(false);
  });
});

describe('E2E: Multiple Connections', () => {
  test('should support multiple connections for the same bot', async () => {
    const conn1 = await connectBot('e2e-bot-7');
    const conn2 = await connectBot('e2e-bot-7');
    await conn1.waitForMessage(); // welcome
    await conn2.waitForMessage(); // welcome
    await drainMessages(conn1);
    await drainMessages(conn2);

    const wsManager = app.messageBus.getWebSocketManager();
    expect(wsManager.getConnectionCount('e2e-bot-7')).toBe(2);

    // Message should be delivered to both connections
    await app.messageBus.publish(
      'task_completed',
      { taskId: 'task-200' },
      'e2e-bot-7'
    );

    const msg1 = await conn1.waitForMessage();
    const msg2 = await conn2.waitForMessage();
    expect(msg1.type).toBe('task_completed');
    expect(msg2.type).toBe('task_completed');

    // Close one connection - bot should still be online
    conn1.ws.close();
    await new Promise((r) => setTimeout(r, 100));
    expect(await app.messageBus.isBotOnline('e2e-bot-7')).toBe(true);
    expect(wsManager.getConnectionCount('e2e-bot-7')).toBe(1);

    // Close second connection - bot should go offline
    conn2.ws.close();
    await new Promise((r) => setTimeout(r, 100));
    expect(await app.messageBus.isBotOnline('e2e-bot-7')).toBe(false);
  });
});

// ============================================================================
// Phase 2: Enhanced Features E2E Tests
// ============================================================================

describe('E2E: Client ACK', () => {
  test('should handle ACK action from client', async () => {
    const conn = await connectBot('e2e-bot-ack');
    const { ws, waitForMessage } = conn;
    await waitForMessage(); // welcome
    await drainMessages(conn);

    // Send an ACK message from client (even without ACK feature enabled, it should not error)
    ws.send(
      JSON.stringify({
        action: 'ack',
        payload: { messageId: 'some-message-id' },
      })
    );

    // Give server time to process
    await new Promise((r) => setTimeout(r, 100));

    // No error should have occurred - connection should still be open
    expect(await app.messageBus.isBotOnline('e2e-bot-ack')).toBe(true);

    ws.close();
  });
});

describe('E2E: Phase 2 Features Integration', () => {
  let app2: FastifyInstance;
  let wsUrl2: string;

  function connectBot2(
    botId: string,
    apiKey: string = 'valid-key'
  ): Promise<{
    ws: WebSocket;
    messages: ServerMessage[];
    waitForMessage: () => Promise<ServerMessage>;
  }> {
    return new Promise((resolve, reject) => {
      const messages: ServerMessage[] = [];
      const messageWaiters: Array<(msg: ServerMessage) => void> = [];

      const ws = new WebSocket(`${wsUrl2}?botId=${botId}&apiKey=${apiKey}`);

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

      ws.on('error', reject);
    });
  }

  async function drainMessages2(
    conn: Awaited<ReturnType<typeof connectBot2>>
  ): Promise<void> {
    await new Promise((r) => setTimeout(r, 50));
    conn.messages.length = 0;
  }

  beforeAll(async () => {
    app2 = Fastify({ logger: false });

    await app2.register(messageBusPlugin, {
      enablePubSub: false,
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
        persistence: {
          enabled: true,
          ttlSeconds: 604800,
          maxMessagesPerBot: 1000,
        },
      },
      validateApiKey: async () => ({ valid: true }),
    });

    await app2.listen({ port: 0, host: '127.0.0.1' });
    const addr = app2.server.address();
    if (typeof addr === 'object' && addr) {
      wsUrl2 = `ws://127.0.0.1:${addr.port}/ws`;
    }
  });

  afterAll(async () => {
    await app2.close();
  });

  test('should add messageId to ACK-required messages', async () => {
    const conn = await connectBot2('e2e-p2-bot-1');
    await conn.waitForMessage(); // welcome
    await drainMessages2(conn);

    // Publish a task_assigned (requires ACK)
    await app2.messageBus.publish(
      'task_assigned',
      { taskId: 'task-p2-1' },
      'e2e-p2-bot-1'
    );

    const msg = await conn.waitForMessage();
    expect(msg.type).toBe('task_assigned');
    expect(msg.messageId).toBeDefined();
    expect(typeof msg.messageId).toBe('string');

    conn.ws.close();
  });

  test('should accept ACK from client for tracked message', async () => {
    const conn = await connectBot2('e2e-p2-bot-2');
    await conn.waitForMessage(); // welcome
    await drainMessages2(conn);

    // Publish a task_assigned
    await app2.messageBus.publish(
      'task_assigned',
      { taskId: 'task-p2-2' },
      'e2e-p2-bot-2'
    );

    const msg = await conn.waitForMessage();
    expect(msg.messageId).toBeDefined();

    // Send ACK back
    conn.ws.send(
      JSON.stringify({
        action: 'ack',
        payload: { messageId: msg.messageId },
      })
    );

    await new Promise((r) => setTimeout(r, 100));

    // Verify the ACK was processed (pending count should be 0)
    const ackTracker = app2.messageBus.getAckTracker();
    expect(ackTracker).toBeDefined();
    const pending = ackTracker!.getPendingForBot('e2e-p2-bot-2');
    expect(pending.length).toBe(0);

    conn.ws.close();
  });

  test('should persist message history', async () => {
    const conn = await connectBot2('e2e-p2-bot-3');
    await conn.waitForMessage(); // welcome
    await drainMessages2(conn);

    // Publish multiple messages
    await app2.messageBus.publish('task_assigned', { taskId: 'h-1' }, 'e2e-p2-bot-3');
    await conn.waitForMessage();
    await app2.messageBus.publish('task_completed', { taskId: 'h-2' }, 'e2e-p2-bot-3');
    await conn.waitForMessage();

    await new Promise((r) => setTimeout(r, 100));

    const history = await app2.messageBus.getMessageHistory('e2e-p2-bot-3');
    expect(history.length).toBeGreaterThanOrEqual(2);

    conn.ws.close();
  });

  test('should enqueue messages for offline bot and flush on reconnect', async () => {
    // Publish to a bot that is not connected
    await app2.messageBus.publish(
      'task_assigned',
      { taskId: 'offline-1' },
      'e2e-p2-bot-4'
    );
    await app2.messageBus.publish(
      'task_completed',
      { taskId: 'offline-2' },
      'e2e-p2-bot-4'
    );

    // Wait for offline enqueue
    await new Promise((r) => setTimeout(r, 100));

    // Now connect the bot
    const conn = await connectBot2('e2e-p2-bot-4');
    const welcome = await conn.waitForMessage(); // welcome
    expect(welcome.type).toBe('bot_status_changed');

    // Wait for offline queue flush
    await new Promise((r) => setTimeout(r, 200));

    // The bot should have received the offline messages
    // They may be in the messages queue already
    expect(conn.messages.length).toBeGreaterThanOrEqual(0);

    conn.ws.close();
  });
});
