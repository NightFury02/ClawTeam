# ClawTeam 接口文档

## 架构概览

```
Dashboard / OpenClaw Agent
        │
        ▼
┌─────────────────────────────┐
│  Gateway (localhost:3100)   │
│  ├─ /gateway/*  (Proxy)     │  ← Agent session 通过 curl 调用
│  ├─ /delegate-intent        │  ← Dashboard 触发
│  └─ /status, /tasks, /ws   │  ← Dashboard 监控
└──────────┬──────────────────┘
           │ HTTP proxy (Bearer token + X-Bot-Id)
           ▼
┌─────────────────────────────┐
│  API Server (localhost:3000)  │
│  ├─ /api/v1/tasks/*         │
│  ├─ /api/v1/bots/*          │
│  ├─ /api/v1/messages/*      │
│  └─ /api/v1/capabilities/*  │
└─────────────────────────────┘
```

---

## 1. Gateway Proxy 接口 (`/gateway/*`)

**来源:** `src/gateway/gateway-proxy.ts`
**认证:** 使用 config 中的 API key + botId 自动注入 auth header
**调用方:** OpenClaw agent session (通过 curl)

| 方法 | 路径 | 说明 | 代理到 API | Agent 可调用 |
|------|------|------|-----------|:---:|
| POST | `/gateway/register` | 注册 bot | `/api/v1/bots/register` | ✅ |
| GET | `/gateway/bots` | 列出所有 bot | `/api/v1/bots` | ✅ |
| GET | `/gateway/bots/:botId` | 获取 bot 详情 | `/api/v1/bots/:botId` | ✅ |
| POST | `/gateway/delegate` | 委派任务 | `/api/v1/tasks/delegate` | ✅ |
| GET | `/gateway/tasks/pending` | 拉取待处理任务 | `/api/v1/tasks/pending` | ✅ |
| POST | `/gateway/tasks/:taskId/accept` | 接受任务（自动 start） | `/api/v1/tasks/:taskId/accept` + `/start` | ✅ |
| POST | `/gateway/tasks/:taskId/complete` | 完成任务 | `/api/v1/tasks/:taskId/complete` | ✅ |
| POST | `/gateway/tasks/:taskId/need-human-input` | 标记需要人类输入 | `/api/v1/tasks/:taskId/need-human-input` | ✅ |
| POST | `/gateway/tasks/:taskId/resume` | 从等待状态恢复 | `/api/v1/tasks/:taskId/resume` | ✅ |
| POST | `/gateway/tasks/:taskId/cancel` | 取消任务 | `/api/v1/tasks/all/:taskId/cancel` | ✅ |
| GET | `/gateway/tasks/:taskId` | 查询任务状态 | `/api/v1/tasks/:taskId` | ✅ |
| POST | `/gateway/messages/send` | 发送消息给其他 bot | `/api/v1/messages/send` | ✅ |
| GET | `/gateway/messages/inbox` | 查看收件箱 | `/api/v1/messages/inbox` | ✅ |
| POST | `/gateway/messages/:messageId/ack` | 确认消息已读 | `/api/v1/messages/:messageId/ack` | ✅ |
| POST | `/gateway/track-session` | 持久化 session 映射 | `/api/v1/tasks/:taskId/track-session` | ✅ (插件) |

### Gateway Proxy 特殊行为

- **`/gateway/delegate`**: 创建任务后，自动将 realTaskId 链接到 intent session（用于消息路由）
- **`/gateway/tasks/:taskId/accept`**: 合并了 accept + start 两步操作，并自动 track session
- **`/gateway/tasks/:taskId/complete`**: 完成后自动 untrack session
- **`/gateway/tasks/:taskId/cancel`**: 取消后自动 untrack session
- **所有请求**使用 `authHeaders(apiKey, botId)` 注入认证，botId 来自 gateway config

---

## 2. Router API 接口（Gateway 内部）

**来源:** `src/server/router-api.ts`
**认证:** 无（内部 / Dashboard 使用）
**调用方:** Dashboard UI、内部管理

| 方法 | 路径 | 说明 | Agent 可调用 |
|------|------|------|:---:|
| GET | `/status` | 路由器状态（uptime、tracked tasks、active sessions） | ❌ |
| GET | `/sessions` | 列出所有 session 及状态 | ❌ |
| GET | `/sessions/:key` | 查询特定 session 状态 | ❌ |
| GET | `/tasks` | 列出所有被追踪的任务 | ❌ |
| GET | `/routes/history` | 路由历史（最近 100 条） | ❌ |
| POST | `/tasks/:taskId/cancel` | 取消任务（通知 session + API cancel + untrack） | ❌ |
| POST | `/tasks/:taskId/nudge` | 手动 nudge 任务的 session | ❌ |
| POST | `/tasks/:taskId/resume` | 恢复 waiting_for_input 任务（通知 session） | ❌ |
| POST | `/sessions/main/reset` | 重置主 session（归档旧 transcript） | ❌ |
| POST | `/delegate-intent` | 发送自然语言 intent 到主 session | ❌ (Dashboard) |
| POST | `/notify/task-accepted` | ⚠️ 已废弃 | ❌ |
| POST | `/notify/task-completed` | ⚠️ 已废弃 | ❌ |
| WS | `/ws` | WebSocket 实时事件推送（最多 10 连接） | ❌ |

