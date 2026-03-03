/**
 * Primitive Service - 原语服务
 *
 * 整合 L0-L3 四层原语，提供统一的原语操作接口
 */

import type {
  PrimitiveContext,
  PrimitiveResult,
  PrimitiveMetadata,
  PrimitiveLayer,
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
} from '@clawteam/shared/types';
import type { IPrimitiveService } from './interface';
import { L0Primitives } from './l0-primitives';
import { L1Primitives } from './l1-primitives';
import { L2Primitives } from './l2-primitives';
import { L3Primitives } from './l3-primitives';
import type { ICapabilityRegistry } from '../capability-registry/interface';
import type { IMessageBus } from '../message-bus/interface';
import type { ITaskCoordinator } from '../task-coordinator/interface';
import type { RedisClient } from '../common/redis';
import type { DatabasePool } from '../common/db';

export interface PrimitiveServiceConfig {
  registry: ICapabilityRegistry;
  messageBus: IMessageBus;
  taskCoordinator: ITaskCoordinator;
  redis?: RedisClient;
  db?: DatabasePool;
}

export class PrimitiveService implements IPrimitiveService {
  private l0: L0Primitives;
  private l1: L1Primitives;
  private l2: L2Primitives;
  private l3: L3Primitives;

  constructor(config: PrimitiveServiceConfig) {
    this.l0 = new L0Primitives({
      registry: config.registry,
      messageBus: config.messageBus,
      redis: config.redis,
      db: config.db,
    });
    this.l1 = new L1Primitives({
      registry: config.registry,
      taskCoordinator: config.taskCoordinator,
    });
    this.l2 = new L2Primitives();
    this.l3 = new L3Primitives();
  }

  // Metadata methods
  async getPrimitiveMetadata(name: string): Promise<PrimitiveResult<PrimitiveMetadata>> {
    const { getPrimitive } = await import('@clawteam/shared/types');
    const metadata = getPrimitive(name as any);
    if (!metadata) {
      return { success: false, error: { code: 'NOT_FOUND', message: `Primitive ${name} not found` } };
    }
    return { success: true, data: metadata };
  }

  async listPrimitives(layer?: string): Promise<PrimitiveResult<PrimitiveMetadata[]>> {
    const { PRIMITIVE_REGISTRY, getPrimitivesByLayer } = await import('@clawteam/shared/types');
    if (layer) {
      const primitives = getPrimitivesByLayer(layer as PrimitiveLayer);
      return { success: true, data: primitives };
    }
    return { success: true, data: Object.values(PRIMITIVE_REGISTRY) };
  }

  // L0: Foundation Layer
  identityRegister(ctx: PrimitiveContext, params: IdentityRegisterParams) {
    return this.l0.identityRegister(ctx, params);
  }
  identityVerify(ctx: PrimitiveContext, params: IdentityVerifyParams) {
    return this.l0.identityVerify(ctx, params);
  }
  presenceAnnounce(ctx: PrimitiveContext, params: PresenceAnnounceParams) {
    return this.l0.presenceAnnounce(ctx, params);
  }
  presenceObserve(ctx: PrimitiveContext, params: PresenceObserveParams) {
    return this.l0.presenceObserve(ctx, params);
  }
  discoverSearch(ctx: PrimitiveContext, params: DiscoverSearchParams) {
    return this.l0.discoverSearch(ctx, params);
  }
  discoverExpose(ctx: PrimitiveContext, params: DiscoverExposeParams) {
    return this.l0.discoverExpose(ctx, params);
  }
  connect(ctx: PrimitiveContext, params: ConnectParams) {
    return this.l0.connect(ctx, params);
  }
  connectAccept(ctx: PrimitiveContext, params: ConnectAcceptParams) {
    return this.l0.connectAccept(ctx, params);
  }
  messageSend(ctx: PrimitiveContext, params: MessageSendParams) {
    return this.l0.messageSend(ctx, params);
  }
  messageReceive(ctx: PrimitiveContext, params: MessageReceiveParams) {
    return this.l0.messageReceive(ctx, params);
  }

