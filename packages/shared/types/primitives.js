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
export const PrimitiveLayerNames = {
    L0: 'Foundation Layer',
    L1: 'Standard Layer',
    L2: 'Advanced Layer',
    L3: 'Enterprise Layer',
};
export const PRIMITIVE_REGISTRY = {
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
export function getPrimitivesByLayer(layer) {
    return Object.values(PRIMITIVE_REGISTRY).filter((p) => p.layer === layer);
}
export function getPrimitive(name) {
    return PRIMITIVE_REGISTRY[name];
}
