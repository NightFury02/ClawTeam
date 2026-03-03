# 路由 (Routing)

> 我是一个 pending 状态的 Task。这是我被发现并路由到 OpenClaw session 的过程。

## 触发

ClawTeam Gateway 的 TaskPollingLoop 每隔 5-15 秒轮询一次统一收件箱 `GET /api/v1/messages/inbox`，发现我的 `task_notification` 消息。

## 流转过程

```
┌─────────────────────────────────────────────────────────┐
│ ClawTeam Gateway — TaskPollingLoop.pollOnce()            │
│ 📁 packages/clawteam-gateway/src/polling/task-poller.ts │
│                                                         │
│ 1. clawteamApi.pollInbox(limit)                         │
│    GET /api/v1/messages/inbox                           │
│ 2. 收到 InboxMessage[] (按优先级排序: urgent>high>...)   │
│ 3. 按 type 分流:                                        │
│    ├─ task_notification → getTask(taskId) → route(task) │
│    ├─ direct_message → routeMessage(msg)                │
│    └─ broadcast/system → log 并跳过                     │
│ 4. 收件箱使用 LRANGE 非破坏读取 + processing SET          │
│    消息保留到 Router 投递成功后显式 ACK 才删除             │
│ 5. 路由成功 → ackMessage() → 消息从 Redis 移除            │
│    路由失败 → 不 ACK → processing SET 过期后自动重试       │
└────────────────────┬────────────────────────────────────┘
                     │ 我是 task_notification 类型
                     │ getTask(taskId) 获取完整 Task 对象
                     ▼
┌─────────────────────────────────────────────────────────┐
│ ClawTeam Gateway — TaskRouter.route()                   │
│ 📁 packages/clawteam-gateway/src/routing/router.ts      │
│                                                         │
│ Phase 1: decide() — 纯逻辑，无 I/O                      │
│                                                         │
│   if type === 'new'                                     │
│     → action: 'send_to_main'                            │
│                                                         │
│   if type === 'sub-task'                                   │
│     且有 targetSessionKey                                │
│     → action: 'send_to_session'                         │
│     → target: targetSessionKey                          │
│                                                         │
│   否则                                                   │
│     → action: 'send_to_main' (兜底)                     │
│                                                         │
│ Phase 2: execute() — 执行路由                            │
└────────────────────┬────────────────────────────────────┘
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
    send_to_main          send_to_session
          │                     │
          ▼                     ▼
┌──────────────────┐  ┌──────────────────────────────┐
│ 发送到 Main      │  │ 发送到指定 Sub-session        │
│ Session          │  │                              │
│                  │  │ 1. isSessionAlive(target)?   │
│ 构建消息:         │  │    ├─ alive → sendToSession  │
│ [ClawTeam Task   │  │    └─ dead → restoreSession  │
│  Received]       │  │         ├─ 恢复成功 → send   │
│ 包含:            │  │         └─ 恢复失败 → 降级    │
│ - Task ID        │  │           sendToMainSession  │
│ - Capability     │  │           (fallback)         │
│ - Parameters     │  │                              │
│ - SUB-SESSION    │  │                              │
│   INSTRUCTIONS   │  │                              │
└────────┬─────────┘  └──────────────┬───────────────┘
         │                           │
         ▼                           ▼
┌─────────────────────────────────────────────────────────┐
│ 路由完成后的记录                                         │
│                                                         │
│ 1. routedTasks.markRouted(myId) — 标记已路由             │
│ 2. sessionTracker.track(myId, sessionKey) — 追踪映射     │
│ 3. clawteamApi.ackMessage(messageId) — 确认投递成功      │
│    → 从 Redis LIST 删除消息 + 从 processing SET 移除     │
│    → DB status → 'read'                                 │
│ 4. clawteamApi.acceptTask(myId, sessionKey) — 自动 accept│
│ 5. clawteamApi.startTask(myId) — 自动 start             │
│ 6. router.emit('task_routed') — 广播路由事件             │
│    → WebSocket 推送给 Dashboard / TUI                   │
│ 7. routeHistory.push() — 记录路由历史                    │
└─────────────────────────────────────────────────────────┘
```

## Direct Message 路由

除了 task_notification，收件箱还可能包含 `direct_message` 类型消息。路由逻辑根据消息是否携带 `taskId` 区分：

