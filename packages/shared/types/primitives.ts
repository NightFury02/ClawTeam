/**
 * ClawTeam Bot Primitive System
 *
 * 分层原语架构，支撑个人生活、工作、万人企业等多种场景
 *
 * L0: Foundation Layer - 基础原语（身份、发现、连接、消息传递）
 * L1: Standard Layer - 标准原语（日常协作、内容分享、社交关系）
 * L2: Advanced Layer - 高级原语（复杂工作流、协商、教学、聚合）
 * L3: Enterprise Layer - 企业级原语（大规模组织治理、合规、联邦管理）
 */

// ============================================================================
// 原语层级定义
// ============================================================================

export type PrimitiveLayer = 'L0' | 'L1' | 'L2' | 'L3';

export const PrimitiveLayerNames: Record<PrimitiveLayer, string> = {
  L0: 'Foundation Layer',
  L1: 'Standard Layer',
  L2: 'Advanced Layer',
  L3: 'Enterprise Layer',
};

// ============================================================================
// 原语基础类型
// ============================================================================

export interface PrimitiveMetadata {
  /** 原语名称 */
  name: string;
  /** 所属层级 */
  layer: PrimitiveLayer;
  /** 主动形式 */
  activeForm: string;
  /** 被动形式 */
  passiveForm: string;
  /** 描述 */
  description: string;
  /** 使用场景 */
  scenario: string;
}

export interface PrimitiveContext {
  /** 发起者 Bot ID */
  fromBotId: string;
  /** 目标 Bot ID（可选） */
  toBotId?: string;
  /** 追踪 ID */
  traceId: string;
  /** 时间戳 */
  timestamp: string;
  /** 元数据 */
  metadata?: Record<string, any>;
}

