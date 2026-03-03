# 恢复 (Recovery)

> 我是一个 processing 状态的 Task，执行我的 session 出了问题。这是系统尝试恢复我的完整过程。

## 触发

StaleTaskRecoveryLoop 每 2 分钟扫描一次，发现执行我的 session 状态异常。

## 恢复决策树

```
RecoveryLoop.tick()
  │
  │ resolver.resolveForTasks() — 解析 session 状态
  ▼
session 状态是什么？
  │
  ├─ active          → 跳过 (正常工作中)
  ├─ waiting         → 跳过 (等待用户输入)
  ├─ tool_calling    → 检查是否超时
  │   ├─ < toolCallingTimeoutMs  → 跳过
  │   └─ > toolCallingTimeoutMs  → 当作 dead 处理 ↓
  │
  ├─ idle            → 检查空闲时长
  │   ├─ < stalenessThreshold    → 跳过
  │   └─ > stalenessThreshold    → nudge (见 NUDGE.md)
  │
  ├─ completed       → nudge (session 结束了但我没被 complete)
  ├─ errored         → nudge (session 出错了)
  │
  └─ dead            → 恢复流程 ↓↓↓
```

## Dead Session 恢复流程 — 四级策略

```
┌─────────────────────────────────────────────────────────┐
│ 检测到 session dead                                      │
│ 📁 stale-task-recovery-loop.ts:435                      │
│                                                         │
│ 1. clawteamApi.getTask(myId) — 确认我还在活跃状态        │
│    如果已 completed/failed/cancelled → untrack, 结束     │
└────────────────────┬────────────────────────────────────┘
                     │ 我还在 accepted/processing
                     ▼
┌─────────────────────────────────────────────────────────┐
│ Level 1: Restore — 尝试恢复 session                     │
│                                                         │
│ openclession.restoreSession(sessionKey)              │
│                                                         │
│ ├─ 成功 → sendToSession(nudgeMessage) → 结束            │
│ │         session 被唤醒，继续工作                        │
│ │                                                       │
│ └─ 失败 → 进入 Level 2                                  │
└────────────────────┬────────────────────────────────────┘
                     │ restore 失败
                     ▼
┌─────────────────────────────────────────────────────────┐
│ Level 2: API Reset — 重置任务回 pending                  │
│                                                         │
│ clawteamApi.resetTask(myId)                             │
│ POST /api/v1/tasks/{myId}/reset                         │
│                                                         │
│ ├─ 成功 →                                               │
│ │   API: status → pending, retry_count++, LPUSH queue   │
│ │   Router: routedTasks.remove(myId) — 允许重新路由      │
│ │   Router: sessionTracker.untrack(myId)                │
│ │   → 下次 Poller 轮询时重新路由我 → 结束               │
│ │                                                       │
│ └─ 失败 (retries exhausted 或网络错误) → 进入 Level 3   │
└────────────────────┬────────────────────────────────────┘
                     │ reset 也失败
                     ▼
┌─────────────────────────────────────────────────────────┐
│ Level 3: Fallback — 发送到 Main Session                  │
│ 📁 stale-task-recovery-loop.ts:562                      │
│                                                         │
│ 构建消息 (伪装成正常任务格式):                            │
│   [ClawTeam Task Received]        ← 不是 Recovery 标记  │
│   Task ID: {myId}                                       │
│   Capability: {capability}                              │
│   From Bot: {fromBotId}                                 │
│   Priority: {priority}                                  │
│   Parameters: {JSON}                                    │
│   === SUB-SESSION INSTRUCTIONS ===                      │
│   ...                                                   │
│                                                         │
│ openclession.sendToMainSession(message)              │
│ sessionTracker.untrack(myId)                            │
│                                                         │
│ → Main session 收到后当作新任务处理，spawn 新子 session   │
└─────────────────────────────────────────────────────────┘
```

## 为什么 Fallback 消息伪装成正常格式？

之前的实现使用 `[Recovery — Fallback]` 标记，导致 Main session (LLM) 误以为是平台 bug，拒绝处理。改为 `[ClawTeam Task Received]` 格式后，Main session 无法区分这是恢复消息还是正常任务，会正常 spawn 子 session 处理。

## syncUntrackedTasks — 追踪盲区修复

每次 tick 开始前，Recovery Loop 会同步 API 中的活跃任务到本地追踪：

```
┌─────────────────────────────────────────────────────────┐
│ syncUntrackedTasks()                                    │
│                                                         │
│ clawteamApi.pollActiveTasks()                           │
│ GET /api/v1/tasks?status=accepted,processing,pending    │
│                                                         │
│ 对于每个 API 返回的活跃任务:                              │
│                                                         │
│ Case 1: 有 executorSessionKey 且未被追踪                 │
│   → sessionTracker.track(taskId, executorSessionKey)    │
│   → 如果 key 是 raw UUID → resolveSessionKeyFromId()   │
│                                                         │
│ Case 2: pending + 有 targetSessionKey (sub-task)          │
│   且超过 stalenessThreshold                              │
│   → sessionTracker.track(taskId, targetSessionKey)      │
│                                                         │
│ Case 3: pending + 无 executorSessionKey                  │
│   且超过 stalenessThreshold                              │
│   → sessionTracker.track(taskId, mainSessionKey)        │
│   (可能是 main session 没有 spawn 子 session)            │
└─────────────────────────────────────────────────────────┘
```

## 涉及模块

| 模块 | 角色 | 关键文件 |
|------|------|---------|
| ClawTeam Gateway — RecoveryLoop | 检测异常、执行恢复策略 | `stale-task-recovery-loop.ts` |
| ClawTeam Gateway — SessionStatusResolver | 解析 session 状态 (JSONL 分析) | `session-status-resolver.ts` |
| ClawTeam Gateway — SessionTracker | task ↔ session 映射 | `session-tracker.ts` |
| ClawTeam Gateway — RoutedTasksTracker | 路由去重标记 | `routed-tasks.ts` |
| OpenClaw CLI | restore session、发送消息 | `openclaw-session.ts` |
| API Server | getTask、resetTask | `completer.ts` |

## 状态变化

```
Level 1 (restore 成功):  无变化 — session 被唤醒继续工作
Level 2 (reset 成功):    accepted/processing → pending (retry_count++)
Level 3 (fallback):      无变化 — 消息发到 main session，由新子 session 接手
```

## 配置参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `intervalMs` | 扫描间隔 | 120,000 (2 分钟) |
| `stalenessThresholdMs` | idle 多久算 stale | 300,000 (5 分钟) |
| `toolCallingTimeoutMs` | tool_calling 多久算卡死 | 600,000 (10 分钟) |
| `maxRecoveryAttempts` | 最大催促次数 | 3 |
