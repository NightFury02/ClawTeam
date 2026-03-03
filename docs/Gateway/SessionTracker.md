# SessionTracker — 内存双向映射

> 源码：`packages/clawteam-gateway/src/routing/session-tracker.ts`

## 职责

维护 taskId ↔ sessionKey 的双向映射，是整个路由系统的核心状态。所有组件（Router、Heartbeat、Recovery、GatewayProxy）共享同一个 SessionTracker 实例。

---

## 数据结构

全部内存，不持久化。

```
taskToSession:    Map<taskId, sessionKey>                    活跃映射
sessionToTasks:   Map<sessionKey, Set<taskId>>                反向查询
retired:          Map<taskId, {sessionKey, retiredAt}>        已完成但保留
```

---

## 公开方法

| 方法 | 说明 |
|------|------|
| `track(taskId, sessionKey)` | 建立双向映射。如果在 retired 中，先移除 |
| `untrack(taskId)` | 从活跃映射移除，加入 retired（保留 24h） |
| `isTracked(taskId)` | 是否在活跃映射中（不查 retired） |
| `getSessionForTask(taskId)` | 先查活跃，再查 retired（检查 TTL），返回 sessionKey |
| `getTasksForSession(sessionKey)` | 返回某 session 的所有活跃任务 ID |
| `getAllTracked()` | 返回所有活跃 `{taskId, sessionKey}` 数组 |
| `cleanupRetired()` | 删除 `retiredAt > retentionMs` 的条目，返回清理数量 |
| `getStats()` | 返回 `{trackedTasks, activeSessions, retiredTasks}` |

---

## 状态转换

```
track(taskId, sessionKey)
    → 加入 taskToSession + sessionToTasks
    → 如果在 retired 中，先移除

untrack(taskId)
    → 从 taskToSession + sessionToTasks 移除
    → 加入 retired（保留 retentionMs，默认 24h）
    → 用于子任务解析：sub-task 可能在 parent 完成后才需要查 session

cleanupRetired()
    → 删除 retiredAt 超过 retentionMs 的条目
    → 由 Recovery Loop 每个 tick 结束时调用
```

---

## track 时机

| 来源 | 触发条件 |
|------|---------|
| GatewayProxy `/gateway/track-session` | 插件 `after_tool_call` 调用，spawn 完成后 |
| TaskRouter `sendToSession()` | sub-task 成功发送到已有 session |
| Recovery `syncUntrackedTasks()` | API 中有未追踪的活跃任务 |

## untrack 时机

| 来源 | 触发条件 |
|------|---------|
| GatewayProxy `/gateway/tasks/:id/complete` | 任务完成 |
| GatewayProxy `/gateway/tasks/:id/cancel` | 任务取消 |
| Recovery Loop | 任务已终态 / 恢复次数耗尽 |

---

## 设计决策

- **纯内存**：不使用 Redis，单进程足够。Gateway 重启后映射丢失，靠 Recovery Loop 的 `syncUntrackedTasks()` 从 API 重建。
- **retired 保留**：完成的任务保留 24h 映射，因为 sub-task 可能在 parent 完成后才路由，需要查找 parent 的 session。
- **双向映射**：支持按 taskId 查 session（路由用），也支持按 session 查所有 task（心跳/恢复用）。
