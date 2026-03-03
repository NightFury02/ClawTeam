/**
 * Fastify WebSocket Plugin for Message Bus
 * Registers the /ws route and handles WebSocket connections.
 */

import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { WebSocket as WsWebSocket } from 'ws';
import fp from 'fastify-plugin';
import websocket from '@fastify/websocket';
import { MessageBus, type MessageBusOptions } from './message-bus';
import { WS_CLOSE_CODES } from './errors';
import type { ClientMessage, ServerMessage } from './interface';
import type { ICapabilityRegistry } from '../capability-registry/interface';

export interface MessageBusPluginOptions extends MessageBusOptions {
  /**
   * Capability Registry instance for API key validation.
   * When provided, botId is derived from the authenticated Bot object.
   * Takes priority over validateApiKey callback.
   */
  registry?: ICapabilityRegistry;

  /**
   * Legacy callback for API key validation.
   * Used when registry is not provided.
   * @deprecated Use registry instead for production
   */
  validateApiKey?: (
    botId: string,
    apiKey: string
  ) => Promise<{ valid: boolean; reason?: string }>;
}

declare module 'fastify' {
  interface FastifyInstance {
    messageBus: MessageBus;
  }
}

/**
 * Fastify plugin that sets up the Message Bus with WebSocket support.
 */
