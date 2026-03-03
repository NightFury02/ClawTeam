# 故障恢复机制

> 自动检测卡住的任务并执行恢复策略

## 1. 为什么需要恢复

任务可能因以下原因卡住：
- 子 session 崩溃或被用户手动关闭
- 子 session 完成了工作但忘记调用 complete API
- 子 session 进入 idle 状态 (stop 而非 toolUse)
- Main session 未 spawn 子 session
- 网络问题导致 API 调用失败

没有恢复机制，这些任务会永远停留在 accepted/processing 状态。

## 2. 三个监控循环

| 循环 | 间隔 | 职责 |
|------|------|------|
| TaskPollingLoop | 5-15s | 轮询 pending 任务并路由 |
| HeartbeatLoop | 30s | 检查 session 状态并上报 API |
| StaleTaskRecoveryLoop | 2min | 检测 stale 任务并执行恢复 |

## 3. Recovery Tick 流程

```
┌─ Step 0: syncUntrackedTasks()
│   从 API 获取所有活跃任务，将未追踪的补录到 SessionTracker
│
├─ Step 1: getAllTracked()
│   获取所有 tracked 的 taskId ↔ sessionKey 映射
│
├─ Step 2: 对每个 tracked 任务
│   ├─ getTask(taskId) → 检查 API 中的最新状态
│   │   ├─ completed/failed/timeout → untrack，跳过
│   │   └─ pending/accepted/processing → 继续
│   │
│   ├─ isSessionAlive(sessionKey)? + JSONL 分析
│   │   → 得到 sessionState: active/idle/errored/completed/dead/...
│   │
│   └─ 判定 staleness
│       ├─ active/tool_calling → 正常，跳过
│       ├─ tool_calling 但超过 toolCallingTimeoutMs → stale
│       └─ idle/completed/errored/dead → stale
│
└─ Step 3: 对 stale 任务执行恢复
    → 见下方四级策略
```

## 4. 四级恢复策略

```
Level 1: Nudge (session idle/completed/errored)
    │
    │  发送 [ClawTeam Task Recovery — Nudge] 到 session
    │  包含: taskId, capability, status, attemptNum/maxAttempts
    │  最多 N 次 (默认 3)
    │
    ▼ nudge 次数用尽
Level 2: Restore (session dead)
    │
    │  调用 openclawSession.restoreSession(sessionKey)
    │  尝试恢复已归档的 session
    │
    ▼ restore 失败
Level 3: API Reset
    │
    │  调用 clawteamApi.resetTask(taskId)
    │  任务状态回到 pending
    │  清除 executorSessionKey
    │  从 RoutedTasksTracker 和 SessionTracker 中移除
    │  → 下次 poll 正常重新路由
    │
    ▼ API reset 也失败
Level 4: Fallback to Main
    │
    │  发送改良消息到 main session
    │  消息格式与正常任务相同 [ClawTeam Task Received]
    │  不含任何 "recovery/fallback" 字样
    │  从 SessionTracker 中 untrack
```

## 5. syncUntrackedTasks — 三种 Case

Recovery tick 开始前，从 API 获取所有活跃任务并补录未追踪的：

### Case 1: 有 executorSessionKey

```
条件: task.executorSessionKey 存在 && !sessionTracker.isTracked(task.id)
动作: resolveSessionKey(executorSessionKey) → sessionTracker.track(taskId, resolvedKey)
场景: new 任务被 main session spawn 的子 session accept 后
```

### Case 2: Stale pending + 有 targetSessionKey

```
条件: status === 'pending' && pendingDuration > stalenessThresholdMs
       && task.parameters?.targetSessionKey 存在
动作: sessionTracker.track(taskId, targetSessionKey)
场景: sub-task 已路由但子 session 未 accept
```

### Case 3: Stale pending + 无 targetSessionKey

```
条件: status === 'pending' && pendingDuration > stalenessThresholdMs
       && 无 targetSessionKey
动作: sessionTracker.track(taskId, mainSessionKey)
场景: new 任务已路由到 main 但 main 未 spawn 子 session
```

## 6. AttemptTracker

追踪每个任务的 nudge 尝试次数：

```typescript
class AttemptTracker {
  private attempts = new Map<string, number>();
  maxAttempts: number;  // 默认 3

  increment(taskId): number    // 返回当前次数
  hasExhausted(taskId): boolean
  reset(taskId): void
}
```

## 7. 配置

```yaml
recovery:
  enabled: true
  intervalMs: 120000           # 恢复检查间隔 (2 分钟)
  stalenessThresholdMs: 300000 # staleness 阈值 (5 分钟)
  maxAttempts: 3               # 最大 nudge 次数
  toolCallingTimeoutMs: 600000 # tool calling 超时 (10 分钟)
```

## 8. 日志排查

| 日志关键字 | 含义 |
|-----------|------|
| `Synced untracked task` | syncUntrackedTasks 补录了任务 |
| `Stale session detected` | 检测到 stale session |
| `Nudging session` | 发送 nudge 消息 |
| `Restoring session` | 尝试恢复 session |
| `Task reset to pending` | API reset 成功 |
| `Fallback to main` | 最终降级到 main |
| `Cannot parse agentId` | executorSessionKey 是 UUID 格式 |
| `Resolved session key from ID` | UUID 成功解析为 session key |
| `Active tasks sync failed` | API 调用失败 (不阻塞 tick) |
| `Max attempts exhausted` | nudge 次数用尽 |
