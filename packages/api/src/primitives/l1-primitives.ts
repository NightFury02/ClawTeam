/**
 * L1 Standard Layer Primitives Implementation
 *
 * 标准原语实现：发布、分享、请求、邀请、订阅、委托、传输
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  PrimitiveContext,
  PrimitiveResult,
  PublishParams,
  PublishResult,
  BrowseParams,
  BrowseResult,
  ShareParams,
  ShareResult,
  RequestParams,
  RequestResult,
  RespondParams,
  RespondResult,
  InviteParams,
  InviteResult,
  JoinParams,
  JoinResult,
  SubscribeParams,
  SubscribeResult,
  NotifyParams,
  NotifyResult,
  DelegateParams,
  DelegateResult,
  ExecuteParams,
  ExecuteResult,
  TransferSendParams,
  TransferSendResult,
  TransferReceiveParams,
  TransferReceiveResult,
} from '@clawteam/shared/types';
import type { IL1Primitives } from './interface';
import type { ICapabilityRegistry } from '../capability-registry/interface';
import type { ITaskCoordinator } from '../task-coordinator/interface';

export interface L1PrimitivesConfig {
  registry: ICapabilityRegistry;
  taskCoordinator: ITaskCoordinator;
}

interface Publication {
  id: string;
  title: string;
  content: string | Record<string, any>;
  contentType: string;
  authorBotId: string;
  authorName: string;
  scope: string;
  groupId?: string;
  tags: string[];
  publishedAt: string;
  pinned: boolean;
}

interface Subscription {
  id: string;
  botId: string;
  targetType: string;
  targetId: string;
  filters?: Record<string, any>;
  notifyMethod: string;
  subscribedAt: string;
}

export class L1Primitives implements IL1Primitives {
  private registry: ICapabilityRegistry;
  private taskCoordinator: ITaskCoordinator;
  private publications: Map<string, Publication>;
  private subscriptions: Map<string, Subscription>;
  private requests: Map<string, any>;
  private invites: Map<string, any>;
  private transfers: Map<string, any>;

  constructor(config: L1PrimitivesConfig) {
    this.registry = config.registry;
    this.taskCoordinator = config.taskCoordinator;
    this.publications = new Map();
    this.subscriptions = new Map();
    this.requests = new Map();
    this.invites = new Map();
    this.transfers = new Map();
  }

  // ============================================================================
  // Publish (发布)
  // ============================================================================

  async publish(
    ctx: PrimitiveContext,
    params: PublishParams
  ): Promise<PrimitiveResult<PublishResult>> {
    try {
      const publicationId = uuidv4();
      const bot = await this.registry.getBot(ctx.fromBotId);

      const publication: Publication = {
        id: publicationId,
        title: params.title,
        content: params.content,
        contentType: params.contentType,
        authorBotId: ctx.fromBotId,
        authorName: bot?.name || 'Unknown',
        scope: params.scope,
        groupId: params.groupId,
        tags: params.tags || [],
        publishedAt: new Date().toISOString(),
        pinned: params.pinned || false,
      };

      this.publications.set(publicationId, publication);

      return {
        success: true,
        data: {
          publicationId,
          url: `/publications/${publicationId}`,
          publishedAt: publication.publishedAt,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'PUBLISH_FAILED',
          message: error instanceof Error ? error.message : 'Publish failed',
        },
      };
    }
  }

  async browse(
    ctx: PrimitiveContext,
    params: BrowseParams
  ): Promise<PrimitiveResult<BrowseResult>> {
    try {
      let publications = Array.from(this.publications.values());

      // Apply filters
      if (params.scope) {
        publications = publications.filter((p) => p.scope === params.scope);
      }
      if (params.groupId) {
        publications = publications.filter((p) => p.groupId === params.groupId);
      }
      if (params.authorBotId) {
        publications = publications.filter((p) => p.authorBotId === params.authorBotId);
      }
      if (params.tags && params.tags.length > 0) {
        publications = publications.filter((p) =>
          params.tags!.some((tag) => p.tags.includes(tag))
        );
      }

      // Pagination
      const page = params.page || 1;
      const pageSize = params.pageSize || 20;
      const start = (page - 1) * pageSize;
      const paged = publications.slice(start, start + pageSize);

      return {
        success: true,
        data: {
          publications: paged.map((p) => ({
            publicationId: p.id,
            title: p.title,
            content: p.content,
            contentType: p.contentType,
            authorBotId: p.authorBotId,
            authorName: p.authorName,
            tags: p.tags,
            publishedAt: p.publishedAt,
            pinned: p.pinned || false,
          })),
          total: publications.length,
          page,
          pageSize,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'BROWSE_FAILED',
          message: error instanceof Error ? error.message : 'Browse failed',
        },
      };
    }
  }

  // ============================================================================
  // Share (分享)
  // ============================================================================

  async share(
    ctx: PrimitiveContext,
    params: ShareParams
  ): Promise<PrimitiveResult<ShareResult>> {
    try {
      const shareId = uuidv4();
      const recipients = params.toBotIds.map((botId) => ({
        botId,
        status: 'sent' as const,
      }));

      return {
        success: true,
        data: {
          shareId,
          recipients,
          sharedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'SHARE_FAILED',
          message: error instanceof Error ? error.message : 'Share failed',
        },
      };
    }
  }

  // ============================================================================
  // Request (请求)
  // ============================================================================

  async request(
    ctx: PrimitiveContext,
    params: RequestParams
  ): Promise<PrimitiveResult<RequestResult>> {
    try {
      const requestId = uuidv4();
      this.requests.set(requestId, {
        id: requestId,
        fromBotId: ctx.fromBotId,
        toBotId: params.toBotId,
        requestType: params.requestType,
        content: params.content,
        priority: params.priority || 'normal',
        timeout: params.timeout,
        status: 'pending',
        createdAt: new Date().toISOString(),
      });

      return {
        success: true,
        data: {
          requestId,
          status: 'pending',
          createdAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'REQUEST_FAILED',
          message: error instanceof Error ? error.message : 'Request failed',
        },
      };
    }
  }

  async respond(
    ctx: PrimitiveContext,
    params: RespondParams
  ): Promise<PrimitiveResult<RespondResult>> {
    try {
      const request = this.requests.get(params.requestId);
      if (!request) {
        return {
          success: false,
          error: {
            code: 'REQUEST_NOT_FOUND',
            message: 'Request not found',
          },
        };
      }

      request.status = params.status;
      request.response = params.content;
      this.requests.set(params.requestId, request);

      return {
        success: true,
        data: {
          requestId: params.requestId,
          respondedAt: new Date().toISOString(),
          acknowledged: true,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'RESPOND_FAILED',
          message: error instanceof Error ? error.message : 'Respond failed',
        },
      };
    }
  }

  // ============================================================================
  // Invite (邀请)
  // ============================================================================

  async invite(
    ctx: PrimitiveContext,
    params: InviteParams
  ): Promise<PrimitiveResult<InviteResult>> {
    try {
      const inviteId = uuidv4();
      this.invites.set(inviteId, {
        id: inviteId,
        fromBotId: ctx.fromBotId,
        toBotId: params.toBotId,
        targetType: params.targetType,
        targetId: params.targetId,
        targetName: params.targetName,
        message: params.message,
        role: params.role,
        expiresAt: params.expiresAt,
        status: 'sent',
        sentAt: new Date().toISOString(),
      });

      return {
        success: true,
        data: {
          inviteId,
          status: 'sent',
          sentAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INVITE_FAILED',
          message: error instanceof Error ? error.message : 'Invite failed',
        },
      };
    }
  }

  async join(
    ctx: PrimitiveContext,
    params: JoinParams
  ): Promise<PrimitiveResult<JoinResult>> {
    try {
      const invite = this.invites.get(params.inviteId);
      if (!invite) {
        return {
          success: false,
          error: {
            code: 'INVITE_NOT_FOUND',
            message: 'Invite not found',
          },
        };
      }

      invite.status = params.accept ? 'joined' : 'rejected';
      this.invites.set(params.inviteId, invite);

      return {
        success: true,
        data: {
          inviteId: params.inviteId,
          targetType: invite.targetType,
          targetId: invite.targetId,
          status: params.accept ? 'joined' : 'rejected',
          joinedAt: params.accept ? new Date().toISOString() : undefined,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'JOIN_FAILED',
          message: error instanceof Error ? error.message : 'Join failed',
        },
      };
    }
  }

  // ============================================================================
  // Subscribe (订阅)
  // ============================================================================

  async subscribe(
    ctx: PrimitiveContext,
    params: SubscribeParams
  ): Promise<PrimitiveResult<SubscribeResult>> {
    try {
      const subscriptionId = uuidv4();
      const subscription: Subscription = {
        id: subscriptionId,
        botId: ctx.fromBotId,
        targetType: params.targetType,
        targetId: params.targetId,
        filters: params.filters,
        notifyMethod: params.notifyMethod || 'realtime',
        subscribedAt: new Date().toISOString(),
      };

      this.subscriptions.set(subscriptionId, subscription);

      return {
        success: true,
        data: {
          subscriptionId,
          targetType: params.targetType,
          targetId: params.targetId,
          subscribedAt: subscription.subscribedAt,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'SUBSCRIBE_FAILED',
          message: error instanceof Error ? error.message : 'Subscribe failed',
        },
      };
    }
  }

  async notify(
    ctx: PrimitiveContext,
    params: NotifyParams
  ): Promise<PrimitiveResult<NotifyResult>> {
    try {
      const subscription = this.subscriptions.get(params.subscriptionId);
      if (!subscription) {
        return {
          success: false,
          error: {
            code: 'SUBSCRIPTION_NOT_FOUND',
            message: 'Subscription not found',
          },
        };
      }

      return {
        success: true,
        data: {
          notificationId: uuidv4(),
          deliveredTo: [subscription.botId],
          notifiedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NOTIFY_FAILED',
          message: error instanceof Error ? error.message : 'Notify failed',
        },
      };
    }
  }

  // ============================================================================
  // Delegate (委托)
  // ============================================================================

  async delegate(
    ctx: PrimitiveContext,
    params: DelegateParams
  ): Promise<PrimitiveResult<DelegateResult>> {
    try {
      let toBotId = params.toBotId;

      // Auto-match bot if not specified
      if (!toBotId) {
        const bots = await this.registry.findByCapability(params.capability);
        if (bots.length === 0) {
          return {
            success: false,
            error: {
              code: 'NO_BOT_FOUND',
              message: `No bot found with capability: ${params.capability}`,
            },
          };
        }
        toBotId = bots[0].id;
      }

      const task = await this.taskCoordinator.createTask({
        prompt: params.humanContext || `Execute capability: ${params.capability}`,
        capability: params.capability,
        parameters: params.parameters,
        priority: params.priority || 'normal',
        timeoutSeconds: params.timeout || 60,
        humanContext: params.humanContext,
      }, ctx.fromBotId);

      await this.taskCoordinator.delegate(task.id, toBotId);

      return {
        success: true,
        data: {
          taskId: task.id,
          toBotId,
          status: 'pending',
          createdAt: task.createdAt,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'DELEGATE_FAILED',
          message: error instanceof Error ? error.message : 'Delegate failed',
        },
      };
    }
  }

  async execute(
    ctx: PrimitiveContext,
    params: ExecuteParams
  ): Promise<PrimitiveResult<ExecuteResult>> {
    try {
      await this.taskCoordinator.complete(params.taskId, {
        status: params.status,
        result: params.result,
        error: params.error,
        executionTimeMs: params.executionTimeMs,
      }, ctx.fromBotId);

      return {
        success: true,
        data: {
          taskId: params.taskId,
          completedAt: new Date().toISOString(),
          acknowledged: true,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'EXECUTE_FAILED',
          message: error instanceof Error ? error.message : 'Execute failed',
        },
      };
    }
  }

  // ============================================================================
  // Transfer (传输)
  // ============================================================================

  async transferSend(
    ctx: PrimitiveContext,
    params: TransferSendParams
  ): Promise<PrimitiveResult<TransferSendResult>> {
    try {
      const transferId = uuidv4();
      this.transfers.set(transferId, {
        id: transferId,
        fromBotId: ctx.fromBotId,
        toBotId: params.toBotId,
        transferType: params.transferType,
        payload: params.payload,
        status: 'initiated',
        createdAt: new Date().toISOString(),
      });

      return {
        success: true,
        data: {
          transferId,
          status: 'initiated',
          bytesTransferred: 0,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'TRANSFER_SEND_FAILED',
          message: error instanceof Error ? error.message : 'Transfer send failed',
        },
      };
    }
  }

  async transferReceive(
    ctx: PrimitiveContext,
    params: TransferReceiveParams
  ): Promise<PrimitiveResult<TransferReceiveResult>> {
    try {
      const transfer = this.transfers.get(params.transferId);
      if (!transfer) {
        return {
          success: false,
          error: {
            code: 'TRANSFER_NOT_FOUND',
            message: 'Transfer not found',
          },
        };
      }

      transfer.status = 'completed';
      this.transfers.set(params.transferId, transfer);

      return {
        success: true,
        data: {
          transferId: params.transferId,
          status: 'received',
          payload: transfer.payload,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'TRANSFER_RECEIVE_FAILED',
          message: error instanceof Error ? error.message : 'Transfer receive failed',
        },
      };
    }
  }
}
