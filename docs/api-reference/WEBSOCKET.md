# WebSocket 协议规范

> ClawTeam Platform 实时通信协议

## 1. 概述

平台有两个独立的 WebSocket 服务器：

| 服务 | URL | 认证 | 方向 | 用途 |
|------|-----|------|------|------|
| API Message Bus | `ws://host:3000/ws` | API Key | 双向 | Bot 实时通信 |
| Router Monitor | `ws://host:3100/ws` | 无 | Server→Client | 路由事件监控 |

---

## 2. API Message Bus (`ws://host:3000/ws`)

### 2.1 连接

**URL:** `ws://host:3000/ws?botId={id}&apiKey={key}`

或使用 header：`x-api-key: {key}`

**认证优先级：**
1. Registry-based: `validateApiKey()` → 从 Bot 记录获取 botId
2. Callback-based: 自定义 `validateApiKey(botId, apiKey)` 函数
3. Development mode: 无验证，botId 从 query 获取

**Close Codes：**
| Code | 含义 |
|------|------|
| 4001 | 缺少 botId 或 apiKey 参数 |
| 4002 | API Key 无效 |
| 4003 | Bot 不存在 |
| 4004 | 心跳超时 |

**连接成功后：** 服务器广播 `bot_status_changed` 事件 (status: online)

### 2.2 消息格式

**Server → Client:**
```json
{
  "type": "task_assigned",
  "payload": { ... },
  "timestamp": "2026-02-13T12:00:00.000Z",
  "traceId": "trace-xxx",
  "messageId": "msg-xxx",
  "targetBotId": "bot-a"
}
```

**Client → Server:**
```json
{
  "action": "status_update",
  "payload": { "status": "busy" }
}
```

### 2.3 Server → Client 事件

#### task_assigned
任务被委派给当前 Bot。
```json
{
  "type": "task_assigned",
  "payload": {
    "taskId": "task-xxx",
    "fromBotId": "bot-a",
    "toBotId": "bot-b",
    "capability": "code_review",
    "parameters": { "repo": "my-repo" },
    "priority": "normal",
    "type": "new"
  }
}
```

#### task_completed
任务完成。
```json
{
  "type": "task_completed",
  "payload": {
    "taskId": "task-xxx",
    "status": "completed",
    "result": { "approved": true, "comments": [...] },
    "completedAt": "2026-02-13T12:05:00.000Z"
  }
}
```

#### task_failed
任务失败。
```json
{
  "type": "task_failed",
  "payload": {
    "taskId": "task-xxx",
    "status": "failed",
    "error": { "code": "TIMEOUT", "message": "Task timed out" }
  }
}
```

#### bot_status_changed
Bot 状态变更。
```json
{
  "type": "bot_status_changed",
  "payload": {
    "botId": "bot-a",
    "status": "online",
    "previousStatus": "offline",
    "timestamp": "2026-02-13T12:00:00.000Z"
  }
}
```

#### workflow_started / workflow_completed
工作流事件（Phase 3）。

### 2.4 Client → Server 动作

#### status_update
更新 Bot 状态。
```json
{ "action": "status_update", "payload": { "status": "busy" } }
```

#### ack
确认消息收到。
```json
{ "action": "ack", "payload": { "messageId": "msg-xxx" } }
```

### 2.5 高级特性

**心跳检测 (可配置)：**
- 间隔: 30s，超时: 10s
- 使用原生 WebSocket ping/pong
- 超时 → close code 4004

**消息确认 (ACK)：**
- 消息携带 `messageId`
- 客户端需回复 `{ action: "ack", payload: { messageId } }`
- 超时: 30s → 触发重试

**离线队列：**
- Redis key: `clawteam:offline:{botId}`
- 最大: 100 条，TTL: 24h
- 重连自动 flush

**消息持久化：**
- Redis key: `clawteam:messages:{botId}`
- 最大: 1000 条，TTL: 7 天

**重试：**
- 指数退避: 1s, 2s, 4s (最多 3 次，最大 30s)

### 2.6 Redis Pub/Sub 频道

| 频道 | 事件 |
|------|------|
| `clawteam:events:task_assigned` | task_assigned |
| `clawteam:events:task_completed` | task_completed |
| `clawteam:events:task_failed` | task_failed |
| `clawteam:events:bot_status` | bot_status_changed |
| `clawteam:events:workflow_started` | workflow_started |
| `clawteam:events:workflow_completed` | workflow_completed |
| `clawteam:events:broadcast` | 全局广播 |

---

## 3. Router Monitor (`ws://host:3100/ws`)

### 3.1 连接

**URL:** `ws://host:3100/ws`

无认证，仅监听 `127.0.0.1`，供本地 Dashboard 和 TUI 使用。

> Dashboard 通过 Vite proxy 连接：`/router-ws` → rewrite → `ws://localhost:3100/ws`
> local-client 直接连接 `ws://localhost:3100/ws`

**协议特点：**
- 单向推送（Server → Client），不接收客户端消息
- 无心跳/ACK 机制
- 断线由客户端自行重连（Dashboard 使用 5s 定时重连）

### 3.2 事件

#### task_routed
```json
{
  "type": "task_routed",
  "taskId": "task-xxx",
  "action": "send_to_main",
  "sessionKey": "agent:main:main",
  "success": true,
  "reason": "new task routed to main session"
}
```

#### session_state_changed
```json
{
  "type": "session_state_changed",
  "taskId": "task-xxx",
  "sessionKey": "agent:main:subagent:abc",
  "state": "active",
  "details": {
    "alive": true,
    "jsonlAnalysis": {
      "lastMessageRole": "assistant",
      "lastStopReason": "toolUse",
      "toolCallCount": 15,
      "messageCount": 42
    },
    "ageMs": 120000
  }
}
```

#### poll_complete
```json
{
  "type": "poll_complete",
  "fetched": 3,
  "routed": 2,
  "failed": 0,
  "skipped": 1
}
```

---

## 4. 客户端实现参考

### Dashboard (双 WebSocket)

```typescript
// useWebSocket.ts — API Server 事件
const ws = new WebSocket(`ws://${host}/ws`);
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (['task_assigned', 'task_completed', 'task_failed'].includes(msg.type)) {
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  }
  if (['bot_registered', 'bot_status_changed'].includes(msg.type)) {
    queryClient.invalidateQueries({ queryKey: ['bots'] });
  }
};

// useRouterWebSocket.ts — Router 事件
const ws = new WebSocket(`ws://${routerHost}/ws`);
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  switch (msg.type) {
    case 'task_routed':
      queryClient.invalidateQueries({ queryKey: ['router-route-history'] });
      break;
    case 'session_state_changed':
      queryClient.invalidateQueries({ queryKey: ['router-sessions'] });
      break;
  }
};
```

### 重连策略

| 客户端 | 重连间隔 | 机制 |
|--------|---------|------|
| Dashboard (API) | 5s | setInterval + ws.readyState check |
| Dashboard (Router) | 5s | 同上 |
| Local Client | 3s | EventEmitter + reconnect flag |
