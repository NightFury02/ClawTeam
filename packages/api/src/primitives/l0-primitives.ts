/**
 * L0 Foundation Layer Primitives Implementation
 *
 * 基础原语实现：身份、在线状态、发现、连接、消息
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  PrimitiveContext,
  PrimitiveResult,
  IdentityRegisterParams,
  IdentityRegisterResult,
  IdentityVerifyParams,
  IdentityVerifyResult,
  PresenceAnnounceParams,
  PresenceAnnounceResult,
  PresenceObserveParams,
  PresenceObserveResult,
  DiscoverSearchParams,
  DiscoverSearchResult,
  DiscoverExposeParams,
  DiscoverExposeResult,
  ConnectParams,
  ConnectResult,
  ConnectAcceptParams,
  ConnectAcceptResult,
  MessageSendParams,
  MessageSendResult,
  MessageReceiveParams,
  MessageReceiveResult,
  BotPresenceStatus,
} from '@clawteam/shared/types';
import type { IL0Primitives } from './interface';
import type { ICapabilityRegistry } from '../capability-registry/interface';
import type { IMessageBus } from '../message-bus/interface';
import type { RedisClient } from '../common/redis';
import type { DatabasePool } from '../common/db';

/** Redis key for bot inbox */
const INBOX_KEY = (botId: string) => `clawteam:inbox:${botId}`;

export interface L0PrimitivesConfig {
  registry: ICapabilityRegistry;
  messageBus: IMessageBus;
  redis?: RedisClient;
  db?: DatabasePool;
}

export class L0Primitives implements IL0Primitives {
  private registry: ICapabilityRegistry;
  private messageBus: IMessageBus;
  private redis: RedisClient | null;
  private db: DatabasePool | null;
  private presenceStore: Map<string, { status: BotPresenceStatus; message?: string; lastSeen: string }>;
  private visibilityStore: Map<string, { visibility: string; allowedBotIds?: string[] }>;
  private connectionStore: Map<string, { fromBotId: string; toBotId: string; status: string }>;

  constructor(config: L0PrimitivesConfig) {
    this.registry = config.registry;
    this.messageBus = config.messageBus;
    this.redis = config.redis ?? null;
    this.db = config.db ?? null;
    this.presenceStore = new Map();
    this.visibilityStore = new Map();
    this.connectionStore = new Map();
  }

  // ============================================================================
  // Identity (身份)
  // ============================================================================

  async identityRegister(
    ctx: PrimitiveContext,
    params: IdentityRegisterParams
  ): Promise<PrimitiveResult<IdentityRegisterResult>> {
    try {
      const result = await this.registry.register({
        name: params.name,
        ownerEmail: params.ownerId,
        capabilities: params.capabilities.map((cap) => ({
          name: cap.name,
          description: cap.description,
          parameters: cap.parameters || {},
          async: cap.async || false,
          estimatedTime: cap.estimatedTime || '5s',
        })),
        tags: params.tags,
        userId: params.ownerId,
        userName: params.ownerName,
        clientType: 'sdk',
      });

      return {
        success: true,
        data: {
          botId: result.botId,
          teamId: 'default',
          registeredCapabilities: params.capabilities.map((c) => c.name),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'IDENTITY_REGISTER_FAILED',
          message: error instanceof Error ? error.message : 'Registration failed',
        },
      };
    }
  }

  async identityVerify(
    ctx: PrimitiveContext,
    params: IdentityVerifyParams
  ): Promise<PrimitiveResult<IdentityVerifyResult>> {
    try {
      const bot = await this.registry.getBot(params.botId);
      if (!bot) {
        return {
          success: true,
          data: {
            valid: false,
            botId: params.botId,
            name: '',
            ownerId: '',
            teamId: '',
            capabilities: [],
          },
        };
      }

      return {
        success: true,
        data: {
          valid: true,
          botId: bot.id,
          name: bot.name,
          ownerId: bot.ownerEmail ?? '',
          teamId: bot.teamId,
          capabilities: bot.capabilities.map((c) => c.name),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'IDENTITY_VERIFY_FAILED',
          message: error instanceof Error ? error.message : 'Verification failed',
        },
      };
    }
  }