const messageBusPlugin: FastifyPluginAsync<MessageBusPluginOptions> = async (
  fastify,
  options
) => {
  // Register WebSocket plugin
  await fastify.register(websocket);

  // Create and initialize message bus
  const messageBus = new MessageBus({
    redis: options.redis,
    enablePubSub: options.enablePubSub,
    features: options.features,
    logger: fastify.log,
  });

  // Initialize Pub/Sub connection
  await messageBus.initialize();

  // Decorate fastify instance
  fastify.decorate('messageBus', messageBus);

  // WebSocket route
  fastify.get(
    '/ws',
    { websocket: true },
    async (socket: WsWebSocket, request: FastifyRequest) => {
      const query = request.query as { botId?: string; apiKey?: string };

      // Extract API key from query param or x-api-key header
      const apiKey = query.apiKey || (request.headers['x-api-key'] as string | undefined);

      let authenticatedBotId: string;

      // Three-tier authentication priority:
      // 1. If registry provided → use registry.validateApiKey()
      // 2. Else if validateApiKey callback provided → use callback
      // 3. Else → default pass (development mode)

      if (options.registry) {
        // Registry-based authentication: botId comes from the Bot object
        if (!apiKey) {
          socket.close(WS_CLOSE_CODES.MISSING_PARAMS, 'Missing apiKey parameter');
          return;
        }

        try {
          const bot = await options.registry.validateApiKey(apiKey);
          if (!bot) {
            socket.close(WS_CLOSE_CODES.INVALID_API_KEY, 'Invalid API key');
            return;
          }
          authenticatedBotId = bot.id;
        } catch (err: unknown) {
          fastify.log.error(`API key validation error: ${err}`);
          socket.close(WS_CLOSE_CODES.INVALID_API_KEY, 'Authentication error');
          return;
        }
      } else if (options.validateApiKey) {
        // Legacy callback-based authentication: botId from query param
        const { botId } = query;
        if (!botId || !apiKey) {
          socket.close(
            WS_CLOSE_CODES.MISSING_PARAMS,
            'Missing botId or apiKey parameter'
          );
          return;
        }

        const validation = await options.validateApiKey(botId, apiKey);
        if (!validation.valid) {
          socket.close(
            WS_CLOSE_CODES.INVALID_API_KEY,
            validation.reason || 'Invalid API key'
          );
          return;
        }
        authenticatedBotId = botId;
      } else {
        // Default pass (development mode): botId from query param
        const { botId } = query;
        if (!botId) {
          socket.close(WS_CLOSE_CODES.MISSING_PARAMS, 'Missing botId parameter');
          return;
        }
        authenticatedBotId = botId;
      }

      // Register connection
      const wsManager = messageBus.getWebSocketManager();
      wsManager.addConnection(authenticatedBotId, socket);

      fastify.log.info(`WebSocket connected: ${authenticatedBotId}`);

      // Handle incoming messages from client
      socket.on('message', async (data: Buffer | string) => {
        try {
          const messageStr =
            typeof data === 'string' ? data : data.toString('utf8');
          const clientMessage = JSON.parse(messageStr) as ClientMessage;

          await handleClientMessage(authenticatedBotId, clientMessage, messageBus);
        } catch (err: unknown) {
          fastify.log.error(`Error handling message from ${authenticatedBotId}: ${err}`);
        }
      });

      // Handle connection close
      socket.on('close', () => {
        fastify.log.info(`WebSocket disconnected: ${authenticatedBotId}`);
      });

      // Send welcome message
      const welcomeMessage: ServerMessage = {
        type: 'bot_status_changed',
        payload: {
          botId: authenticatedBotId,
          status: 'online',
          message: 'Connected to ClawTeam Message Bus',
        },
        timestamp: new Date().toISOString(),
      };
      socket.send(JSON.stringify(welcomeMessage));
    }
  );

  // Health check endpoint
  fastify.get('/health', async (request, reply) => {
    const startTime = Date.now();

    // Check Redis
    let redisStatus = 'healthy';
    let redisResponseTime = 0;
    let redisDetails = 'Redis ping successful';

    const pubSubBridge = (messageBus as any).pubSubBridge;
    if (pubSubBridge) {
      try {
        const redisPingStart = Date.now();
        const isReady = pubSubBridge.isReady();
        redisResponseTime = Date.now() - redisPingStart;
        if (!isReady) {
          redisStatus = 'unhealthy';
          redisDetails = 'Redis not ready';
        }
      } catch (err: unknown) {
        redisStatus = 'unhealthy';
        redisDetails = `Redis unavailable: ${err instanceof Error ? err.message : String(err)}`;
      }
    } else {
      redisStatus = 'disabled';
      redisDetails = 'Redis Pub/Sub not enabled';
    }

    // Check WebSocket
    const wsManager = messageBus.getWebSocketManager();
    const activeConnections = wsManager.getOnlineBots().length;
    const wsStatus = 'healthy'; // If we got here, WebSocket is running

    // Calculate overall status
    let overallStatus = 'healthy';
    let statusCode = 200;

    if (redisStatus === 'unhealthy') {
      overallStatus = 'degraded'; // Redis down but WebSocket works
    } else if (redisStatus === 'disabled') {
      overallStatus = 'healthy'; // Fallback mode is intentional
    }

    // Memory usage
    const memUsage = process.memoryUsage();
    const memUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const memTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);

    const response = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      service: 'message-bus',
      checks: {
        redis: {
          status: redisStatus,
          responseTime: redisResponseTime,
          details: redisDetails,
          lastCheck: new Date().toISOString(),
        },
        websocket: {
          status: wsStatus,
          activeConnections,
          details: `WebSocket server running with ${activeConnections} active connections`,
        },
      },
      uptime: Math.floor(process.uptime()),
      memory: {
        used: memUsedMB,
        total: memTotalMB,
        percentage: Math.round((memUsedMB / memTotalMB) * 100),
      },
    };

    return reply.code(statusCode).send(response);
  });

  // Cleanup on server close
  fastify.addHook('onClose', async () => {
    await messageBus.close();
  });
};

/**
 * Handle incoming client messages.
 */
async function handleClientMessage(
  botId: string,
  message: ClientMessage,
  messageBus: MessageBus
): Promise<void> {
  switch (message.action) {
    case 'status_update': {
      const { status } = message.payload as { status: string };
      if (
        status === 'online' ||
        status === 'offline' ||
        status === 'busy' ||
        status === 'focus_mode'
      ) {
        await messageBus.updateBotStatus(botId, status);
      }
      break;
    }
    case 'ack': {
      const { messageId } = message.payload as { messageId?: string };
      if (messageId) {
        messageBus.acknowledgeMessage(messageId);
      }
      break;
    }
    case 'subscribe':
      // Subscription is implicit via WebSocket connection
      break;
    case 'unsubscribe':
      // Client-initiated unsubscribe - just ack
      break;
    default:
      // Unknown action - ignore
      break;
  }
}

export default fp(messageBusPlugin, {
  name: 'message-bus',
  fastify: '4.x',
  dependencies: [],
});