  // L1: Standard Layer - delegate to l1
  publish(ctx: PrimitiveContext, params: any) { return this.l1.publish(ctx, params); }
  browse(ctx: PrimitiveContext, params: any) { return this.l1.browse(ctx, params); }
  share(ctx: PrimitiveContext, params: any) { return this.l1.share(ctx, params); }
  request(ctx: PrimitiveContext, params: any) { return this.l1.request(ctx, params); }
  respond(ctx: PrimitiveContext, params: any) { return this.l1.respond(ctx, params); }
  invite(ctx: PrimitiveContext, params: any) { return this.l1.invite(ctx, params); }
  join(ctx: PrimitiveContext, params: any) { return this.l1.join(ctx, params); }
  subscribe(ctx: PrimitiveContext, params: any) { return this.l1.subscribe(ctx, params); }
  notify(ctx: PrimitiveContext, params: any) { return this.l1.notify(ctx, params); }
  delegate(ctx: PrimitiveContext, params: any) { return this.l1.delegate(ctx, params); }
  execute(ctx: PrimitiveContext, params: any) { return this.l1.execute(ctx, params); }
  transferSend(ctx: PrimitiveContext, params: any) { return this.l1.transferSend(ctx, params); }
  transferReceive(ctx: PrimitiveContext, params: any) { return this.l1.transferReceive(ctx, params); }

  // L2: Advanced Layer - delegate to l2
  negotiatePropose(ctx: PrimitiveContext, params: any) { return this.l2.negotiatePropose(ctx, params); }
  negotiateCounter(ctx: PrimitiveContext, params: any) { return this.l2.negotiateCounter(ctx, params); }
  teach(ctx: PrimitiveContext, params: any) { return this.l2.teach(ctx, params); }
  learn(ctx: PrimitiveContext, params: any) { return this.l2.learn(ctx, params); }
  orchestrate(ctx: PrimitiveContext, params: any) { return this.l2.orchestrate(ctx, params); }
  participate(ctx: PrimitiveContext, params: any) { return this.l2.participate(ctx, params); }
  collect(ctx: PrimitiveContext, params: any) { return this.l2.collect(ctx, params); }
  contribute(ctx: PrimitiveContext, params: any) { return this.l2.contribute(ctx, params); }
  escalate(ctx: PrimitiveContext, params: any) { return this.l2.escalate(ctx, params); }
  handle(ctx: PrimitiveContext, params: any) { return this.l2.handle(ctx, params); }
  handoff(ctx: PrimitiveContext, params: any) { return this.l2.handoff(ctx, params); }
  takeover(ctx: PrimitiveContext, params: any) { return this.l2.takeover(ctx, params); }
  voteInitiate(ctx: PrimitiveContext, params: any) { return this.l2.voteInitiate(ctx, params); }
  voteCast(ctx: PrimitiveContext, params: any) { return this.l2.voteCast(ctx, params); }
  appeal(ctx: PrimitiveContext, params: any) { return this.l2.appeal(ctx, params); }
  judge(ctx: PrimitiveContext, params: any) { return this.l2.judge(ctx, params); }

  // L3: Enterprise Layer - delegate to l3
  broadcast(ctx: PrimitiveContext, params: any) { return this.l3.broadcast(ctx, params); }
  authorizeGrant(ctx: PrimitiveContext, params: any) { return this.l3.authorizeGrant(ctx, params); }
  authorizeRequest(ctx: PrimitiveContext, params: any) { return this.l3.authorizeRequest(ctx, params); }
  auditLog(ctx: PrimitiveContext, params: any) { return this.l3.auditLog(ctx, params); }
  auditQuery(ctx: PrimitiveContext, params: any) { return this.l3.auditQuery(ctx, params); }
  complyCheck(ctx: PrimitiveContext, params: any) { return this.l3.complyCheck(ctx, params); }
  complyReport(ctx: PrimitiveContext, params: any) { return this.l3.complyReport(ctx, params); }
  quotaAllocate(ctx: PrimitiveContext, params: any) { return this.l3.quotaAllocate(ctx, params); }
  quotaConsume(ctx: PrimitiveContext, params: any) { return this.l3.quotaConsume(ctx, params); }
  federate(ctx: PrimitiveContext, params: any) { return this.l3.federate(ctx, params); }
  federateSync(ctx: PrimitiveContext, params: any) { return this.l3.federateSync(ctx, params); }
}

export function createPrimitiveService(config: PrimitiveServiceConfig): IPrimitiveService {
  return new PrimitiveService(config);
}
