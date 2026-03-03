# 超时 (Timeout)

> 我是一个 Task，已经超过了 timeoutSeconds 还没完成。这是我被超时处理的过程。

## 触发

API Server 的 TimeoutDetector 定时扫描数据库，发现我的 `created_at + timeout_seconds < NOW()`。

## 流转过程

```
┌─────────────────────────────────────────────────────────┐
│ API Server — TimeoutDetector.detectTimeouts()           │
│ 📁 packages/api/src/task-coordinator/timeout-detector.ts│
│                                                         │
│ SELECT * FROM tasks                                     │
│ WHERE status IN ('pending', 'accepted', 'processing')   │
│   AND created_at + timeout_seconds * interval '1s'      │
│       < NOW()                                           │
│                                                         │
│ 发现我已超时                                             │
└────────────────────┬────────────────────────────────────┘
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
   retryCount < maxRetries   retryCount >= maxRetries
          │                     │
          ▼                     ▼
┌──────────────────┐  ┌──────────────────────────────┐
│ 重试 (retryTask) │  │ 标记超时 (markTimeout)        │
│                  │  │                              │
│ UPDATE tasks SET │  │ UPDATE tasks SET             │
│  status='pending'│  │  status='timeout',           │
│  retry_count++   │  │  error={code:'TIMEOUT'},     │
│  created_at=NOW()│  │  completed_at=NOW()          │
│                  │  │                              │
│ RPUSH queue      │  │ LREM queues                  │
│ (队列尾部)       │  │ ZREM processing_set          │
│                  │  │ DEL cache                    │
│ ZREM processing  │  │                              │
│                  │  │ Metrics:                     │
│                  │  │  tasksTimeoutTotal++          │
│                  │  │  taskDuration                 │
│                  │  │                              │
│                  │  │ messageBus.publish(           │
│                  │  │  'task_failed',               │
│                  │  │  reason='timeout')            │
└────────┬─────────┘  └──────────────┬───────────────┘
         │                           │
         ▼                           ▼
  回到 pending                  终态: timeout
  等待重新轮询                  Delegator Bot 收到失败通知
```

## 涉及模块

| 模块 | 角色 | 关键文件 |
|------|------|---------|
| API Server — TimeoutDetector | 定时扫描、决策重试或标记超时 | `timeout-detector.ts` |
| PostgreSQL | 查询超时任务、更新状态 | `tasks` 表 |
| Redis | 重新入队 (重试) 或清理 (超时) | 队列 + 缓存 |
| MessageBus | 广播 task_failed 事件 | `message-bus/` |

## 状态变化

```
重试:  pending/accepted/processing → pending  (retry_count++, created_at 重置)
超时:  pending/accepted/processing → timeout  (终态)
```

## 与 Recovery Reset 的关系

TimeoutDetector 和 RecoveryLoop 都可能处理同一个卡住的任务，但它们的视角不同：

```
时间线 ──────────────────────────────────────────────►

0min        5min         10min        60min
 │           │            │            │
 │ 创建      │ Recovery   │ Recovery   │ Timeout
 │           │ 检测 idle  │ 检测 dead  │ Detector
 │           │ → nudge    │ → reset    │ 触发
 │           │            │            │
```

| 维度 | TimeoutDetector | RecoveryLoop |
|------|----------------|--------------|
| 运行位置 | API Server (云端) | ClawTeam Gateway (本地) |
| 检测方式 | DB 查询 `created_at + timeout` | session 状态分析 |
| 触发时机 | 超过 timeoutSeconds | session idle/dead |
| 通常更早触发 | ❌ (默认 1 小时) | ✅ (5 分钟开始检测) |
| 通知 session | ❌ | ✅ (nudge/restore) |

正常情况下，RecoveryLoop 会比 TimeoutDetector 更早介入。TimeoutDetector 是最后的安全网。

## 超时后

- 如果重试：我回到 pending，`created_at` 被重置为 NOW()（重新计算超时），等待重新轮询
- 如果终态超时：我永久保留在 DB 中，status='timeout'，Delegator Bot 通过 WebSocket 收到失败通知