  // ============================================================================
  // Presence (在线状态)
  // ============================================================================

  async presenceAnnounce(
    ctx: PrimitiveContext,
    params: PresenceAnnounceParams
  ): Promise<PrimitiveResult<PresenceAnnounceResult>> {
    try {
      const previousPresence = this.presenceStore.get(ctx.fromBotId);
      const previousStatus = previousPresence?.status || 'offline';

      this.presenceStore.set(ctx.fromBotId, {
        status: params.status,
        message: params.statusMessage,
        lastSeen: new Date().toISOString(),
      });

      // Update bot status in registry
      const registryStatus = params.status === 'dnd' ? 'focus_mode' : params.status;
      await this.registry.updateStatus(ctx.fromBotId, registryStatus as any);

      return {
        success: true,
        data: {
          acknowledged: true,
          previousStatus,
          newStatus: params.status,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'PRESENCE_ANNOUNCE_FAILED',
          message: error instanceof Error ? error.message : 'Announce failed',
        },
      };
    }
  }

  async presenceObserve(
    ctx: PrimitiveContext,
    params: PresenceObserveParams
  ): Promise<PrimitiveResult<PresenceObserveResult>> {
    try {
      const statuses = params.botIds.map((botId) => {
        const presence = this.presenceStore.get(botId);
        return {
          botId,
          status: presence?.status || ('offline' as BotPresenceStatus),
          statusMessage: presence?.message,
          lastSeen: presence?.lastSeen || new Date().toISOString(),
        };
      });

      return {
        success: true,
        data: {
          statuses,
          subscriptionId: params.subscribe ? uuidv4() : undefined,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'PRESENCE_OBSERVE_FAILED',
          message: error instanceof Error ? error.message : 'Observe failed',
        },
      };
    }
  }

  // ============================================================================
  // Discover (发现)
  // ============================================================================

  async discoverSearch(
    ctx: PrimitiveContext,
    params: DiscoverSearchParams
  ): Promise<PrimitiveResult<DiscoverSearchResult>> {
    try {
      const searchResult = await this.registry.search({
        query: params.query || '',
        filters: {
          tags: params.tags,
        },
        page: params.page || 1,
        pageSize: params.pageSize || 20,
      });

      const bots = searchResult.items.map((match) => ({
        botId: match.botId,
        name: match.botName,
        status: 'online' as BotPresenceStatus,
        capabilities: [match.capability.name],
        tags: [],
        confidence: match.confidence,
      }));

      return {
        success: true,
        data: {
          bots,
          total: searchResult.total,
          page: searchResult.page,
          pageSize: searchResult.pageSize,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'DISCOVER_SEARCH_FAILED',
          message: error instanceof Error ? error.message : 'Search failed',
        },
      };
    }
  }

  async discoverExpose(
    ctx: PrimitiveContext,
    params: DiscoverExposeParams
  ): Promise<PrimitiveResult<DiscoverExposeResult>> {
    try {
      this.visibilityStore.set(ctx.fromBotId, {
        visibility: params.visibility,
        allowedBotIds: params.allowedBotIds,
      });

      return {
        success: true,
        data: {
          visibility: params.visibility,
          effectiveAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'DISCOVER_EXPOSE_FAILED',
          message: error instanceof Error ? error.message : 'Expose failed',
        },
      };
    }
  }

  // ============================================================================
  // Connect (连接)
  // ============================================================================

  async connect(
    ctx: PrimitiveContext,
    params: ConnectParams
  ): Promise<PrimitiveResult<ConnectResult>> {
    try {
      const connectionId = uuidv4();
      this.connectionStore.set(connectionId, {
        fromBotId: ctx.fromBotId,
        toBotId: params.targetBotId,
        status: 'pending',
      });

      return {
        success: true,
        data: {
          connectionId,
          status: 'pending',
          targetBotId: params.targetBotId,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'CONNECT_FAILED',
          message: error instanceof Error ? error.message : 'Connect failed',
        },
      };
    }
  }