---

## 3. API — 任务协调器接口 (`/api/v1/tasks/*`)

**来源:** `packages/api/src/task-coordinator/routes/index.ts`
**认证:** 需要 Bearer token（bot API key 或 user API key）

### 受保护接口（需认证）

| 方法 | 路径 | 说明 | 权限检查 |
|------|------|------|---------|
| POST | `/api/v1/tasks/delegate` | 创建并入队任务 | 认证即可 |
| GET | `/api/v1/tasks/pending` | 拉取待处理任务（按优先级排序） | 认证即可 |
| POST | `/api/v1/tasks/:taskId/accept` | 接受任务 | toBotId 匹配 |
| POST | `/api/v1/tasks/:taskId/start` | 标记为 processing | toBotId 匹配 |
| POST | `/api/v1/tasks/:taskId/complete` | 提交结果 | toBotId 匹配 |
| POST | `/api/v1/tasks/:taskId/cancel` | 取消任务 | toBotId 匹配 |
| POST | `/api/v1/tasks/:taskId/need-human-input` | 标记需要人类输入 | toBotId 或 fromBotId |
| POST | `/api/v1/tasks/:taskId/resume` | 从等待状态恢复 | toBotId 或 fromBotId |
| POST | `/api/v1/tasks/:taskId/reset` | 重置为 pending | toBotId 匹配 |
| POST | `/api/v1/tasks/:taskId/heartbeat` | 心跳上报 | 认证即可 |
| POST | `/api/v1/tasks/:taskId/track-session` | 持久化 session 映射到 task_sessions 表 | 认证即可 |
| GET | `/api/v1/tasks/:taskId/sessions` | 获取某个 task 的所有 session 映射 | 认证即可 |
| GET | `/api/v1/tasks/sessions-by-bot` | 获取某个 bot 的所有 session 映射（?botId=xxx） | 认证即可 |
| GET | `/api/v1/tasks/:taskId` | 查询任务详情 | toBotId 或 fromBotId |
| GET | `/api/v1/tasks` | 列出当前 bot 的任务（分页） | 认证即可 |

### 公开接口（无需认证）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/tasks/all/:taskId/cancel` | Dashboard 管理取消（清理 DB + Redis） |
| GET | `/api/v1/tasks/all` | Dashboard 列出所有任务（最近 100） |
| GET | `/api/v1/tasks/metrics` | Prometheus 指标 |
| GET | `/api/v1/tasks/health` | 健康检查（DB、Redis、依赖） |

---

## 4. API — Bot 管理接口 (`/api/v1/bots/*`)

**来源:** `packages/api/src/capability-registry/routes/`

| 方法 | 路径 | 认证 | 说明 |
|------|------|:---:|------|
| GET | `/api/v1/bots` | ❌ | 列出所有 bot |
| GET | `/api/v1/bots/me` | ✅ | 获取当前 bot 信息 |
| POST | `/api/v1/bots/register` | ✅ (user key) | 注册新 bot，返回 API key |
| GET | `/api/v1/bots/:botId` | ❌ | 获取 bot 详情 |
| PUT | `/api/v1/bots/:botId/capabilities` | ✅ | 更新 bot 能力 |
| PUT | `/api/v1/bots/:botId/status` | ✅ | 更新 bot 状态 |
| POST | `/api/v1/bots/:botId/heartbeat` | ✅ | 记录心跳 |

---

## 5. API — 消息接口 (`/api/v1/messages/*`)

**来源:** `packages/api/src/messages/routes.ts`

| 方法 | 路径 | 认证 | 说明 |
|------|------|:---:|------|
| POST | `/api/v1/messages/send` | ✅ | 发送消息到目标 bot 收件箱 |
| GET | `/api/v1/messages/inbox` | ✅ | 拉取收件箱消息（按优先级排序） |
| POST | `/api/v1/messages/:messageId/ack` | ✅ | 确认消息已读（从 Redis 移除） |
| GET | `/api/v1/messages/all` | ❌ | Dashboard 列出所有消息（最近 200） |
| GET | `/api/v1/messages` | ✅ | 列出当前 bot 的消息（分页） |

---

## 6. API — 能力搜索接口 (`/api/v1/capabilities/*`)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/capabilities/search` | 按条件搜索能力（支持过滤和分页） |
| GET | `/api/v1/capabilities/:name/bots` | 按能力名称查找 bot |

---

## 7. API — 其他接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | API 信息（名称、版本、端点列表） |
| GET | `/api/health` | 基础健康检查（DB + Redis） |
| GET | `/api/v1/primitives` | 列出所有 primitive 元数据 |
| GET | `/api/v1/primitives/:name` | 获取特定 primitive 元数据 |

---

## Gateway ↔ API 对应关系

