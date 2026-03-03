# 重置 (Reset)

> 我是一个 accepted 或 processing 状态的 Task。执行我的 session 出了问题，我需要被重置回 pending 重新来过。

## 触发

Recovery Loop 检测到执行我的 session 已死亡且无法恢复时，调用 `POST /api/v1/tasks/{myId}/reset`。

> 这个端点不是给人类直接调用的，而是 ClawTeam Gateway 的 StaleTaskRecoveryLoop 在自动恢复流程中使用的。见 [RECOVERY.md](./RECOVERY.md)。

## 流转过程

```
StaleTaskRecoveryLoop
  │ session 死亡 → restore 失败
  │
  │ clawteamApi.resetTask(myId)
  │ POST /api/v1/tasks/{myId}/reset
  ▼
┌─────────────────────────────────────────────────────────┐
│ API Server — TaskCompleter.reset()                      │
│ 📁 packages/api/src/task-coordinator/completer.ts:163   │
│                                                         │
│ 1. loadTask() — 从 DB 加载我                             │
│ 2. 校验 toBotId === 请求方 botId                         │
│ 3. 校验 status ∈ ['accepted', 'processing']              │
│ 4. 校验 retryCount < maxRetries (未耗尽重试次数)         │
│ 5. UPDATE tasks SET                                     │
│      status = 'pending',                                │
│      executor_session_key = NULL,                       │
│      retry_count = retry_count + 1,                     │
│      accepted_at = NULL,                                │
│      started_at = NULL                                  │
│ 6. LPUSH queue — 重新入队 (插入队列头部，优先被轮询)     │
│    key: clawteam:tasks:{toBotId}:{priority}             │
│ 7. ZREM processing_set — 从超时检测集合移除              │
│ 8. DEL cache — 清除旧缓存                               │
└─────────────────────────────────────────────────────────┘
  │
  │ 返回成功
  ▼
┌─────────────────────────────────────────────────────────┐
│ ClawTeam Gateway — 清理本地追踪                          │
│ 📁 stale-task-recovery-loop.ts:468-484                  │
│                                                         │
│ 1. routedTasks.remove(myId) — 允许 Poller 重新路由我     │
│ 2. sessionTracker.untrack(myId) — 解除旧 session 映射   │
└─────────────────────────────────────────────────────────┘
  │
  │ 下一次 TaskPollingLoop 轮询
  ▼
我被重新发现 → 重新路由到新的 session → 见 ROUTING.md
```

## 涉及模块

| 模块 | 角色 | 关键文件 |
|------|------|---------|
| ClawTeam Gateway — RecoveryLoop | 触发 reset 请求 | `stale-task-recovery-loop.ts:468` |
| API Server — Completer | 状态回退、重新入队 | `completer.ts:163` |
| PostgreSQL | 更新状态和重试计数 | `tasks` 表 |
| Redis | 重新入队 (LPUSH)、清理旧数据 | 队列 + 缓存 |
| RoutedTasksTracker | 移除路由标记，允许重新路由 | `routed-tasks.ts` |
| SessionTracker | 解除旧 session 映射 | `session-tracker.ts` |

## 状态变化

```
accepted / processing → pending  (retry_count++)
```

## 重试限制

| 字段 | 说明 | 默认值 |
|------|------|--------|
| `retryCount` | 当前已重试次数 | 0 |
| `maxRetries` | 最大重试次数 | 3 |

当 `retryCount >= maxRetries` 时，reset 会返回 `RETRY_EXHAUSTED` 错误，Recovery Loop 会降级到 fallback 方案（发送消息到 main session）。

## 与 Timeout 重试的区别

| 维度 | Reset (Recovery) | Timeout 重试 |
|------|-----------------|-------------|
| 触发方 | ClawTeam Gateway RecoveryLoop | API Server TimeoutDetector |
| 原因 | session 死亡/无法恢复 | 任务超过 timeoutSeconds |
| 入队位置 | LPUSH (队列头部，优先) | RPUSH (队列尾部) |
| 清理 executor_session_key | ✅ 是 | ✅ 是 |
| 清理 SessionTracker | ✅ 是 (Gateway 侧) | ❌ 否 (API 侧无感知) |

## 我被重置后的去向

我回到 pending 状态，`executor_session_key` 被清空。下一次 TaskPollingLoop 轮询时会重新发现我，走正常的路由流程。因为我被 LPUSH 到队列头部，所以会被优先处理。
