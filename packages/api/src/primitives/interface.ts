/**
 * Primitive Service Interface
 *
 * 定义原语服务的公共契约，支持 L0-L3 四层原语操作
 */

import type {
  PrimitiveContext,
  PrimitiveResult,
  // L0: Foundation Layer
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
  // L1: Standard Layer
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

/**
 * L0: Foundation Layer - 基础原语接口
 */
export interface IL0Primitives {
  // Identity (身份)
  identityRegister(
    ctx: PrimitiveContext,
    params: IdentityRegisterParams
  ): Promise<PrimitiveResult<IdentityRegisterResult>>;

  identityVerify(
    ctx: PrimitiveContext,
    params: IdentityVerifyParams
  ): Promise<PrimitiveResult<IdentityVerifyResult>>;

  // Presence (在线状态)
  presenceAnnounce(
    ctx: PrimitiveContext,
    params: PresenceAnnounceParams
  ): Promise<PrimitiveResult<PresenceAnnounceResult>>;

  presenceObserve(
    ctx: PrimitiveContext,
    params: PresenceObserveParams
  ): Promise<PrimitiveResult<PresenceObserveResult>>;

  // Discover (发现)
  discoverSearch(
    ctx: PrimitiveContext,
    params: DiscoverSearchParams
  ): Promise<PrimitiveResult<DiscoverSearchResult>>;

  discoverExpose(
    ctx: PrimitiveContext,
    params: DiscoverExposeParams
  ): Promise<PrimitiveResult<DiscoverExposeResult>>;

  // Connect (连接)
  connect(
    ctx: PrimitiveContext,
    params: ConnectParams
  ): Promise<PrimitiveResult<ConnectResult>>;

  connectAccept(
    ctx: PrimitiveContext,
    params: ConnectAcceptParams
  ): Promise<PrimitiveResult<ConnectAcceptResult>>;

  // Message (消息)
  messageSend(
    ctx: PrimitiveContext,
    params: MessageSendParams
  ): Promise<PrimitiveResult<MessageSendResult>>;

  messageReceive(
    ctx: PrimitiveContext,
    params: MessageReceiveParams
  ): Promise<PrimitiveResult<MessageReceiveResult>>;
}

/**
 * L1: Standard Layer - 标准原语接口
 */
export interface IL1Primitives {
  // Publish (发布)
  publish(
    ctx: PrimitiveContext,
    params: PublishParams
  ): Promise<PrimitiveResult<PublishResult>>;

  browse(
    ctx: PrimitiveContext,
    params: BrowseParams
  ): Promise<PrimitiveResult<BrowseResult>>;

  // Share (分享)
  share(
    ctx: PrimitiveContext,
    params: ShareParams
  ): Promise<PrimitiveResult<ShareResult>>;

  // Request (请求)
  request(
    ctx: PrimitiveContext,
    params: RequestParams
  ): Promise<PrimitiveResult<RequestResult>>;

  respond(
    ctx: PrimitiveContext,
    params: RespondParams
  ): Promise<PrimitiveResult<RespondResult>>;

  // Invite (邀请)
  invite(
    ctx: PrimitiveContext,
    params: InviteParams
  ): Promise<PrimitiveResult<InviteResult>>;

  join(
    ctx: PrimitiveContext,
    params: JoinParams
  ): Promise<PrimitiveResult<JoinResult>>;

  // Subscribe (订阅)
  subscribe(
    ctx: PrimitiveContext,
    params: SubscribeParams
  ): Promise<PrimitiveResult<SubscribeResult>>;

  notify(
    ctx: PrimitiveContext,
    params: NotifyParams
  ): Promise<PrimitiveResult<NotifyResult>>;

  // Delegate (委托)
  delegate(
    ctx: PrimitiveContext,
    params: DelegateParams
  ): Promise<PrimitiveResult<DelegateResult>>;

  execute(
    ctx: PrimitiveContext,
    params: ExecuteParams
  ): Promise<PrimitiveResult<ExecuteResult>>;

  // Transfer (传输)
  transferSend(
    ctx: PrimitiveContext,
    params: TransferSendParams
  ): Promise<PrimitiveResult<TransferSendResult>>;

  transferReceive(
    ctx: PrimitiveContext,
    params: TransferReceiveParams
  ): Promise<PrimitiveResult<TransferReceiveResult>>;
}

// Import L2 types
import type {
  NegotiateParams,
  NegotiateResult,
  CounterParams,
  CounterResult,
  TeachParams,
  TeachResult,
  LearnParams,
  LearnResult,
  OrchestrateParams,
  OrchestrateResult,
  ParticipateParams,
  ParticipateResult,
  CollectParams,
  CollectResult,
  ContributeParams,
  ContributeResult,
  EscalateParams,
  EscalateResult,
  HandleParams,
  HandleResult,
  HandoffParams,
  HandoffResult,
  TakeoverParams,
  TakeoverResult,
  VoteInitiateParams,
  VoteInitiateResult,
  VoteCastParams,
  VoteCastResult,
  AppealParams,
  AppealResult,
  JudgeParams,
  JudgeResult,
} from '@clawteam/shared/types';

/**
 * L2: Advanced Layer - 高级原语接口
 */
export interface IL2Primitives {
  // Negotiate (协商)
  negotiatePropose(
    ctx: PrimitiveContext,
    params: NegotiateParams
  ): Promise<PrimitiveResult<NegotiateResult>>;

  negotiateCounter(
    ctx: PrimitiveContext,
    params: CounterParams
  ): Promise<PrimitiveResult<CounterResult>>;

  // Teach (教学)
  teach(
    ctx: PrimitiveContext,
    params: TeachParams
  ): Promise<PrimitiveResult<TeachResult>>;

  learn(
    ctx: PrimitiveContext,
    params: LearnParams
  ): Promise<PrimitiveResult<LearnResult>>;

  // Coordinate (协调)
  orchestrate(
    ctx: PrimitiveContext,
    params: OrchestrateParams
  ): Promise<PrimitiveResult<OrchestrateResult>>;

  participate(
    ctx: PrimitiveContext,
    params: ParticipateParams
  ): Promise<PrimitiveResult<ParticipateResult>>;

  // Aggregate (聚合)
  collect(
    ctx: PrimitiveContext,
    params: CollectParams
  ): Promise<PrimitiveResult<CollectResult>>;

  contribute(
    ctx: PrimitiveContext,
    params: ContributeParams
  ): Promise<PrimitiveResult<ContributeResult>>;

  // Escalate (升级)
  escalate(
    ctx: PrimitiveContext,
    params: EscalateParams
  ): Promise<PrimitiveResult<EscalateResult>>;

  handle(
    ctx: PrimitiveContext,
    params: HandleParams
  ): Promise<PrimitiveResult<HandleResult>>;

  // Handoff (交接)
  handoff(
    ctx: PrimitiveContext,
    params: HandoffParams
  ): Promise<PrimitiveResult<HandoffResult>>;

  takeover(
    ctx: PrimitiveContext,
    params: TakeoverParams
  ): Promise<PrimitiveResult<TakeoverResult>>;

  // Vote (投票)
  voteInitiate(
    ctx: PrimitiveContext,
    params: VoteInitiateParams
  ): Promise<PrimitiveResult<VoteInitiateResult>>;

  voteCast(
    ctx: PrimitiveContext,
    params: VoteCastParams
  ): Promise<PrimitiveResult<VoteCastResult>>;

  // Arbitrate (仲裁)
  appeal(
    ctx: PrimitiveContext,
    params: AppealParams
  ): Promise<PrimitiveResult<AppealResult>>;

  judge(
    ctx: PrimitiveContext,
    params: JudgeParams
  ): Promise<PrimitiveResult<JudgeResult>>;
}

// Import L3 types
import type {
  BroadcastParams,
  BroadcastResult,
  AuthorizeGrantParams,
  AuthorizeGrantResult,
  AuthorizeRequestParams,
  AuthorizeRequestResult,
  AuditLogParams,
  AuditLogResult,
  AuditQueryParams,
  AuditQueryResult,
  ComplyCheckParams,
  ComplyCheckResult,
  ComplyReportParams,
  ComplyReportResult,
  QuotaAllocateParams,
  QuotaAllocateResult,
  QuotaConsumeParams,
  QuotaConsumeResult,
  FederateParams,
  FederateResult,
  SyncParams,
  SyncResult,
} from '@clawteam/shared/types';

/**
 * L3: Enterprise Layer - 企业级原语接口
 */
export interface IL3Primitives {
  // Broadcast (广播)
  broadcast(
    ctx: PrimitiveContext,
    params: BroadcastParams
  ): Promise<PrimitiveResult<BroadcastResult>>;

  // Authorize (授权)
  authorizeGrant(
    ctx: PrimitiveContext,
    params: AuthorizeGrantParams
  ): Promise<PrimitiveResult<AuthorizeGrantResult>>;

  authorizeRequest(
    ctx: PrimitiveContext,
    params: AuthorizeRequestParams
  ): Promise<PrimitiveResult<AuthorizeRequestResult>>;

  // Audit (审计)
  auditLog(
    ctx: PrimitiveContext,
    params: AuditLogParams
  ): Promise<PrimitiveResult<AuditLogResult>>;

  auditQuery(
    ctx: PrimitiveContext,
    params: AuditQueryParams
  ): Promise<PrimitiveResult<AuditQueryResult>>;

  // Comply (合规)
  complyCheck(
    ctx: PrimitiveContext,
    params: ComplyCheckParams
  ): Promise<PrimitiveResult<ComplyCheckResult>>;

  complyReport(
    ctx: PrimitiveContext,
    params: ComplyReportParams
  ): Promise<PrimitiveResult<ComplyReportResult>>;

  // Quota (配额)
  quotaAllocate(
    ctx: PrimitiveContext,
    params: QuotaAllocateParams
  ): Promise<PrimitiveResult<QuotaAllocateResult>>;

  quotaConsume(
    ctx: PrimitiveContext,
    params: QuotaConsumeParams
  ): Promise<PrimitiveResult<QuotaConsumeResult>>;

  // Federate (联邦)
  federate(
    ctx: PrimitiveContext,
    params: FederateParams
  ): Promise<PrimitiveResult<FederateResult>>;

  federateSync(
    ctx: PrimitiveContext,
    params: SyncParams
  ): Promise<PrimitiveResult<SyncResult>>;
}

/**
 * 完整的原语服务接口
 */
export interface IPrimitiveService extends IL0Primitives, IL1Primitives, IL2Primitives, IL3Primitives {
  /**
   * 获取原语元数据
   */
  getPrimitiveMetadata(name: string): Promise<PrimitiveResult<any>>;

  /**
   * 列出所有可用原语
   */
  listPrimitives(layer?: string): Promise<PrimitiveResult<any[]>>;
}