```
Gateway Proxy                          API Server
─────────────                          ──────────
/gateway/register              →  /api/v1/bots/register
/gateway/bots                  →  /api/v1/bots
/gateway/bots/:botId           →  /api/v1/bots/:botId
/gateway/delegate              →  /api/v1/tasks/delegate
/gateway/tasks/pending         →  /api/v1/tasks/pending
/gateway/tasks/:id/accept      →  /api/v1/tasks/:id/accept + /start
/gateway/tasks/:id/complete    →  /api/v1/tasks/:id/complete
/gateway/tasks/:id/need-human  →  /api/v1/tasks/:id/need-human-input
/gateway/tasks/:id/resume      →  /api/v1/tasks/:id/resume
/gateway/tasks/:id/cancel      →  /api/v1/tasks/all/:id/cancel  ⚠️ 注意: 走的是公开接口
/gateway/tasks/:id             →  /api/v1/tasks/:id
/gateway/messages/send         →  /api/v1/messages/send
/gateway/messages/inbox        →  /api/v1/messages/inbox
/gateway/messages/:id/ack      →  /api/v1/messages/:id/ack
/gateway/track-session         →  /api/v1/tasks/:taskId/track-session  (taskId from body)
```

### ⚠️ 注意事项

- `/gateway/tasks/:id/cancel` 代理到 `/api/v1/tasks/all/:id/cancel`（公开接口），而非受保护的 `/api/v1/tasks/:id/cancel`
- `/gateway/tasks/:id/accept` 合并了 accept + start 两步，API 端是分开的
- 所有 gateway proxy 请求使用 gateway config 中的 botId，不是调用方的 botId
- `/gateway/track-session` 由 `clawteam-auto-tracker` 插件在 `sessions_spawn` 时自动调用，持久化 taskId ↔ sessionKey ↔ botId 映射到 `task_sessions` 表

### X-Bot-Id Header 要求

Dashboard 直接调用 API Server 的 `POST /api/v1/tasks/:id/resume` 和 `POST /api/v1/tasks/:id/continue` 时，**必须**在请求头中携带 `X-Bot-Id: <fromBotId>`。

原因：Dashboard 使用 user-level API key 认证，API Server 的 `getBotId()` 对 user-level key 返回空字符串。`completer.ts` 的权限校验 `task.toBotId !== botId && task.fromBotId !== botId` 会因 botId 为空而返回 403。`X-Bot-Id` header 告知 API Server 这个操作是代表哪个 bot 发起的。

---

## Agent Session 中可用的 curl 命令

以下是 OpenClaw agent session 在执行任务时可以调用的接口：

### 任务生命周期

```bash
# 查找可用 bot
curl -s http://localhost:3100/gateway/bots

# 委派任务
curl -s -X POST http://localhost:3100/gateway/delegate \
  -H 'Content-Type: application/json' \
  -d '{"toBotId":"BOT_ID","prompt":"任务描述","priority":"normal"}'

# 接受任务（自动 start）
curl -s -X POST http://localhost:3100/gateway/tasks/TASK_ID/accept \
  -H 'Content-Type: application/json'

# 完成任务
curl -s -X POST http://localhost:3100/gateway/tasks/TASK_ID/complete \
  -H 'Content-Type: application/json' \
  -d '{"status":"completed","result":{"summary":"任务结果"}}'

# 取消任务
curl -s -X POST http://localhost:3100/gateway/tasks/TASK_ID/cancel \
  -H 'Content-Type: application/json' \
  -d '{"reason":"取消原因"}'

# 标记需要人类输入
curl -s -X POST http://localhost:3100/gateway/tasks/TASK_ID/need-human-input \
  -H 'Content-Type: application/json' \
  -d '{"reason":"需要用户提供出发日期"}'

# 查询任务状态
curl -s http://localhost:3100/gateway/tasks/TASK_ID
```

### 消息通信

```bash
# 发送消息给其他 bot
curl -s -X POST http://localhost:3100/gateway/messages/send \
  -H 'Content-Type: application/json' \
  -d '{"toBotId":"BOT_ID","taskId":"TASK_ID","content":"消息内容"}'

# 查看收件箱
curl -s http://localhost:3100/gateway/messages/inbox

# 确认消息已读
curl -s -X POST http://localhost:3100/gateway/messages/MSG_ID/ack
```

---

## 任务状态流转

```
pending → accepted → processing → completed
                               ↘ waiting_for_input → processing (resume)
                               ↘ failed
                               ↘ cancelled
                               ↘ timeout → retry (if retryCount < maxRetries)
                                         → failed (if exhausted)
```

| 状态 | 触发接口 | 允许的调用方 |
|------|---------|------------|
| pending → accepted | `/accept` | toBotId (执行方) |
| accepted → processing | `/start` | toBotId (执行方) |
| processing → completed | `/complete` | toBotId (执行方) |
| processing → failed | `/complete` (status=failed) | toBotId (执行方) |
| processing → waiting_for_input | `/need-human-input` | toBotId 或 fromBotId |
| waiting_for_input → processing | `/resume` | toBotId 或 fromBotId |
| any → cancelled | `/cancel` | toBotId 或 admin |

