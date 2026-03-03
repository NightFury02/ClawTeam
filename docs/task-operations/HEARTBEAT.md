# 心跳 (Heartbeat)

> 我是一个 processing 状态的 Task。ClawTeam Gateway 定期检查执行我的 session 状态，并向 API Server 上报。

## 触发

HeartbeatLoop 每 30 秒执行一次，遍历所有被追踪的任务。

## 流转过程

```
┌─────────────────────────────────────────────────────────┐
│ ClawTeam Gateway — HeartbeatLoop.tick()                  │
│ 📁 packages/clawteam-gateway/src/monitoring/heartbeat-loop.ts│
│                                                         │
│ 1. sessionTracker.getAllTracked()                        │
│    → [{ taskId: myId, sessionKey: "agent:main:sub:abc" }]│
│                                                         │
│ 2. resolver.resolveForTasks(trackedTasks)               │
│    → 批量解析所有 session 状态                           │
│    → 分析 JSONL 文件 (lastMessageRole, stopReason,      │
│       toolCallCount, messageCount)                      │
│    → 判断 session 状态: active/idle/tool_calling/        │
│       waiting/completed/errored/dead                    │
│                                                         │
│ 3. 对于每个非 dead 的 session:                           │
│    构建 HeartbeatPayload                                │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ clawteamApi.sendHeartbeat(myId, payload)                │
│ POST /api/v1/tasks/{myId}/heartbeat                     │
│ Body: {                                                 │
│   sessionKey: "agent:main:subagent:abc",                │
│   sessionStatus: "active",                              │
│   lastActivityAt: "2026-02-13T10:30:00Z",               │
│   details: {                                            │
│     alive: true,                                        │
│     jsonlAnalysis: {                                    │
│       lastMessageRole: "assistant",                     │
│       lastStopReason: "toolUse",                        │
│       toolCallCount: 15,                                │
│       messageCount: 42                                  │
│     },                                                  │
│     ageMs: 120000                                       │
│   }                                                     │
│ }                                                       │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ API Server — Heartbeat Route                            │
│ 📁 packages/api/src/task-coordinator/routes/index.ts:324│
│                                                         │
│ UPDATE tasks SET                                        │
│   last_heartbeat_at = NOW(),                            │
│   session_status = $sessionStatus,                      │
│   heartbeat_details = $details                          │
│ WHERE id = $myId                                        │
└��────────────────────────────────────────────────────────┘
                     │
                     │ emit('session_state_changed')
                     ▼
              WebSocket 推送给 Dashboard / TUI
```

## 涉及模块

| 模块 | 角色 | 关键文件 |
|------|------|---------|
| ClawTeam Gateway — HeartbeatLoop | 定时触发、遍历任务 | `heartbeat-loop.ts` |
| ClawTeam Gateway — SessionStatusResolver | 解析 session 状态 (JSONL) | `session-status-resolver.ts` |
| API Server — Routes | 接收心跳、更新 DB | `routes/index.ts:324` |
| PostgreSQL | 存储心跳元数据 | `tasks.last_heartbeat_at`, `session_status`, `heartbeat_details` |
| Router WebSocket | 推送状态变化事件 | `router-api.ts` |

## 状态变化

```
无变化 — 心跳只更新元数据字段，不改变 task status
```

更新的字段：
- `last_heartbeat_at` — 最后心跳时间
- `session_status` — session 当前状态 (active/idle/tool_calling/...)
- `heartbeat_details` — JSON 详情 (sessionKey, JSONL 分析结果, ageMs)

## Session 状态解析

SessionStatusResolver 通过分析 OpenClaw session 的 JSONL 文件来判断状态：

| 状态 | 判断依据 |
|------|---------|
| `active` | session 进程存活，最近有活动 |
| `idle` | session 进程存活，但长时间无新消息 |
| `tool_calling` | 最后一条消息的 stopReason 是 `toolUse` |
| `waiting` | 最后一条消息的 stopReason 是 `endTurn` (等待输入) |
| `completed` | session 进程已退出，正常结束 |
| `errored` | session 进程已退出，异常结束 |
| `dead` | session 进程不存在 / JSONL 文件不存在 |

## 心跳的消费者

| 消费者 | 用途 |
|--------|------|
| Dashboard | 显示 session 实时状态、活动时间 |
| RecoveryLoop | 不直接消费心跳，但共享 SessionStatusResolver |
| API Server | 存储心跳数据供查询 |
