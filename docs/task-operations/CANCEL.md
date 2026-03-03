# 取消 (Cancel)

> 我是一个正在执行中的 Task。这是我被取消的过程。

取消有两条路径：Delegator Bot 通过 API 取消，或 Dashboard 操作员通过 Router 取消。两者的影响范围不同。

---

## 路径 A：API 取消 (Delegator Bot)

### 触发

创建我的 Delegator Bot 调用 `POST /api/v1/tasks/{myId}/cancel`。

### 流转过程

```
Delegator Bot
  │
  │ POST /api/v1/tasks/{myId}/cancel
  │ Body: { reason: "不再需要" }
  ▼
┌─────────────────────────────────────────────────────────┐
│ API Server — TaskCompleter.cancel()                     │
│ 📁 packages/api/src/task-coordinator/completer.ts:226   │
│                                                         │
│ 1. loadTask() — 从 DB 加载我                             │
│ 2. 校验 fromBotId === 请求方 botId (只有创建者能取消)    │
│ 3. 校验 status ∈ ['pending', 'accepted']                 │
│ 4. UPDATE tasks SET                                     │
│      status = 'cancelled',                              │
│      error = { code: 'CANCELLED', message: reason },    │
│      completed_at = NOW()                               │
│ 5. LREM — 从 Redis 优先级队列移除                        │
│ 6. ZREM processing_set — 从超时检测集合移除              │
│ 7. DEL cache — 清除缓存                                 │
│ 8. Metrics: tasksCancelledTotal++                       │
│ 9. messageBus.publish('task_failed', status='cancelled') │
└─────────────────────────────────────────────────────────┘
```

### 限制

- 只有 `fromBotId`（创建者）可以取消
- 只能取消 `pending` 或 `accepted` 状态的任务
- **不会通知正在执行的 OpenClaw session** — session 可能继续工作但 complete 时会失败

---

## 路径 B：Router 取消 (Dashboard 操作员)

### 触发

Dashboard 操作员点击取消按钮，调用 Router 的 `POST /tasks/{myId}/cancel`。

### 流转过程

```
Dashboard 操作员
  │
  │ POST /router-api/tasks/{myId}/cancel  (Vite proxy → :3100)
  │ Body: { reason: "Dashboard 操作员取消" }
  ▼
┌─────────────────────────────────────────────────────────┐
│ ClawTeam Gateway — RouterApiServer                      │
│ 📁 packages/clawteam-gateway/src/server/router-api.ts   │
│                                                         │
│ Step 1: 通知 Session 停止工作                            │
│ ┌─────────────────────────────────────────────────┐     │
│ │ sessionTracker.getSessionForTask(myId)           │     │
│ │ → sessionKey: "agent:main:subagent:abc"          │     │
│ │                                                  │     │
│ │ openclession.sendToSession(sessionKey, msg)   │     │
│ │ 消息内容:                                        │     │
│ │   [ClawTeam Task — CANCELLED]                    │     │
│ │   Task ID: {myId}                                │     │
│ │   Reason: {reason}                               │     │
│ │   请立即停止所有工作。                             │     │
│ │   不要调用 complete 端点。                         │     │
│ └─────────────────────────────────────────────────┘     │
│                                                         │
│ Step 2: 通过 API 更新数据库                              │
│ ┌─────────────────────────────────────────────────┐     │
│ │ POST /api/v1/tasks/all/{myId}/cancel             │     │
│ │ (公开端点，无需 Bot 认证)                         │     │
│ │                                                  │     │
│ │ UPDATE tasks SET status='cancelled'              │     │
│ │ LREM 所有优先级队列                               │     │
│ │ ZREM processing_set                              │     │
│ │ DEL cache                                        │     │
│ └─────────────────────────────────────────────────┘     │
│                                                         │
│ Step 3: 清理本地追踪                                     │
│ ┌─────────────────────────────────────────────────┐     │
│ │ sessionTracker.untrack(myId)                     │     │
│ └─────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────┘
```

### 与路径 A 的区别

| 维度 | API 取消 (路径 A) | Router 取消 (路径 B) |
|------|------------------|---------------------|
| 调用方 | Delegator Bot | Dashboard 操作员 |
| 权限校验 | fromBotId 必须匹配 | 无认证 (本地 API) |
| 可取消状态 | pending, accepted | pending, accepted, processing |
| 通知 session | ❌ 不通知 | ✅ 发送停止消息 |
| 清理 SessionTracker | ❌ 不清理 | ✅ untrack |
| API 端点 | `/api/v1/tasks/:id/cancel` | `/api/v1/tasks/all/:id/cancel` |

## 涉及模块

| 模块 | 角色 | 关键文件 |
|------|------|---------|
| API Server — Completer | 状态转换、DB + Redis 清理 | `completer.ts:226` |
| API Server — Routes | 公开取消端点 (Dashboard 用) | `routes/index.ts:367` |
| ClawTeam Gateway — RouterApi | 编排三步取消流程 | `router-api.ts:125` |
| OpenClaw CLI | 发送停止消息到 session | `openclaw-session.ts` |
| SessionTracker | 清理 task ↔ session 映射 | `session-tracker.ts` |

## 状态变化

```
pending / accepted / processing → cancelled
```

## 取消后

- 我在 PostgreSQL 中永久保留，status='cancelled'
- Redis 中的队列、缓存、超时集合已清理
- 如果通过 Router 取消，执行我的 session 会收到停止指令
- WebSocket 客户端收到 `task_failed` 事件 (status='cancelled')
