# 催促 (Nudge)

> 我是一个 processing 状态的 Task，但执行我的 session 似乎停滞了。这是我被催促的过程。

Nudge 有两种触发方式：Recovery Loop 自动催促和 Dashboard 手动催促。两者都是向 session 发送消息，不改变我的状态。

---

## 路径 A：自动催促 (Recovery Loop)

### 触发

StaleTaskRecoveryLoop 每 2 分钟扫描一次，发现执行我的 session 处于以下状态：
- `idle` 且超过 stalenessThreshold (默认 5 分钟无活动)
- `completed` (session 结束了但我还没被 complete)
- `errored` (session 出错了)

### 流转过程

```
┌─────────────────────────────────────────────────────────┐
│ StaleTaskRecoveryLoop.tick()                            │
│ 📁 stale-task-recovery-loop.ts:114                      │
│                                                         │
│ 1. syncUntrackedTasks() — 同步未追踪的活跃任务           │
│ 2. sessionTracker.getAllTracked() — 获取所有追踪中的任务  │
│ 3. resolver.resolveForTasks() — 批量解析 session 状态    │
│                                                         │
│ 对于每个 stale session:                                  │
│ 4. clawteamApi.getTask(myId) — 确认我还在活跃状态        │
│    - 如果我已 completed/failed/cancelled → untrack, 跳过 │
│ 5. attemptTracker.getAttempts(myId) — 检查催促次数       │
│    - 如果 >= maxRecoveryAttempts → 跳过 (已耗尽)         │
│ 6. attemptTracker.recordAttempt(myId)                   │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ handleNudge()                                           │
│ 📁 stale-task-recovery-loop.ts:503                      │
│                                                         │
│ 构建催促消息:                                            │
│   [ClawTeam Task Recovery — Nudge]                      │
│   Task ID: {myId}                                       │
│   Capability: {capability}                              │
│   Status: {status}                                      │
│   Session State: idle (5m+ no activity)                 │
│   Recovery Attempt: 1/3                                 │
│                                                         │
│   请继续处理任务并在完成后调用 complete 端点。             │
│   POST http://host:3000/api/v1/tasks/{myId}/complete    │
│                                                         │
│ openclession.sendToSession(sessionKey, message)      │
└─────────────────────────────────────────────────────────┘
```

### 催促升级

如果多次催促无效，Recovery Loop 会根据 session 状态升级处理：

```
第 1 次: nudge (发消息催促)
第 2 次: nudge (再次催促)
第 3 次: nudge (最后一次)
耗尽后: 不再催促，等待 session 状态变为 dead 后走恢复流程
```

> 如果 session 变为 `dead`，则不走 nudge 路径，直接走 [RECOVERY.md](./RECOVERY.md) 的 restore → reset → fallback 流程。

---

## 路径 B：手动催促 (Dashboard)

### 触发

Dashboard 操作员点击 Nudge 按钮，调用 Router 的 `POST /tasks/{myId}/nudge`。

### 流转过程

```
Dashboard 操作员
  │
  │ POST /router-api/tasks/{myId}/nudge  (Vite proxy → :3100)
  ▼
┌─────────────────────────────────────────────────────────┐
│ ClawTeam Gateway — RouterApiServer                      │
│ 📁 packages/clawteam-gateway/src/server/router-api.ts:194│
│                                                         │
│ 1. sessionTracker.getSessionForTask(myId)               │
│    → 找到 sessionKey                                    │
│    → 找不到 → 返回 { success: false, "Task not tracked" }│
│                                                         │
│ 2. clawteamApi.getTask(myId)                            │
│    → 确认我处于 accepted 或 processing                   │
│    → 其他状态 → 返回 { success: false, "not active" }    │
│                                                         │
│ 3. 构建催促消息:                                         │
│    [ClawTeam Task — Manual Nudge]                       │
│    Task ID: {myId}                                      │
│    Capability: {capability}                             │
│    Status: {status}                                     │
│    This is a manual nudge from the dashboard operator.  │
│    POST http://host:3000/api/v1/tasks/{myId}/complete   │
│                                                         │
│ 4. openclession.sendToSession(sessionKey, message)   │
└─────────────────────────────────────────────────────────┘
```

## 两种催促的对比

| 维度 | 自动催促 (Recovery) | 手动催促 (Dashboard) |
|------|-------------------|---------------------|
| 触发 | RecoveryLoop 定时扫描 | 操作员手动点击 |
| 前置条件 | session idle 5min+ / completed / errored | accepted 或 processing |
| 次数限制 | maxRecoveryAttempts (默认 3) | 无限制 |
| 消息标记 | `[ClawTeam Task Recovery — Nudge]` | `[ClawTeam Task — Manual Nudge]` |
| 包含尝试次数 | ✅ `Recovery Attempt: 1/3` | ❌ |

## 涉及模块

| 模块 | 角色 | 关键文件 |
|------|------|---------|
| ClawTeam Gateway — RecoveryLoop | 自动检测 + 催促 | `stale-task-recovery-loop.ts` |
| ClawTeam Gateway — RouterApi | 手动催促端点 | `router-api.ts:194` |
| SessionStatusResolver | 解析 session 状态 | `session-status-resolver.ts` |
| OpenClaw CLI | 发送消息到 session | `openclaw-session.ts` |
| AttemptTracker | 记录自动催促次数 | `stale-task-recovery-loop.ts` 内部 |

## 状态变化

```
无变化 — nudge 只是发送消息，不改变我的状态
```

## 催促无效后的去向

- 如果 session 恢复工作 → 正常 complete → 见 [ACCEPT_START_COMPLETE.md](./ACCEPT_START_COMPLETE.md)
- 如果 session 死亡 → 走恢复流程 → 见 [RECOVERY.md](./RECOVERY.md)
- 如果超时 → 走超时流程 → 见 [TIMEOUT.md](./TIMEOUT.md)
