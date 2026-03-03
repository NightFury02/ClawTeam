# 接受 / 开始 / 完成 (Accept / Start / Complete)

> 我是一个被路由到 OpenClaw session 的 Task。这是我被执行并完成的过程。

这三个操作通常由同一个子 session 按顺序调用，是我生命周期中的"正常执行路径"。

---

## Accept — 接受任务

### 触发

ClawTeam Gateway 路由成功后自动调用，或子 session 通过 Gateway curl 端点 `POST /gateway/tasks/:taskId/accept` 调用。

### 流转过程

```
ClawTeam Gateway / Sub-session
  │
  │ POST /api/v1/tasks/{myId}/accept
  │ Body: { executorSessionKey?: "agent:main:subagent:abc" }
  ▼
┌─────────────────────────────────────────────────────────┐
│ API Server — TaskCompleter.accept()                     │
│ 📁 packages/api/src/task-coordinator/completer.ts:39    │
│                                                         │
│ 1. loadTask() — 从 DB 加载我                             │
│ 2. 校验 toBotId === 请求方 botId                         │
│ 3. 校验 status === 'pending'                             │
│ 4. UPDATE tasks SET                                     │
│      status = 'accepted',                               │
│      executor_session_key = $1,                         │
│      accepted_at = NOW()                                │
│ 5. LREM — 从 Redis 优先级队列中移除我                    │
│ 6. ZADD processing_set — 加入超时检测集合                │
│ 7. HSET cache — 更新缓存状态                             │
│ 8. messageBus.publish('task_assigned', status='accepted')│
└─────────────────────────────────────────────────────────┘
```

### 状态变化

```
pending → accepted
```

---

## Start — 开始处理

### 触发

ClawTeam Gateway 路由成功后紧接 accept 自动调用（Gateway 的 accept 端点会自动执行 accept + start）。

### 流转过程

```
ClawTeam Gateway / Sub-session
  │
  │ POST /api/v1/tasks/{myId}/start
  ▼
┌─────────────────────────────────────────────────────────┐
│ API Server — TaskCompleter.start()                      │
│ 📁 packages/api/src/task-coordinator/completer.ts:81    │
│                                                         │
│ 1. loadTask() — 从 DB 加载我                             │
│ 2. 校验 toBotId === 请求方 botId                         │
│ 3. 校验 status === 'accepted'                            │
│ 4. UPDATE tasks SET                                     │
│      status = 'processing',                             │
│      started_at = NOW()                                 │
│ 5. HSET cache — 更新缓存状态                             │
└─────────────────────────────────────────────────────────┘
```

### 状态变化

```
accepted → processing
```

---

## Complete — 完成任务

### 触发

子 session 完成工作后通过 Gateway curl 端点 `POST /gateway/tasks/:taskId/complete` 调用。

### 流转过程

```
Sub-session (执行完毕)
  │
  │ POST /api/v1/tasks/{myId}/complete
  │ Body: { status: 'completed', result: {...} }
  │   或  { status: 'failed', error: { code, message } }
  ▼
┌─────────────────────────────────────────────────────────┐
│ API Server — TaskCompleter.complete()                   │
│ 📁 packages/api/src/task-coordinator/completer.ts:108   │
│                                                         │
│ 1. loadTask() — 从 DB 加载我                             │
│ 2. 校验 toBotId === 请求方 botId                         │
│ 3. 校验 status ∈ ['accepted', 'processing']              │
│ 4. 推断 finalStatus:                                    │
│    - 有 result → 'completed'                            │
│    - 有 error → 'failed'                                │
│    - body.status 显式指定                                │
│ 5. UPDATE tasks SET                                     │
│      status = $finalStatus,                             │
│      result = $result,                                  │
│      error = $error,                                    │
│      completed_at = NOW()                               │
│ 6. ZREM processing_set — 从超时检测集合移除              │
│ 7. DEL cache — 清除缓存                                 │
│ 8. 记录 Metrics:                                        │
│    - tasksCompletedTotal++                              │
│    - taskDuration (从 created_at 到 completed_at)       │
│ 9. messageBus.publish('task_completed' 或 'task_failed') │
└─────────────────────────────────────────────────────────┘
  │
  │ WebSocket 事件: task_completed / task_failed
  ▼
Delegator Bot 收到结果通知
```

### 状态变化

```
accepted / processing → completed  (有 result)
accepted / processing → failed     (有 error)
```

## 涉及模块

| 模块 | 角色 | 关键文件 |
|------|------|---------|
| API Server — Completer | 状态转换、持久化 | `completer.ts` |
| PostgreSQL | 存储状态变更 | `tasks` 表 |
| Redis | 队列管理、缓存、超时集合 | 多个 key |
| MessageBus | 广播事件给 WebSocket 客户端 | `message-bus/` |
| Metrics | 记录完成/失败计数和耗时 | `completer.ts` 内 |

## 完整的正常执行时序

```
时间 ──────────────────────────────────────────────────►

Router          API Server          Sub-session
  │                │                     │
  │ pollPending    │                     │
  │───────────────►│                     │
  │  返回 [我]     │                     │
  │◄───────────────│                     │
  │                │                     │
  │ accept(myId)   │                     │
  │───────────────►│ pending→accepted    │
  │                │                     │
  │ start(myId)    │                     │
  │───────────────►│ accepted→processing │
  │                │                     │
  │ sendToMain()   │                     │
  │─────────────────────────────────────►│ spawn
  │                │                     │
  │                │                     │ (工作中...)
  │                │                     │
  │                │   complete(myId)    │
  │                │◄────────────────────│
  │                │ processing→completed│
  │                │                     │
  │                │ WS: task_completed  │
  │                │──────────────────►  Delegator Bot
```

## 我完成后

- SessionTracker 在下一次 HeartbeatLoop 或 RecoveryLoop 检测到我已完成时会 untrack 我
- 我的数据永久保留在 PostgreSQL 中
- Redis 缓存和队列中的痕迹已被清除
