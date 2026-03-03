# StaleTaskRecoveryLoop — 四级恢复

> 源码：`packages/clawteam-gateway/src/recovery/stale-task-recovery-loop.ts`

## 职责

检测异常的 session（idle、dead、errored），尝试恢复或清理卡死的任务。是 Gateway 可靠性的最后防线。

---

## 运行条件

- 仅在 CLI 模式下启用
- 间隔：`recovery.intervalMs`（默认 30s）
- 启动时立即执行一次

---

## 内部状态

| 数据 | 类型 | 说明 |
|------|------|------|
| `attemptTracker` | Map\<taskId, {attempts, lastAttemptAt}\> | 每个任务的恢复尝试次数 |
| `exhaustedTaskIds` | Set\<taskId\> | 已耗尽恢复次数的任务（黑名单） |
| `firstSeenAt` | Map\<taskId, timestamp\> | Gateway 首次观察到任务的时间 |
| `botId` | string | 当前 gateway 的 botId（用于委托方识别，`/gateway/register` 后可通过 `setBotId()` 热更新） |

---

## 每个 Tick 的处理流程

```
tick()
    │
    ├── 1. syncUntrackedTasks()     ← 从 API 同步未追踪的活跃任务
    ├── 2. sweepCancelledTasks()    ← 检测外部取消/完成的任务
    ├── 3. 解析所有 tracked session 状态
    ├── 4. 对每个 session 执行 processTaskStatus()
    ├── 5. 输出 tick 摘要日志
    └── 6. sessionTracker.cleanupRetired()
```

---

## 阶段 1: syncUntrackedTasks()

处理 Gateway 重启后丢失的映射，或其他 gateway 创建但需要本 gateway 处理的任务。

```
GET /api/v1/tasks/active (获取所有活跃任务)
    │
    ▼
对每个 pending 且未被 tracker 跟踪的任务:
    │
    ├── 已在 exhaustedTaskIds 黑名单 → 跳过
    │
    ├── 首次看到 → 记录 firstSeenAt，跳过（等下次检查）
    │
    ├── 未超过 stalenessThresholdMs → 跳过
    │
    └── 已超时 → 尝试 getTask() 验证可访问性
        ├── 有 targetSessionKey → track 到指定 session
        └── 没有 → track 到 main session
```

## 阶段 2: sweepCancelledTasks()

检测被外部（Dashboard、其他 gateway）取消或完成的任务。

```
对每个 tracked 任务:
    │
    ├── 从 API 获取最新状态
    │
    ├── 状态为终态 (completed/failed/timeout/cancelled)
    │     ├── 发送取消通知到 session（best-effort）
    │     ├── sessionTracker.untrack()
    │     └── 清理 attemptTracker + firstSeenAt
    │
    └── 非终态 → 跳过
```

## 阶段 3-4: processTaskStatus()

```
对每个 session:
    │
    ├── 状态正常 (active / tool_calling 未超时) → 跳过
    │
    ├── tool_calling 超过 toolCallingTimeoutMs (10min) → 视为 dead
    │
    ├── waiting_for_input → 跳过（合法等待人类）
    │
    ├── 委托方监控 session → 跳过
    │   (task.fromBotId === this.botId 且任务仍活跃)
    │
    ├── 任务已终态 → 清理 (untrack + remove)
    │
    ├── 恢复次数耗尽 (>= maxAttempts) → 终止任务
    │   ├── pending → cancel
    │   ├── accepted/processing → fail
    │   └── 加入 exhaustedTaskIds 黑名单
    │
    └── 需要恢复 → executeRecovery()
```

---

## 恢复策略（逐级升级）

### Dead Session

```
Session 状态: dead
    │
    ├── 1. 尝试 restoreSession()（从 .deleted.* 文件恢复）
    │     └── 成功 → 发送 nudge 消息
    │
    ├── 2. 恢复失败:
    │     ├── pending 任务 → untrack，等 poller 重新路由
    │     └── accepted/processing → resetTask() API（重置为 pending）
    │
    └── 3. API reset 也失败 → 发送 fallback 到 main session
          └── 使用正常任务格式（插件 spawn 流程）
```

### Idle / Completed / Errored Session

```
Session 状态: idle / completed / errored
    └── 发送 nudge 消息到 session
        └── 记录 attempt 次数
```

---

## Nudge 消息格式

```
[ClawTeam Task Recovery — Nudge]
Task ID: xxx
Instructions: ...
Capability: general
Status: processing
Session State Detected: idle
Recovery Attempt: 2/3

Your session appears to have gone idle...
Please continue working on the task...

If you need information:
  1. Task-related → DM delegator bot
  2. Executor-specific → /need-human-input

Complete using:
  curl -s -X POST .../gateway/tasks/xxx/complete ...
```

---

## 配置参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `intervalMs` | 30000 (30s) | Recovery 检查间隔 |
| `stalenessThresholdMs` | 300000 (5min) | Session idle 多久算 stale |
| `toolCallingTimeoutMs` | 600000 (10min) | tool_calling 卡住多久算 dead |
| `maxRecoveryAttempts` | 3 | 最大 nudge 次数 |

---

## 需要恢复的 Session 状态

`STALE_SESSION_STATES`: `idle`, `completed`, `errored`, `dead`

不需要恢复的状态：`active`, `tool_calling`（未超时）, `waiting`（等待输入）, `unknown`
