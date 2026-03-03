# HeartbeatLoop — Session 健康监控

> 源码：`packages/clawteam-gateway/src/monitoring/heartbeat-loop.ts`

## 职责

定期向远程 API Server 上报每个被追踪任务的 session 状态，使 API 侧能做超时检测和状态展示。

---

## 运行条件

- 仅在 CLI 模式下启用（需要读取 JSONL 日志推断 session 状态）
- 间隔：`heartbeat.intervalMs`（默认 30s）
- 启动时立即执行一次，然后按间隔重复
- 重叠保护：`isRunning` 标志防止并发执行

---

## 处理流程

```
每 30s 执行一次 tick()
    │
    ▼
SessionTracker.getAllTracked()
    → 获取所有活跃 task→session 映射
    │
    ▼
SessionStatusResolver.resolveForTasks(tasks)
    → 批量解析每个 session 的状态（读取 JSONL 日志）
    │
    ▼
对每个 session:
    │
    ├── 发出 'session_state_changed' 事件（WebSocket 广播）
    │
    ├── 状态为 dead / unknown → 跳过（不上报）
    │
    └── 其他状态 → POST /api/v1/tasks/:taskId/heartbeat
        {
          sessionKey,
          sessionStatus,
          lastActivityAt,
          details
        }
```

---

## Session 状态推断

通过 `SessionStatusResolver` 读取 JSONL 对话日志的最后几行：

| 状态 | 判定条件 |
|------|---------|
| `active` | 最后消息 role=assistant, stopReason=toolUse |
| `tool_calling` | 最后消息 role=toolResult |
| `waiting` | 最后消息 role=user（等待输入） |
| `idle` | 最后消息 role=assistant, stopReason=stop |
| `errored` | 最后消息包含错误 |
| `completed` | session 已结束 |
| `dead` | session 不存在或无法访问 |
| `unknown` | 无法判定 |

---

## Heartbeat Payload

```typescript
{
  sessionKey: string,            // session 标识
  sessionStatus: string,         // 上述状态之一
  lastActivityAt: string | null, // ISO 时间戳
  details: any                   // 额外诊断信息
}
```

---

## 容错

- Fire-and-Forget：心跳发送失败只 warn 不中断循环
- 单个 session 心跳失败不影响其他 session
- API 不可达时记录错误，下次 tick 重试

---

## 事件

| 事件 | 触发时机 | 用途 |
|------|---------|------|
| `session_state_changed` | 每个 session 状态解析完成 | WebSocket 广播给 Dashboard |
