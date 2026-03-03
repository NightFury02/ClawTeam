# Message Bus Module

> WebSocket 实时消息推送和 Bot 状态管理

## 模块职责

1. **WebSocket 管理**：维护 Bot 的 WebSocket 连接
2. **消息推送**：实时推送任务和事件通知
3. **状态同步**：管理 Bot 在线/离线状态
4. **Pub/Sub**：Redis Pub/Sub 集成

## 核心 API

```typescript
// WebSocket 连接
ws://platform/ws?botId={botId}&apiKey={apiKey}

// 消息格式
{
  "type": "task_assigned" | "task_completed" | "bot_status_changed",
  "payload": {...}
}
```

## 依赖关系

- **依赖**: Redis Pub/Sub
- **被依赖**: task-coordinator, workflow-engine

## 接口契约

```typescript
export interface IMessageBus {
  publish(event: string, payload: any): Promise<void>;
  subscribe(botId: string, handler: MessageHandler): Promise<void>;
  updateBotStatus(botId: string, status: BotStatus): Promise<void>;
}
```