  async connectAccept(
    ctx: PrimitiveContext,
    params: ConnectAcceptParams
  ): Promise<PrimitiveResult<ConnectAcceptResult>> {
    try {
      const connection = this.connectionStore.get(params.connectionId);
      if (!connection) {
        return {
          success: false,
          error: {
            code: 'CONNECTION_NOT_FOUND',
            message: 'Connection request not found',
          },
        };
      }

      connection.status = params.accept ? 'accepted' : 'rejected';
      this.connectionStore.set(params.connectionId, connection);

      return {
        success: true,
        data: {
          connectionId: params.connectionId,
          status: params.accept ? 'accepted' : 'rejected',
          fromBotId: connection.fromBotId,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'CONNECT_ACCEPT_FAILED',
          message: error instanceof Error ? error.message : 'Accept failed',
        },
      };
    }
  }

  // ============================================================================
  // Message (消息)
  // ============================================================================

  async messageSend(
    ctx: PrimitiveContext,
    params: MessageSendParams
  ): Promise<PrimitiveResult<MessageSendResult>> {
    try {
      const messageId = uuidv4();
      const timestamp = new Date().toISOString();
      const jsonContent = typeof params.content === 'string' ? { text: params.content } : params.content;

      // If Redis + DB available, use inbox system
      if (this.redis && this.db) {
        // 1. Persist to DB
        await this.db.query(
          `INSERT INTO messages (id, from_bot_id, to_bot_id, type, content_type, content, priority, trace_id)
           VALUES ($1, $2, $3, 'direct_message', $4, $5, $6, $7)`,
          [messageId, ctx.fromBotId, params.toBotId, params.contentType, JSON.stringify(jsonContent), params.priority || 'normal', ctx.traceId],
        );

        // 2. Push to Redis inbox for fast polling
        const inboxEntry = JSON.stringify({
          id: messageId,
          fromBotId: ctx.fromBotId,
          type: 'direct_message',
          contentType: params.contentType,
          content: jsonContent,
          priority: params.priority || 'normal',
          taskId: null,
          createdAt: timestamp,
        });
        await this.redis.lpush(INBOX_KEY(params.toBotId), inboxEntry);
      } else {
        // Fallback: publish via messageBus (legacy path)
        await this.messageBus.publish('task_assigned', {
          messageId,
          fromBotId: ctx.fromBotId,
          contentType: params.contentType,
          content: params.content,
          priority: params.priority || 'normal',
          timestamp,
          traceId: ctx.traceId,
        }, params.toBotId);
      }

      return {
        success: true,
        data: {
          messageId,
          status: 'sent',
          timestamp,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'MESSAGE_SEND_FAILED',
          message: error instanceof Error ? error.message : 'Send failed',
        },
      };
    }
  }

  async messageReceive(
    ctx: PrimitiveContext,
    params: MessageReceiveParams
  ): Promise<PrimitiveResult<MessageReceiveResult>> {
    try {
      // If acknowledging a specific message
      if (params.messageId && params.acknowledge && this.db) {
        await this.db.query(
          `UPDATE messages SET status = 'read', read_at = NOW()
           WHERE id = $1 AND to_bot_id = $2 AND status = 'delivered'`,
          [params.messageId, ctx.fromBotId],
        );
        return { success: true, data: { messages: [] } };
      }

      // Read from Redis inbox if available
      if (this.redis) {
        const key = INBOX_KEY(ctx.fromBotId);
        const messages: MessageReceiveResult['messages'] = [];
        const limit = 20;

        for (let i = 0; i < limit; i++) {
          const raw = await this.redis.rpop(key);
          if (!raw) break;
          try {
            const entry = JSON.parse(raw);
            messages.push({
              messageId: entry.id,
              fromBotId: entry.fromBotId,
              contentType: entry.contentType,
              content: entry.content,
              timestamp: entry.createdAt,
              priority: entry.priority || 'normal',
            });
          } catch {
            // Skip malformed entries
          }
        }

        return { success: true, data: { messages } };
      }

      // Fallback: no Redis, return empty
      return { success: true, data: { messages: [] } };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'MESSAGE_RECEIVE_FAILED',
          message: error instanceof Error ? error.message : 'Receive failed',
        },
      };
    }
  }
}
