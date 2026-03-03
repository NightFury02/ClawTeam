# Task 操作手册

> 本目录以 Task 为第一人称视角，描述 Task 生命周期中每个操作的业务逻辑、涉及模块和跨模块流转过程。

## 状态机总览

```
                    delegate
                       │
                       ▼
                   ┌────────┐
          ┌────────│ pending │◄──────────────┐
          │        └────┬───┘               │
          │             │ accept            │ reset / timeout-retry
          │             ▼                   │
          │        ┌─────────┐              │
          │        │accepted │──────────────┘
          │        └────┬────┘
          │             │ start
          │             ▼
          │        ┌──────────┐
          │        │processing│──────────────┘
          │        └────┬─────┘
          │             │
          │     ┌───────┼───────┬──────────────┐
          │     ▼       ▼       ▼              ▼
          │ completed  failed  timeout  waiting_for_input
          │                              ▲     │     │
          │                 need-human-  │     │     ├── complete → completed/failed
          │                 input (重入) ─┘     │     └── reset → pending
          │                              resume │
          │                                    ▼
          │                               processing
          │
          │ cancel (任意非终态)
          ▼
      cancelled
```

## 操作索引

| 操作 | 触发方式 | 状态变化 | 文档 |
|------|---------|---------|------|
| 创建 (delegate) | REST API | → pending | [DELEGATE.md](./DELEGATE.md) |
| Dashboard 手动创建 | Dashboard UI (精确/意图) | → pending | [DASHBOARD_CREATE.md](./DASHBOARD_CREATE.md) |
| 路由 (routing) | Poller 定时轮询 | 无 (消息路由) | [ROUTING.md](./ROUTING.md) |
| 接受 (accept) | REST API | pending → accepted | [ACCEPT_START_COMPLETE.md](./ACCEPT_START_COMPLETE.md) |
| 开始 (start) | REST API | accepted → processing | [ACCEPT_START_COMPLETE.md](./ACCEPT_START_COMPLETE.md) |
| 完成 (complete) | REST API | processing → completed/failed | [ACCEPT_START_COMPLETE.md](./ACCEPT_START_COMPLETE.md) |
| 取消 (cancel) | REST API / Dashboard | 任意非终态 → cancelled | [CANCEL.md](./CANCEL.md) |
| 重置 (reset) | REST API (Recovery 调用) | accepted/processing/waiting_for_input → pending | [RESET.md](./RESET.md) |
| 催促 (nudge) | Dashboard 手动 / Recovery 自动 | 无 (发送消息) | [NUDGE.md](./NUDGE.md) |
| 请求人类输入 (need-human-input) | REST API (executor/delegator bot) | accepted/processing → waiting_for_input | [NEED_HUMAN_INPUT.md](./NEED_HUMAN_INPUT.md) |
| 恢复 (resume) | Dashboard 人类回复 | waiting_for_input → processing | [NEED_HUMAN_INPUT.md](./NEED_HUMAN_INPUT.md) |
| 超时 (timeout) | TimeoutDetector 定时扫描 | → pending (重试) / → timeout | [TIMEOUT.md](./TIMEOUT.md) |
| 恢复 (recovery) | RecoveryLoop 定时扫描 | 视情况 | [RECOVERY.md](./RECOVERY.md) |
| 心跳 (heartbeat) | HeartbeatLoop 定时上报 | 无 (元数据更新) | [HEARTBEAT.md](./HEARTBEAT.md) |
