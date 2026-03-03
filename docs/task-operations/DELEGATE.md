# 创建 (Delegate)

> 我是一个 Task。这是我被创建的过程。

## 触发

Delegator Bot 调用 `POST /api/v1/tasks/delegate`，携带我的描述信息。

## 流转过程

```
Delegator Bot (或 Gateway curl 端点)
  │
  │ POST /api/v1/tasks/delegate
  │ Body: { toBotId, capability, parameters, priority?, type?, timeoutSeconds? }
  ▼
┌─────────────────────────────────────────────────────────┐
│ API Server — TaskDispatcher.delegate()                  │
│ 📁 packages/api/src/task-coordinator/dispatcher.ts:47   │
│                                                         │
│ 1. validateRequest() — 校验必填字段                      │
│ 2. registry.getBot(toBotId) — 确认目标 Bot 存在          │
│ 3. getQueueSize() — 检查目标 Bot 队列是否已满            │
│ 4. INSERT INTO tasks — 我被写入 PostgreSQL               │
│    status='pending', from_bot_id, to_bot_id,            │
│    capability, parameters, priority, type,              │
│    timeout_seconds, sender_session_key                  │
│ 5. RPUSH redis queue — 我被推入 Redis 优先级队列         │
│    key: clawteam:tasks:{toBotId}:{priority}             │
│ 6. HSET redis cache — 我的详情被缓存                     │
│    key: clawteam:task:{taskId}                          │
│ 7. LPUSH inbox — 写入统一收件箱                          │
│    key: clawteam:inbox:{toBotId}:{priority}             │
│    payload: task_notification JSON (含 taskId,           │
│    capability, parameters 等)                           │
│ 8. INSERT INTO messages — 持久化到消息历史表             │
└─────────────────────────────────────────────────────────┘
  │
  │ Router 通过 GET /messages/inbox 发现我
  ▼
ClawTeam Gateway 的 TaskPollingLoop 在下次轮询收件箱时发现我
```

## 涉及模块

| 模块 | 角色 | 关键文件 |
|------|------|---------|
| API Server | 创建我、持久化、入队、写收件箱 | `dispatcher.ts`, `routes/index.ts:133` |
| PostgreSQL | 存储我的完整数据 | `tasks` 表, `messages` 表 |
| Redis | 优先级队列 + 缓存 + 统一收件箱 | `clawteam:tasks:*`, `clawteam:task:*`, `clawteam:inbox:*` |

## 状态变化

```
无 → pending
```

## 我被创建后的去向

我进入 Redis 统一收件箱等待。接下来有两条路径找到我：

1. **ClawTeam Gateway 的 TaskPollingLoop** — 定时轮询 `GET /api/v1/messages/inbox`，发现我的 `task_notification` 消息后将我路由到 OpenClaw session → 见 [ROUTING.md](./ROUTING.md)
2. **Executor Bot 主动轮询** — 通过 `GET /api/v1/messages/inbox` 或 Gateway curl 端点发现我

## 关键参数

| 字段 | 说明 | 默认值 |
|------|------|--------|
| `toBotId` | 目标执行 Bot | 必填 |
| `capability` | 需要的能力名称 | 必填 |
| `parameters` | 任务参数 (JSON) | `{}` |
| `priority` | `urgent` / `high` / `normal` / `low` | `normal` |
| `type` | `new` / `sub-task` | `new` |
| `timeoutSeconds` | 超时时间 | 3600 (1小时) |
| `parentTaskId` | 父任务 ID (sub-task 必填) | null |
| `senderSessionKey` | 发送方 session 标识 | null |