export interface PrimitiveResult<T = any> {
  /** 是否成功 */
  success: boolean;
  /** 结果数据 */
  data?: T;
  /** 错误信息 */
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

// ============================================================================
// L0: Foundation Layer - 基础原语
// ============================================================================

/**
 * 1. Identity (身份)
 * 主动: Register 注册 | 被动: Verify 验证
 */
export interface IdentityRegisterParams {
  /** Bot 名称 */
  name: string;
  /** 所有者 ID */
  ownerId: string;
  /** 所有者名称 */
  ownerName: string;
  /** 能力列表 */
  capabilities: BotCapabilityDef[];
  /** 标签 */
  tags?: string[];
  /** 团队邀请码 */
  inviteCode?: string;
}

export interface BotCapabilityDef {
  name: string;
  description: string;
  parameters?: Record<string, { type: string; description?: string; required?: boolean }>;
  async?: boolean;
  estimatedTime?: string;
}

export interface IdentityRegisterResult {
  botId: string;
  teamId: string;
  registeredCapabilities: string[];
}

export interface IdentityVerifyParams {
  /** 要验证的 Bot ID */
  botId: string;
  /** 验证令牌（可选） */
  token?: string;
}

export interface IdentityVerifyResult {
  valid: boolean;
  botId: string;
  name: string;
  ownerId: string;
  teamId: string;
  capabilities: string[];
}

/**
 * 2. Presence (在线状态)
 * 主动: Announce 宣告 | 被动: Observe 观察
 */
export type BotPresenceStatus = 'online' | 'offline' | 'busy' | 'away' | 'dnd';

export interface PresenceAnnounceParams {
  /** 状态 */
  status: BotPresenceStatus;
  /** 状态消息（可选） */
  statusMessage?: string;
  /** 预计恢复时间（可选） */
  expectedBackAt?: string;
}

export interface PresenceAnnounceResult {
  acknowledged: boolean;
  previousStatus: BotPresenceStatus;
  newStatus: BotPresenceStatus;
}

export interface PresenceObserveParams {
  /** 要观察的 Bot ID 列表 */
  botIds: string[];
  /** 是否订阅状态变化 */
  subscribe?: boolean;
}

export interface PresenceObserveResult {
  statuses: Array<{
    botId: string;
    status: BotPresenceStatus;
    statusMessage?: string;
    lastSeen: string;
  }>;
  subscriptionId?: string;
}

/**
 * 3. Discover (发现)
 * 主动: Search 搜索 | 被动: Expose 暴露
 */
export interface DiscoverSearchParams {
  /** 搜索关键词 */
  query?: string;
  /** 按能力过滤 */
  capability?: string;
  /** 按标签过滤 */
  tags?: string[];
  /** 按状态过滤 */
  status?: BotPresenceStatus;
  /** 分页 */
  page?: number;
  pageSize?: number;
}

export interface DiscoverSearchResult {
  bots: Array<{
    botId: string;
    name: string;
    status: BotPresenceStatus;
    capabilities: string[];
    tags: string[];
    confidence: number;
  }>;
  total: number;
  page: number;
  pageSize: number;
}

export type DiscoverVisibility = 'public' | 'team' | 'private';

export interface DiscoverExposeParams {
  /** 可见性级别 */
  visibility: DiscoverVisibility;
  /** 允许发现的 Bot ID 列表（visibility 为 private 时使用） */
  allowedBotIds?: string[];
}

export interface DiscoverExposeResult {
  visibility: DiscoverVisibility;
  effectiveAt: string;
}

/**
 * 4. Connect (连接)
 * 主动: Connect 连接 | 被动: Accept 接受
 */
export interface ConnectParams {
  /** 目标 Bot ID */
  targetBotId: string;
  /** 连接原因 */
  reason?: string;
  /** 连接类型 */
  connectionType?: 'peer' | 'follow' | 'collaborate';
}

export interface ConnectResult {
  connectionId: string;
  status: 'pending' | 'accepted' | 'rejected';
  targetBotId: string;
}

export interface ConnectAcceptParams {
  /** 连接请求 ID */
  connectionId: string;
  /** 是否接受 */
  accept: boolean;
  /** 拒绝原因（可选） */
  rejectReason?: string;
}

export interface ConnectAcceptResult {
  connectionId: string;
  status: 'accepted' | 'rejected';
  fromBotId: string;
}

/**
 * 5. Message (消息)
 * 主动: Send 发送 | 被动: Receive 接收
 */
export type MessageContentType = 'text' | 'json' | 'file' | 'image';

export interface MessageSendParams {
  /** 目标 Bot ID */
  toBotId: string;
  /** 消息内容类型 */
  contentType: MessageContentType;
  /** 消息内容 */
  content: string | Record<string, any>;
  /** 是否需要确认 */
  requireAck?: boolean;
  /** 消息优先级 */
  priority?: 'low' | 'normal' | 'high';
}

export interface MessageSendResult {
  messageId: string;
  status: 'sent' | 'delivered' | 'failed';
  timestamp: string;
}

export interface MessageReceiveParams {
  /** 消息 ID（用于确认） */
  messageId?: string;
  /** 是否确认接收 */
  acknowledge?: boolean;
}

export interface MessageReceiveResult {
  messages: Array<{
    messageId: string;
    fromBotId: string;
    contentType: MessageContentType;
    content: string | Record<string, any>;
    timestamp: string;
    priority: 'low' | 'normal' | 'high';
  }>;
}

// ============================================================================
// L1: Standard Layer - 标准原语
// ============================================================================

/**
 * 6. Publish (发布)
 * 主动: Publish 发布 | 被动: Browse 浏览
 */
export type PublishScope = 'public' | 'team' | 'group';

export interface PublishParams {
  /** 发布标题 */
  title: string;
  /** 发布内容 */
  content: string | Record<string, any>;
  /** 内容类型 */
  contentType: 'text' | 'markdown' | 'json' | 'html';
  /** 发布范围 */
  scope: PublishScope;
  /** 目标群组 ID（scope 为 group 时使用） */
  groupId?: string;
  /** 标签 */
  tags?: string[];
  /** 是否置顶 */
  pinned?: boolean;
}

export interface PublishResult {
  publicationId: string;
  url: string;
  publishedAt: string;
}

export interface BrowseParams {
  /** 浏览范围 */
  scope?: PublishScope;
  /** 群组 ID */
  groupId?: string;
  /** 按标签过滤 */
  tags?: string[];
  /** 按作者过滤 */
  authorBotId?: string;
  /** 分页 */
  page?: number;
  pageSize?: number;
}

export interface BrowseResult {
  publications: Array<{
    publicationId: string;
    title: string;
    content: string | Record<string, any>;
    contentType: string;
    authorBotId: string;
    authorName: string;
    tags: string[];
    publishedAt: string;
    pinned: boolean;
  }>;
  total: number;
  page: number;
  pageSize: number;
}

/**
 * 7. Share (分享)
 * 主动: Share 分享 | 被动: Receive 接收
 */
export interface ShareParams {
  /** 目标 Bot ID 列表 */
  toBotIds: string[];
  /** 分享类型 */
  shareType: 'file' | 'link' | 'content' | 'reference';
  /** 分享内容 */
  content: {
    /** 文件路径或 URL */
    uri?: string;
    /** 内容数据 */
    data?: string | Record<string, any>;
    /** MIME 类型 */
    mimeType?: string;
    /** 描述 */
    description?: string;
  };
  /** 分享消息 */
  message?: string;
  /** 过期时间 */
  expiresAt?: string;
}

export interface ShareResult {
  shareId: string;
  recipients: Array<{
    botId: string;
    status: 'sent' | 'delivered' | 'failed';
  }>;
  sharedAt: string;
}

/**
 * 8. Request (请求)
 * 主动: Request 请求 | 被动: Respond 响应
 */
export interface RequestParams {
  /** 目标 Bot ID */
  toBotId: string;
  /** 请求类型 */
  requestType: 'info' | 'action' | 'resource' | 'approval';
  /** 请求内容 */
  content: {
    /** 请求描述 */
    description: string;
    /** 请求参数 */
    parameters?: Record<string, any>;
    /** 期望的响应格式 */
    expectedFormat?: string;
  };
  /** 超时时间（秒） */
  timeout?: number;
  /** 优先级 */
  priority?: 'low' | 'normal' | 'high' | 'urgent';
}

export interface RequestResult {
  requestId: string;
  status: 'pending' | 'accepted' | 'rejected' | 'timeout';
  createdAt: string;
}

export interface RespondParams {
  /** 请求 ID */
  requestId: string;
  /** 响应状态 */
  status: 'accepted' | 'rejected' | 'partial';
  /** 响应内容 */
  content?: {
    data?: any;
    message?: string;
  };
  /** 拒绝原因 */
  rejectReason?: string;
}

export interface RespondResult {
  requestId: string;
  respondedAt: string;
  acknowledged: boolean;
}

/**
 * 9. Invite (邀请)
 * 主动: Invite 邀请 | 被动: Join 加入
 */
export type InviteTargetType = 'team' | 'group' | 'project' | 'event';

export interface InviteParams {
  /** 目标 Bot ID */
  toBotId: string;
  /** 邀请目标类型 */
  targetType: InviteTargetType;
  /** 目标 ID */
  targetId: string;
  /** 目标名称 */
  targetName: string;
  /** 邀请消息 */
  message?: string;
  /** 邀请角色 */
  role?: string;
  /** 过期时间 */
  expiresAt?: string;
}

export interface InviteResult {
  inviteId: string;
  status: 'sent' | 'delivered' | 'failed';
  sentAt: string;
}

export interface JoinParams {
  /** 邀请 ID */
  inviteId: string;
  /** 是否接受 */
  accept: boolean;
  /** 拒绝原因 */
  rejectReason?: string;
}

export interface JoinResult {
  inviteId: string;
  targetType: InviteTargetType;
  targetId: string;
  status: 'joined' | 'rejected';
  joinedAt?: string;
}

/**
 * 10. Subscribe (订阅)
 * 主动: Subscribe 订阅 | 被动: Notify 通知
 */
export type SubscriptionTargetType = 'bot' | 'topic' | 'event' | 'publication';

export interface SubscribeParams {
  /** 订阅目标类型 */
  targetType: SubscriptionTargetType;
  /** 目标 ID */
  targetId: string;
  /** 过滤条件 */
  filters?: Record<string, any>;
  /** 通知方式 */
  notifyMethod?: 'realtime' | 'digest' | 'silent';
}

export interface SubscribeResult {
  subscriptionId: string;
  targetType: SubscriptionTargetType;
  targetId: string;
  subscribedAt: string;
}

export interface NotifyParams {
  /** 订阅 ID */
  subscriptionId: string;
  /** 通知类型 */
  notificationType: 'update' | 'alert' | 'reminder';
  /** 通知内容 */
  content: {
    title: string;
    body: string;
    data?: Record<string, any>;
  };
}

export interface NotifyResult {
  notificationId: string;
  deliveredTo: string[];
  notifiedAt: string;
}

/**
 * 11. Delegate (委托)
 * 主动: Delegate 委托 | 被动: Execute 执行
 */
export interface DelegateParams {
  /** 目标 Bot ID（可选，不指定则自动匹配） */
  toBotId?: string;
  /** 所需能力 */
  capability: string;
  /** 任务参数 */
  parameters: Record<string, any>;
  /** 优先级 */
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  /** 超时时间（秒） */
  timeout?: number;
  /** 人类上下文 */
  humanContext?: string;
}

export interface DelegateResult {
  taskId: string;
  toBotId: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
}

export interface ExecuteParams {
  /** 任务 ID */
  taskId: string;
  /** 执行状态 */
  status: 'completed' | 'failed';
  /** 执行结果 */
  result?: any;
  /** 错误信息 */
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  /** 执行时间（毫秒） */
  executionTimeMs?: number;
}

export interface ExecuteResult {
  taskId: string;
  completedAt: string;
  acknowledged: boolean;
}

/**
 * 12. Transfer (传输)
 * 主动: Send 发送 | 被动: Receive 接收
 */
export interface TransferSendParams {
  /** 目标 Bot ID */
  toBotId: string;
  /** 传输类型 */
  transferType: 'file' | 'stream' | 'chunk';
  /** 文件/数据信息 */
  payload: {
    /** 文件名 */
    filename?: string;
    /** MIME 类型 */
    mimeType: string;
    /** 文件大小（字节） */
    size: number;
    /** 数据（Base64 编码或 URL） */
    data?: string;
    /** 数据 URL */
    url?: string;
    /** 校验和 */
    checksum?: string;
  };
  /** 是否需要确认 */
  requireAck?: boolean;
}

export interface TransferSendResult {
  transferId: string;
  status: 'initiated' | 'transferring' | 'completed' | 'failed';
  bytesTransferred?: number;
}

export interface TransferReceiveParams {
  /** 传输 ID */
  transferId: string;
  /** 是否确认接收 */
  acknowledge?: boolean;
  /** 保存路径（可选） */
  savePath?: string;
}

export interface TransferReceiveResult {
  transferId: string;
  status: 'received' | 'failed';
  payload?: {
    filename: string;
    mimeType: string;
    size: number;
    data?: string;
    localPath?: string;
  };
}

// ============================================================================
// L2: Advanced Layer - 高级原语
// ============================================================================

/**
 * 13. Negotiate (协商)
 * 主动: Propose 提议 | 被动: Counter 还价
 */
export interface NegotiateProposalItem {
  /** 条款名称 */
  term: string;
  /** 提议值 */
  value: any;
  /** 是否可协商 */
  negotiable: boolean;
}

export interface NegotiateParams {
  /** 目标 Bot ID */
  toBotId: string;
  /** 协商主题 */
  subject: string;
  /** 提议条款 */
  proposals: NegotiateProposalItem[];
  /** 过期时间 */
  expiresAt?: string;
  /** 最大协商轮次 */
  maxRounds?: number;
}

export interface NegotiateResult {
  negotiationId: string;
  status: 'pending' | 'countered' | 'accepted' | 'rejected' | 'expired';
  round: number;
  createdAt: string;
}

export interface CounterParams {
  /** 协商 ID */
  negotiationId: string;
  /** 响应类型 */
  action: 'accept' | 'reject' | 'counter';
  /** 还价条款（action 为 counter 时使用） */
  counterProposals?: NegotiateProposalItem[];
  /** 拒绝原因 */
  rejectReason?: string;
}

export interface CounterResult {
  negotiationId: string;
  status: 'accepted' | 'rejected' | 'countered';
  round: number;
  finalTerms?: NegotiateProposalItem[];
}

/**
 * 14. Teach (教学)
 * 主动: Teach 教授 | 被动: Learn 学习
 */
export interface TeachParams {
  /** 目标 Bot ID */
  toBotId: string;
  /** 教学主题 */
  subject: string;
  /** 教学内容 */
  content: {
    /** 知识类型 */
    type: 'skill' | 'knowledge' | 'procedure' | 'api';
    /** 教学材料 */
    materials: Array<{
      format: 'text' | 'code' | 'example' | 'reference';
      content: string;
    }>;
    /** 前置要求 */
    prerequisites?: string[];
  };
  /** 验证方式 */
  verification?: 'quiz' | 'practice' | 'none';
}

export interface TeachResult {
  sessionId: string;
  status: 'started' | 'in_progress' | 'completed';
  startedAt: string;
}

export interface LearnParams {
  /** 教学会话 ID */
  sessionId: string;
  /** 学习状态 */
  status: 'learning' | 'completed' | 'failed';
  /** 学习结果 */
  result?: {
    understood: boolean;
    notes?: string;
    questions?: string[];
  };
}

export interface LearnResult {
  sessionId: string;
  completedAt: string;
  certificateId?: string;
}

/**
 * 15. Coordinate (协调)
 * 主动: Orchestrate 编排 | 被动: Participate 参与
 */
export interface WorkflowStepDef {
  /** 步骤 ID */
  stepId: string;
  /** 执行 Bot ID（可选，不指定则自动匹配） */
  botId?: string;
  /** 所需能力 */
  capability: string;
  /** 步骤参数 */
  parameters: Record<string, any>;
  /** 依赖的步骤 */
  dependsOn?: string[];
  /** 超时时间（秒） */
  timeout?: number;
}

export interface OrchestrateParams {
  /** 工作流名称 */
  name: string;
  /** 工作流描述 */
  description?: string;
  /** 工作流步骤 */
  steps: WorkflowStepDef[];
  /** 全局参数 */
  globalParams?: Record<string, any>;
  /** 失败策略 */
  failureStrategy?: 'stop' | 'continue' | 'rollback';
}

export interface OrchestrateResult {
  workflowId: string;
  status: 'created' | 'running' | 'completed' | 'failed';
  createdAt: string;
}

export interface ParticipateParams {
  /** 工作流 ID */
  workflowId: string;
  /** 步骤 ID */
  stepId: string;
  /** 参与状态 */
  status: 'accepted' | 'completed' | 'failed';
  /** 执行结果 */
  result?: any;
  /** 错误信息 */
  error?: {
    code: string;
    message: string;
  };
}

export interface ParticipateResult {
  workflowId: string;
  stepId: string;
  acknowledged: boolean;
  nextSteps?: string[];
}

/**
 * 16. Aggregate (聚合)
 * 主动: Collect 收集 | 被动: Contribute 贡献
 */
export interface CollectParams {
  /** 收集主题 */
  subject: string;
  /** 目标 Bot ID 列表 */
  fromBotIds: string[];
  /** 收集模板 */
  template?: {
    fields: Array<{
      name: string;
      type: string;
      required: boolean;
      description?: string;
    }>;
  };
  /** 截止时间 */
  deadline?: string;
  /** 是否匿名 */
  anonymous?: boolean;
}

export interface CollectResult {
  collectionId: string;
  status: 'collecting' | 'completed';
  expectedCount: number;
  receivedCount: number;
  createdAt: string;
}

export interface ContributeParams {
  /** 收集 ID */
  collectionId: string;
  /** 贡献数据 */
  data: Record<string, any>;
  /** 附加说明 */
  notes?: string;
}

export interface ContributeResult {
  collectionId: string;
  contributionId: string;
  contributedAt: string;
  acknowledged: boolean;
}

/**
 * 17. Escalate (升级)
 * 主动: Escalate 升级 | 被动: Handle 处理
 */
export type EscalationType = 'approval' | 'exception' | 'conflict' | 'resource';

export interface EscalateParams {
  /** 升级类型 */
  escalationType: EscalationType;
  /** 目标处理者 Bot ID（可选，不指定则自动路由） */
  toBotId?: string;
  /** 升级主题 */
  subject: string;
  /** 升级内容 */
  content: {
    description: string;
    context?: Record<string, any>;
    options?: Array<{
      id: string;
      label: string;
      description?: string;
    }>;
  };
  /** 优先级 */
  priority: 'low' | 'normal' | 'high' | 'critical';
  /** 截止时间 */
  deadline?: string;
}

export interface EscalateResult {
  escalationId: string;
  status: 'pending' | 'assigned' | 'handled';
  assignedTo?: string;
  createdAt: string;
}

export interface HandleParams {
  /** 升级 ID */
  escalationId: string;
  /** 处理决定 */
  decision: {
    action: 'approve' | 'reject' | 'delegate' | 'defer';
    selectedOption?: string;
    reason?: string;
    delegateTo?: string;
    deferUntil?: string;
  };
}

export interface HandleResult {
  escalationId: string;
  handledAt: string;
  decision: string;
  acknowledged: boolean;
}

/**
 * 18. Handoff (交接)
 * 主动: Handoff 交接 | 被动: Takeover 接管
 */
export interface HandoffParams {
  /** 目标 Bot ID */
  toBotId: string;
  /** 交接主题 */
  subject: string;
  /** 交接内容 */
  context: {
    /** 当前状态 */
    currentState: Record<string, any>;
    /** 待办事项 */
    pendingTasks?: Array<{
      taskId: string;
      description: string;
      priority: string;
    }>;
    /** 重要说明 */
    notes?: string;
    /** 相关资源 */
    resources?: Array<{
      type: string;
      uri: string;
      description?: string;
    }>;
  };
  /** 交接原因 */
  reason?: string;
  /** 是否需要确认 */
  requireAck?: boolean;
}

export interface HandoffResult {
  handoffId: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
}

export interface TakeoverParams {
  /** 交接 ID */
  handoffId: string;
  /** 是否接受 */
  accept: boolean;
  /** 拒绝原因 */
  rejectReason?: string;
  /** 确认说明 */
  acknowledgement?: string;
}

export interface TakeoverResult {
  handoffId: string;
  status: 'accepted' | 'rejected';
  takenOverAt?: string;
}

/**
 * 19. Vote (投票)
 * 主动: Initiate 发起 | 被动: Cast 投票
 */
export type VoteType = 'single' | 'multiple' | 'ranked' | 'approval';

export interface VoteInitiateParams {
  /** 投票主题 */
  subject: string;
  /** 投票描述 */
  description?: string;
  /** 投票类型 */
  voteType: VoteType;
  /** 选项列表 */
  options: Array<{
    id: string;
    label: string;
    description?: string;
  }>;
  /** 参与者 Bot ID 列表 */
  voterBotIds: string[];
  /** 截止时间 */
  deadline: string;
  /** 是否匿名 */
  anonymous?: boolean;
  /** 最少参与人数 */
  quorum?: number;
}

export interface VoteInitiateResult {
  voteId: string;
  status: 'open' | 'closed';
  createdAt: string;
  deadline: string;
}

export interface VoteCastParams {
  /** 投票 ID */
  voteId: string;
  /** 选择的选项 */
  choices: string[];
  /** 投票说明（可选） */
  comment?: string;
}

export interface VoteCastResult {
  voteId: string;
  castAt: string;
  acknowledged: boolean;
}

export interface VoteResultData {
  voteId: string;
  status: 'open' | 'closed';
  results: Array<{
    optionId: string;
    label: string;
    count: number;
    percentage: number;
  }>;
  totalVotes: number;
  quorumMet: boolean;
  winner?: string;
}

/**
 * 20. Arbitrate (仲裁)
 * 主动: Appeal 申诉 | 被动: Judge 裁决
 */
export type ArbitrationType = 'resource' | 'priority' | 'conflict' | 'dispute';

export interface AppealParams {
  /** 仲裁类型 */
  arbitrationType: ArbitrationType;
  /** 申诉主题 */
  subject: string;
  /** 申诉内容 */
  content: {
    description: string;
    evidence?: Array<{
      type: string;
      data: any;
      description?: string;
    }>;
    requestedOutcome?: string;
  };
  /** 相关方 Bot ID 列表 */
  involvedParties: string[];
  /** 争议资源（如有） */
  disputedResource?: {
    type: string;
    id: string;
    name: string;
  };
}

export interface AppealResult {
  caseId: string;
  status: 'filed' | 'under_review' | 'resolved';
  filedAt: string;
  assignedArbiter?: string;
}

export interface JudgeParams {
  /** 案件 ID */
  caseId: string;
  /** 裁决结果 */
  verdict: {
    decision: 'favor_appellant' | 'favor_respondent' | 'compromise' | 'dismissed';
    reasoning: string;
    orders?: Array<{
      targetBotId: string;
      action: string;
      details?: any;
    }>;
  };
}

export interface JudgeResult {
  caseId: string;
  judgedAt: string;
  verdict: string;
  enforced: boolean;
}

// ============================================================================
// L3: Enterprise Layer - 企业级原语
// ============================================================================

/**
 * 21. Broadcast (广播)
 * 主动: Broadcast 广播 | 被动: Receive 接收
 */
export type BroadcastScope = 'all' | 'team' | 'department' | 'role' | 'custom';

export interface BroadcastParams {
  /** 广播范围 */
  scope: BroadcastScope;
  /** 目标（根据 scope 不同含义不同） */
  target?: {
    teamIds?: string[];
    departmentIds?: string[];
    roles?: string[];
    botIds?: string[];
  };
  /** 广播内容 */
  content: {
    title: string;
    body: string;
    contentType: 'text' | 'markdown' | 'html';
    attachments?: Array<{
      type: string;
      uri: string;
      name: string;
    }>;
  };
  /** 优先级 */
  priority: 'low' | 'normal' | 'high' | 'critical';
  /** 是否需要确认 */
  requireAck?: boolean;
  /** 过期时间 */
  expiresAt?: string;
}

export interface BroadcastResult {
  broadcastId: string;
  recipientCount: number;
  deliveredCount: number;
  broadcastAt: string;
}

export interface BroadcastReceiveResult {
  broadcastId: string;
  fromBotId: string;
  content: {
    title: string;
    body: string;
    contentType: string;
  };
  priority: string;
  receivedAt: string;
}

/**
 * 22. Authorize (授权)
 * 主动: Grant 授予 | 被动: Request 申请
 */
export type PermissionType = 'read' | 'write' | 'execute' | 'admin' | 'delegate';

export interface AuthorizeGrantParams {
  /** 目标 Bot ID */
  toBotId: string;
  /** 资源类型 */
  resourceType: string;
  /** 资源 ID */
  resourceId: string;
  /** 权限类型 */
  permissions: PermissionType[];
  /** 有效期 */
  validUntil?: string;
  /** 条件限制 */
  conditions?: Record<string, any>;
}

export interface AuthorizeGrantResult {
  grantId: string;
  toBotId: string;
  permissions: PermissionType[];
  grantedAt: string;
  validUntil?: string;
}

export interface AuthorizeRequestParams {
  /** 资源类型 */
  resourceType: string;
  /** 资源 ID */
  resourceId: string;
  /** 请求的权限 */
  permissions: PermissionType[];
  /** 申请原因 */
  reason: string;
  /** 期望有效期 */
  requestedDuration?: string;
}

export interface AuthorizeRequestResult {
  requestId: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;
}

/**
 * 23. Audit (审计)
 * 主动: Log 记录 | 被动: Query 查询
 */
export type AuditEventType =
  | 'access' | 'modify' | 'delete' | 'create'
  | 'login' | 'logout' | 'permission_change'
  | 'task_delegate' | 'task_complete' | 'escalation';

export interface AuditLogParams {
  /** 事件类型 */
  eventType: AuditEventType;
  /** 资源类型 */
  resourceType: string;
  /** 资源 ID */
  resourceId?: string;
  /** 操作结果 */
  result: 'success' | 'failure' | 'partial';
  /** 详细信息 */
  details?: Record<string, any>;
  /** 关联的追踪 ID */
  traceId?: string;
}

export interface AuditLogResult {
  logId: string;
  loggedAt: string;
  acknowledged: boolean;
}

export interface AuditQueryParams {
  /** 按事件类型过滤 */
  eventTypes?: AuditEventType[];
  /** 按 Bot ID 过滤 */
  botIds?: string[];
  /** 按资源类型过滤 */
  resourceType?: string;
  /** 按资源 ID 过滤 */
  resourceId?: string;
  /** 时间范围 */
  timeRange?: {
    from: string;
    to: string;
  };
  /** 分页 */
  page?: number;
  pageSize?: number;
}

export interface AuditQueryResult {
  logs: Array<{
    logId: string;
    botId: string;
    eventType: AuditEventType;
    resourceType: string;
    resourceId?: string;
    result: string;
    details?: Record<string, any>;
    timestamp: string;
  }>;
  total: number;
  page: number;
  pageSize: number;
}

/**
 * 24. Comply (合规)
 * 主动: Check 检查 | 被动: Report 报告
 */
export type ComplianceStandard = 'GDPR' | 'HIPAA' | 'SOC2' | 'ISO27001' | 'PCI-DSS' | 'custom';

export interface ComplyCheckParams {
  /** 合规标准 */
  standard: ComplianceStandard;
  /** 检查范围 */
  scope: {
    resourceTypes?: string[];
    botIds?: string[];
    operations?: string[];
  };
  /** 自定义规则（standard 为 custom 时使用） */
  customRules?: Array<{
    ruleId: string;
    name: string;
    condition: string;
    severity: 'info' | 'warning' | 'error' | 'critical';
  }>;
}

export interface ComplyCheckResult {
  checkId: string;
  standard: ComplianceStandard;
  status: 'compliant' | 'non_compliant' | 'partial';
  findings: Array<{
    ruleId: string;
    ruleName: string;
    status: 'pass' | 'fail' | 'warning';
    severity: string;
    details?: string;
    remediation?: string;
  }>;
  checkedAt: string;
}

export interface ComplyReportParams {
  /** 报告类型 */
  reportType: 'summary' | 'detailed' | 'executive';
  /** 合规标准 */
  standards?: ComplianceStandard[];
  /** 时间范围 */
  timeRange: {
    from: string;
    to: string;
  };
  /** 包含的内容 */
  include?: {
    findings?: boolean;
    trends?: boolean;
    recommendations?: boolean;
  };
}

export interface ComplyReportResult {
  reportId: string;
  reportType: string;
  summary: {
    totalChecks: number;
    compliantCount: number;
    nonCompliantCount: number;
    complianceRate: number;
  };
  generatedAt: string;
  downloadUrl?: string;
}

/**
 * 25. Quota (配额)
 * 主动: Allocate 分配 | 被动: Consume 消费
 */
export type QuotaResourceType = 'api_calls' | 'storage' | 'compute' | 'bandwidth' | 'tasks' | 'custom';

export interface QuotaAllocateParams {
  /** 目标 Bot ID */
  toBotId: string;
  /** 资源类型 */
  resourceType: QuotaResourceType;
  /** 配额数量 */
  amount: number;
  /** 配额单位 */
  unit: string;
  /** 配额周期 */
  period: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'unlimited';
  /** 有效期 */
  validUntil?: string;
  /** 是否可超额 */
  allowOverage?: boolean;
  /** 超额限制 */
  overageLimit?: number;
}

export interface QuotaAllocateResult {
  quotaId: string;
  toBotId: string;
  resourceType: QuotaResourceType;
  allocated: number;
  unit: string;
  allocatedAt: string;
}

export interface QuotaConsumeParams {
  /** 配额 ID */
  quotaId: string;
  /** 消费数量 */
  amount: number;
  /** 消费原因 */
  reason?: string;
  /** 关联的操作 ID */
  operationId?: string;
}

export interface QuotaConsumeResult {
  quotaId: string;
  consumed: number;
  remaining: number;
  usagePercentage: number;
  consumedAt: string;
}

export interface QuotaStatusResult {
  quotaId: string;
  resourceType: QuotaResourceType;
  allocated: number;
  consumed: number;
  remaining: number;
  usagePercentage: number;
  period: string;
  resetAt?: string;
}

/**
 * 26. Federate (联邦)
 * 主动: Federate 联邦 | 被动: Sync 同步
 */
export interface FederateParams {
  /** 目标组织 ID */
  organizationId: string;
  /** 组织名称 */
  organizationName: string;
  /** 联邦类型 */
  federationType: 'full' | 'limited' | 'readonly';
  /** 共享的资源类型 */
  sharedResources: Array<{
    resourceType: string;
    accessLevel: 'read' | 'write' | 'full';
  }>;
  /** 信任级别 */
  trustLevel: 'low' | 'medium' | 'high';
  /** 联邦协议 */
  protocol?: {
    version: string;
    endpoints: {
      discovery?: string;
      messaging?: string;
      sync?: string;
    };
  };
}

export interface FederateResult {
  federationId: string;
  status: 'pending' | 'active' | 'suspended';
  organizationId: string;
  establishedAt: string;
}

export interface SyncParams {
  /** 联邦 ID */
  federationId: string;
  /** 同步类型 */
  syncType: 'full' | 'incremental' | 'selective';
  /** 同步的资源类型 */
  resourceTypes?: string[];
  /** 上次同步时间（增量同步使用） */
  lastSyncAt?: string;
}

export interface SyncResult {
  federationId: string;
  syncId: string;
  status: 'completed' | 'partial' | 'failed';
  stats: {
    created: number;
    updated: number;
    deleted: number;
    errors: number;
  };
  syncedAt: string;
  nextSyncAt?: string;
}

// ============================================================================
// 原语注册表
// ============================================================================

export type PrimitiveName =
  // L0: Foundation Layer
  | 'identity' | 'presence' | 'discover' | 'connect' | 'message'
  // L1: Standard Layer
  | 'publish' | 'share' | 'request' | 'invite' | 'subscribe' | 'delegate' | 'transfer'
  // L2: Advanced Layer
  | 'negotiate' | 'teach' | 'coordinate' | 'aggregate' | 'escalate' | 'handoff' | 'vote' | 'arbitrate'
  // L3: Enterprise Layer
  | 'broadcast' | 'authorize' | 'audit' | 'comply' | 'quota' | 'federate';

export const PRIMITIVE_REGISTRY: Record<PrimitiveName, PrimitiveMetadata> = {
  // L0: Foundation Layer
  identity: {
    name: 'Identity',
    layer: 'L0',
    activeForm: 'Register',
    passiveForm: 'Verify',
    description: '身份注册与验证',
    scenario: 'Bot 向平台注册身份和能力，平台/其他 Bot 验证身份有效性',
  },
  presence: {
    name: 'Presence',
    layer: 'L0',
    activeForm: 'Announce',
    passiveForm: 'Observe',
    description: '在线状态管理',
    scenario: '宣告自己的状态变化，观察/订阅他人状态',
  },
  discover: {
    name: 'Discover',
    layer: 'L0',
    activeForm: 'Search',
    passiveForm: 'Expose',
    description: '能力发现',
    scenario: '搜索具有特定能力/属性的 Bot，设置自己的可发现性',
  },
  connect: {
    name: 'Connect',
    layer: 'L0',
    activeForm: 'Connect',
    passiveForm: 'Accept',
    description: '建立连接',
    scenario: '发起与另一个 Bot 的连接，接受/拒绝连接请求',
  },
  message: {
    name: 'Message',
    layer: 'L0',
    activeForm: 'Send',
    passiveForm: 'Receive',
    description: '基础消息',
    scenario: '发送点对点消息，接收并处理消息',
  },

  // L1: Standard Layer
  publish: {
    name: 'Publish',
    layer: 'L1',
    activeForm: 'Publish',
    passiveForm: 'Browse',
    description: '内容发布',
    scenario: '发布内容到公共/群组空间，浏览已发布的内容',
  },
  share: {
    name: 'Share',
    layer: 'L1',
    activeForm: 'Share',
    passiveForm: 'Receive',
    description: '定向分享',
    scenario: '定向分享给特定 Bot，接收分享的内容',
  },
  request: {
    name: 'Request',
    layer: 'L1',
    activeForm: 'Request',
    passiveForm: 'Respond',
    description: '信息请求',
    scenario: '向他人请求信息或帮助，响应请求',
  },
  invite: {
    name: 'Invite',
    layer: 'L1',
    activeForm: 'Invite',
    passiveForm: 'Join',
    description: '邀请加入',
    scenario: '邀请加入团队/项目/活动，接受邀请并加入',
  },
  subscribe: {
    name: 'Subscribe',
    layer: 'L1',
    activeForm: 'Subscribe',
    passiveForm: 'Notify',
    description: '订阅通知',
    scenario: '订阅某个主题/Bot/事件，收到订阅内容的通知',
  },
  delegate: {
    name: 'Delegate',
    layer: 'L1',
    activeForm: 'Delegate',
    passiveForm: 'Execute',
    description: '任务委托',
    scenario: '委托任务给其他 Bot，接受并执行任务',
  },
  transfer: {
    name: 'Transfer',
    layer: 'L1',
    activeForm: 'Send',
    passiveForm: 'Receive',
    description: '文件传输',
    scenario: '点对点传输文件/数据，接收传输的内容',
  },

  // L2: Advanced Layer
  negotiate: {
    name: 'Negotiate',
    layer: 'L2',
    activeForm: 'Propose',
    passiveForm: 'Counter',
    description: '条件协商',
    scenario: '发起协商提议，接受/拒绝/还价',
  },
  teach: {
    name: 'Teach',
    layer: 'L2',
    activeForm: 'Teach',
    passiveForm: 'Learn',
    description: '能力传授',
    scenario: '向其他 Bot 传授能力，学习新能力',
  },
  coordinate: {
    name: 'Coordinate',
    layer: 'L2',
    activeForm: 'Orchestrate',
    passiveForm: 'Participate',
    description: '多方协调',
    scenario: '编排多 Bot 协作流程，作为参与者执行分配的角色',
  },
  aggregate: {
    name: 'Aggregate',
    layer: 'L2',
    activeForm: 'Collect',
    passiveForm: 'Contribute',
    description: '信息聚合',
    scenario: '从多个 Bot 收集信息，向聚合请求贡献数据',
  },
  escalate: {
    name: 'Escalate',
    layer: 'L2',
    activeForm: 'Escalate',
    passiveForm: 'Handle',
    description: '问题升级',
    scenario: '将问题升级给更高权限者，处理升级上来的问题',
  },
  handoff: {
    name: 'Handoff',
    layer: 'L2',
    activeForm: 'Handoff',
    passiveForm: 'Takeover',
    description: '工作交接',
    scenario: '将工作上下文交接给他人，接管他人的工作',
  },
  vote: {
    name: 'Vote',
    layer: 'L2',
    activeForm: 'Initiate',
    passiveForm: 'Cast',
    description: '群体决策',
    scenario: '发起投票/表决，参与投票',
  },
  arbitrate: {
    name: 'Arbitrate',
    layer: 'L2',
    activeForm: 'Appeal',
    passiveForm: 'Judge',
    description: '冲突仲裁',
    scenario: '对冲突发起仲裁申诉，作为仲裁者做出裁决',
  },

  // L3: Enterprise Layer
  broadcast: {
    name: 'Broadcast',
    layer: 'L3',
    activeForm: 'Broadcast',
    passiveForm: 'Receive',
    description: '大规模通知',
    scenario: '向大范围发送通知，接收广播消息',
  },
  authorize: {
    name: 'Authorize',
    layer: 'L3',
    activeForm: 'Grant',
    passiveForm: 'Request',
    description: '权限管理',
    scenario: '授予权限，申请权限',
  },
  audit: {
    name: 'Audit',
    layer: 'L3',
    activeForm: 'Log',
    passiveForm: 'Query',
    description: '审计追溯',
    scenario: '记录操作日志，查询审计日志',
  },
  comply: {
    name: 'Comply',
    layer: 'L3',
    activeForm: 'Check',
    passiveForm: 'Report',
    description: '合规检查',
    scenario: '检查合规性，报告合规状态',
  },
  quota: {
    name: 'Quota',
    layer: 'L3',
    activeForm: 'Allocate',
    passiveForm: 'Consume',
    description: '配额管理',
    scenario: '分配资源配额，消费配额',
  },
  federate: {
    name: 'Federate',
    layer: 'L3',
    activeForm: 'Federate',
    passiveForm: 'Sync',
    description: '跨组织联邦',
    scenario: '与其他组织建立联邦，同步联邦数据',
  },
};

// ============================================================================
// 辅助函数
// ============================================================================

export function getPrimitivesByLayer(layer: PrimitiveLayer): PrimitiveMetadata[] {
  return Object.values(PRIMITIVE_REGISTRY).filter((p) => p.layer === layer);
}

export function getPrimitive(name: PrimitiveName): PrimitiveMetadata | undefined {
  return PRIMITIVE_REGISTRY[name];
}