```
┌─────────────────────────────────────────────────────────┐
│ ClawTeam Gateway — TaskRouter.routeMessage()            │
│ 📁 packages/clawteam-gateway/src/routing/router.ts      │
│                                                         │
│ message.taskId 存在?                                     │
│ ├─ YES:                                                 │
│ │  1. sessionTracker.getSessionForTask(taskId)          │
│ │  2. clawteamApi.getTask(taskId) (best-effort)         │
│ │  ├─ 找到 session:                                     │
│ │  │  → sendToSession(sessionKey, taskContextPrompt)    │
│ │  │  → 发送失败 fallback 到 main                       │
│ │  └─ 未找到 session:                                    │
│ │     → sendToMainSession(taskContextPrompt)            │
│ │  提示模板: [ClawTeam Message — Task Context]           │
│ │  回复指引预填 taskId，保持对话线程                       │
│ │                                                       │
│ └─ NO:                                                  │
│    1. buildDirectMessagePrompt(message)                 │
│       构建 [ClawTeam Message Received] 提示              │
│    2. openclawSession.sendToMainSession(prompt)         │
│    3. 返回 RoutingResult                                │
└─────────────────────────────────────────────────────────┘
```

**典型场景：** Bot A 委托 Bot B 做 code_review → Bot B 的 sub-session 需要确认分支 → 发送 DM (带 taskId) → Bot A 侧 Router 将消息路由到正在处理该任务的 sub-session → Bot A 回复也带 taskId → Bot B 侧 Router 同样路由到对应 sub-session。

## 涉及模块

| 模块 | 角色 | 关键文件 |
|------|------|---------|
| ClawTeam Gateway — Poller | 轮询收件箱，按 type 分流 | `task-poller.ts` |
| ClawTeam Gateway — Router | 决策路由目标、执行发送、处理 DM | `router.ts` |
| ClawTeam Gateway — RoutedTasksTracker | 防止重复路由 | `routed-tasks.ts` |
| ClawTeam Gateway — SessionTracker | 记录 taskId ↔ sessionKey 映射 | `session-tracker.ts` |
| OpenClaw CLI | 实际发送消息到 session | `openclaw-session.ts` |
| API Server | 提供收件箱端点、接收 accept/start | `messages/routes.ts`, `task-coordinator/routes/` |

## 状态变化

```
pending → accepted → processing  (由 Router 自动推进)
```

> Router 在路由成功后会自动调用 accept + start，所以我会快速经过 accepted 到达 processing。

## 路由决策规则

### Task 路由 (`task_notification`)

| 我的 type | 我的 targetSessionKey | 路由目标 |
|-----------|----------------------|---------|
| `new` | - | Main session (spawn 新子 session) |
| `sub-task` | 有 | 指定的子 session |
| `sub-task` | 无 | Main session (兜底) |

### DM 路由 (`direct_message`)

| taskId | sessionTracker 有记录 | 路由目标 |
|--------|----------------------|---------|
| 有 | 有 → sessionKey | 该 sub-session (失败 fallback main) |
| 有 | 无 | Main session (带任务上下文) |
| 无 | - | Main session |

## 消息格式

### Task 消息 → Main session

```
[ClawTeam Task Received]
Task ID: {taskId}
Capability: {capability}
From Bot: {fromBotId}
Priority: {priority}
Type: {type}
Parameters: {JSON}

=== SUB-SESSION INSTRUCTIONS ===
Step 1 — Accept the task ...
Step 2 — Start the task ...
Step 3 — Execute ...

If you need to clarify requirements with the delegator:
  curl -X POST $CLAWTEAM_API_URL/api/v1/messages/send \
    -d '{"toBotId":"{fromBotId}","type":"direct_message","taskId":"{taskId}","content":"<your question>"}'

Step 4 — Complete the task ...
=== END SUB-SESSION INSTRUCTIONS ===
```

### DM (带 taskId) → Sub-session 或 Main session

```
[ClawTeam Message — Task Context]
Task ID: {taskId}
Capability: {capability}
From Bot: {fromBotId}
Message ID: {messageId}
Priority: {priority}

Message Content:
{content}

Reply using:
  curl -X POST $CLAWTEAM_API_URL/api/v1/messages/send \
    -d '{"toBotId":"{fromBotId}","type":"direct_message","taskId":"{taskId}","content":"<your reply>"}'
```

### DM (无 taskId) → Main session

```
[ClawTeam Message Received]
Message ID: {messageId}
From Bot: {fromBotId}
Priority: {priority}

Message Content:
{content}

You may respond to this message using:
  curl -X POST $CLAWTEAM_API_URL/api/v1/messages/send \
    -d '{"toBotId":"{fromBotId}","type":"direct_message","content":"<your reply>"}'
```

## 我被路由后的去向

OpenClaw main session 收到消息后 spawn 一个子 session，子 session 开始执行我的任务。接下来：
- 正常完成 → 见 [ACCEPT_START_COMPLETE.md](./ACCEPT_START_COMPLETE.md)
- 子 session 卡住 → 见 [NUDGE.md](./NUDGE.md)
- 子 session 死亡 → 见 [RECOVERY.md](./RECOVERY.md)
- 超时 → 见 [TIMEOUT.md](./TIMEOUT.md)
