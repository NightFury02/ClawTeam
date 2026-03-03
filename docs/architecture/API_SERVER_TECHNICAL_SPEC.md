# API Server 技术说明

> 面向架构师和程序员的 @clawteam/api 技术参考
>
> 更新日期: 2026-02-14 | 基于源码分析

---

## 1. 服务启动与依赖注入

API Server 采用手动依赖注入模式，在 `bootstrap.ts` 中完成所有模块的初始化和组装。

```
server.ts (入口)
  → bootstrap.ts::createServer()
    → initInfrastructure()     # PostgreSQL + Redis 连接
    → initServices()           # CapabilityRegistry 实例化
    → Fastify 实例创建
    → CORS 注册
    → MessageBus 插件注册      # WebSocket + Redis Pub/Sub
    → TaskCoordinator 实例化   # 依赖 Registry + MessageBus
    → PrimitiveService 实例化  # 依赖 Registry + MessageBus + Coordinator
    → 路由注册
    → 全局错误处理器
```

依赖图：

```
PostgreSQL ←── CapabilityRegistry ──→ Redis (缓存)
                    │
                    ├──→ TaskCoordinator ──→ Redis (队列)
                    │         │
                    │         ├──→ MessageBus ──→ Redis (Pub/Sub)
                    │         │
                    ▼         ▼
              PrimitiveService (聚合 L0-L3)
```

`AppContext` 对象通过 `server.decorate('context', context)` 注入到 Fastify 实例，所有路由可通过 `fastify.context` 访问。但实际路由使用的是闭包捕获的模块实例，而非 context 装饰器。

---

## 2. 认证体系

### 2.1 双轨认证

系统同时支持两种认证方式，通过 `getBotId()` 函数统一提取：

```typescript
function getBotId(request: FastifyRequest): string {
  // 优先级 1: Auth middleware 注入的 bot 对象 (Bearer / x-api-key)
  if (request.bot?.id) return request.bot.id;
  // 优先级 2: X-Bot-Id header (Phase 1 兼容)
  const headerBotId = request.headers['x-bot-id'];
  // 优先级 3: botId query param (Phase 1 兼容)
  const queryBotId = (request.query as any).botId;
}
```

### 2.2 Auth Middleware 实现

```
createAuthMiddleware(registry: ICapabilityRegistry)
  → 提取 Authorization header 或 x-api-key header
  → registry.validateApiKey(apiKey)
    → SHA-256(apiKey) → 查询 bots 表 WHERE api_key_hash = ?
  → 匹配: request.bot = bot 对象
  → 不匹配: throw AuthenticationError (401)
```

Auth middleware 是可选的。当 `registry` 未传入 `createTaskRoutes()` 时，`authPreHandlers` 为空数组，所有端点退化为无认证模式（Phase 1 兼容）。

### 2.3 WebSocket 认证

三级优先级：

| 优先级 | 条件 | 认证方式 |
|--------|------|---------|
| 1 | `options.registry` 存在 | `registry.validateApiKey(apiKey)` → botId 从 Bot 对象获取 |
| 2 | `options.validateApiKey` 回调存在 | 回调验证 → botId 从 query param 获取 |
| 3 | 都不存在 | 开发模式，botId 直接从 query param 获取 |

### 2.4 端点认证矩阵

| 端点 | 认证 | 说明 |
|------|------|------|
| `POST /bots/register` | ❌ | 注册时无 API Key |
| `GET /bots` | ❌ | 公开列表 |
| `GET /bots/me` | ✅ Bearer | 返回当前 bot + 同 owner 的所有 bot |
| `GET /bots/:id` | ❌ | 公开查询（隐藏 apiKeyHash） |
| `PUT /bots/:id/capabilities` | ✅ Bearer | 仅 bot 自身可更新 |
| `PUT /bots/:id/status` | ✅ Bearer | 仅 bot 自身可更新 |
| `POST /bots/:id/heartbeat` | ✅ Bearer | 仅 bot 自身可调用 |
| `POST /capabilities/search` | ❌ | 公开搜索 |
| `GET /capabilities/:name/bots` | ❌ | 公开查询 |
| `POST /tasks/delegate` | ✅ Bearer | fromBotId 从认证上下文获取 |
| `GET /tasks/pending` | ✅ Bearer | 仅返回 toBotId 匹配的任务 |
| `POST /tasks/:id/accept` | ✅ Bearer | 仅 toBotId 可操作 |
| `POST /tasks/:id/start` | ✅ Bearer | 仅 toBotId 可操作 |
| `POST /tasks/:id/complete` | ✅ Bearer | 仅 toBotId 可操作 |
| `POST /tasks/:id/cancel` | ✅ Bearer | 仅 fromBotId 可操作 |
| `POST /tasks/:id/reset` | ✅ Bearer | 恢复用 |
| `POST /tasks/:id/heartbeat` | ✅ Bearer | Router 心跳上报 |
| `GET /tasks/:id` | ✅ Bearer | 仅相关方可查看 |
| `GET /tasks` | ✅ Bearer | 仅返回与认证 bot 相关的任务 |
| `GET /tasks/all` | ❌ | Dashboard 全量查询（无鉴权） |
| `POST /tasks/all/:id/cancel` | ❌ | Dashboard 管理取消（无鉴权） |

---

## 3. Capability Registry 技术细节

### 3.1 注册流程

```
POST /api/v1/bots/register
  Body: { name, ownerEmail, capabilities[], tags[], userId, userName, clientType }

  → JSON Schema 验证 (register.schema.ts)
  → BotRegistrar.register()
    → 生成 botId (UUID v4)
    → 生成 API Key: `${teamSlug}-${botName}-${randomHex(16)}`
    → SHA-256 哈希 API Key
    → 生成 avatar 颜色 (基于 botId 的确定性颜色)
    → INSERT INTO bots (...)
    → 返回 { botId, apiKey } (apiKey 仅此一次明文返回)
```

### 3.2 搜索引擎（待完善，商用功能）

`CapabilitySearcher` 使用混合评分策略：

```
搜索流程:
  1. PostgreSQL pg_trgm 扩展 → similarity(capability_name, query)
  2. GIN 索引加速 JSONB 数组搜索
  3. 应用过滤器: tags, maxResponseTime, async
  4. 自定义相似度算法: Jaccard + Levenshtein 混合评分
  5. 按 confidence 降序排列
  6. 分页返回 PaginatedResponse<CapabilityMatch>
```

`CapabilityMatch` 结构：
```typescript
{
  botId: string;
  botName: string;
  capability: { name, description, parameters, async, estimatedTime };
  confidence: number;  // 0-1 相似度分数
  botStatus: string;
}
```

### 3.3 缓存策略

```
Redis 缓存层 (cache.ts):
  - Bot 信息缓存: key = `clawteam:bot:{botId}`, TTL = 5min
  - 搜索结果缓存: key = `clawteam:search:{queryHash}`, TTL = 1min
  - 降级: Redis 不可用时使用 NullCache (直接穿透到 DB)
```

---

## 4. Task Coordinator 技术细节

### 4.1 组件架构

```
TaskCoordinator (coordinator-impl.ts)
  ├── TaskDispatcher (dispatcher.ts)
  │     → 创建任务 → 写 PostgreSQL → 入 Redis 队列 → 发布事件
  ├── TaskPoller (poller.ts)
  │     → 按优先级从 Redis 队列读取 → 返回排序后的任务列表
  ├── TaskCompleter (completer.ts)
  │     → accept/start/complete/cancel/reset 状态转换
  │     → 严格前置状态校验 → 更新 DB + Redis → 发布事件
  └── TimeoutDetector (timeout-detector.ts)
        → 定时扫描 Redis ZSET → 检测超时 → 自动重试或标记失败
```

### 4.2 Redis 数据结构

```
# 优先级队列 (每个 bot 4 个 LIST)
LIST  clawteam:tasks:{toBotId}:urgent
LIST  clawteam:tasks:{toBotId}:high
LIST  clawteam:tasks:{toBotId}:normal
LIST  clawteam:tasks:{toBotId}:low

# 处理中任务 (全局 ZSET, score = 超时时间戳)
ZSET  clawteam:tasks:processing
      member = taskId
      score  = Date.now() + timeoutSeconds * 1000

# 任务详情缓存 (HASH)
HASH  clawteam:task:{taskId}
      TTL = timeoutSeconds + 3600
```

### 4.3 任务委派流程 (delegate)

```
POST /api/v1/tasks/delegate
  Body: { toBotId, capability, parameters, priority, timeoutSeconds, humanContext, type, parentTaskId, senderSessionKey }

  → Auth middleware → fromBotId
  → TaskDispatcher.dispatch()
    → 验证 toBotId 存在 (registry.getBot)
    → 生成 taskId (UUID v4)
    → INSERT INTO tasks (status='pending', ...)
    → RPUSH clawteam:tasks:{toBotId}:{priority} taskId
    → HSET clawteam:task:{taskId} (缓存任务详情)
    → messageBus.publish('task_assigned', { taskId, fromBotId, toBotId, capability })
  → 返回 201 { taskId, status, estimatedCompletion, trackingUrl }
```

### 4.4 任务轮询流程 (poll)

```
GET /api/v1/tasks/pending?limit=10

  → Auth middleware → botId (toBotId)
  → TaskPoller.poll(botId, limit)
    → 按优先级顺序 LRANGE 每个队列
    → urgent → high → normal → low
    → 合并结果，截取 limit 条
    → 对每个 taskId: HGETALL clawteam:task:{taskId} 获取详情
    → 如果缓存 miss: SELECT FROM tasks WHERE id = ?
  → 返回 { tasks[], hasMore }
```

### 4.5 Dashboard 管理端点

两个无鉴权的管理端点，供 Dashboard 使用：

```
GET /api/v1/tasks/all
  → 直接 SQL: SELECT ... FROM tasks ORDER BY created_at DESC LIMIT 100
  → 返回原始任务数组（非 ApiResponse 包装）

POST /api/v1/tasks/all/:taskId/cancel
  → 直接 SQL: UPDATE tasks SET status='cancelled' WHERE id=? AND status IN (...)
  → 清理 Redis: 从优先级队列移除 + 从 processing ZSET 移除 + 删除缓存
  → 返回 { success, taskId, status }
```

⚠️ 这两个端点无鉴权，仅适用于内网/本地部署。

### 4.6 心跳端点

```
POST /api/v1/tasks/:taskId/heartbeat
  Body: { sessionKey, sessionStatus, lastActivityAt, details }

  → 直接 SQL: UPDATE tasks SET last_heartbeat_at=NOW(), session_status=?, heartbeat_details=? WHERE id=?
  → 返回 { taskId, sessionStatus, receivedAt }
```

此端点由 ClawTeam Gateway 的 HeartbeatLoop 定期调用，用于上报 OpenClaw session 的健康状态。

---

## 5. Message Bus 技术细节

### 5.1 Fastify 插件注册

Message Bus 作为 Fastify 插件注册，自动挂载 `/ws` 和 `/health` 端点：

```typescript
// bootstrap.ts
await server.register(messageBusPlugin, {
  redis: config.redis,
  registry,  // 传入 registry 启用 API Key 认证
});
const messageBus = (server as any).messageBus as IMessageBus;
```

### 5.2 WebSocket 连接生命周期

```
客户端连接 ws://host:3000/ws?apiKey=xxx
  → 认证 (registry.validateApiKey)
  → WebSocketManager.addConnection(botId, socket)
  → 发送 welcome 消息 { type: 'bot_status_changed', payload: { status: 'online' } }
  → 监听 message 事件
    → status_update: messageBus.updateBotStatus()
    → ack: messageBus.acknowledgeMessage()
  → 监听 close 事件
    → 清理连接
```

### 5.3 事件发布流程

```
messageBus.publish(event, payload, targetBotId?)
  │
  ├── targetBotId 指定 → 仅推送给该 bot 的 WebSocket
  │
  └── targetBotId 未指定 → 广播给所有连接的 bot
  │
  └── Redis Pub/Sub 发布到对应频道 (跨实例分发)
```

### 5.4 健康检查

```
GET /health
  → 检查 Redis Pub/Sub 连接状态
  → 统计 WebSocket 活跃连接数
  → 返回 { status, checks: { redis, websocket }, uptime, memory }
```

---

## 6. 全局错误处理

### 6.1 错误类层次

```
ClawTeamError (base)
  ├── AuthenticationError (401)
  ├── AuthorizationError (403)
  ├── NotFoundError (404)
  ├── ConflictError (409)
  ├── ValidationError (400)
  └── InternalError (500)

模块级错误:
  CapabilityRegistry:
    ├── BotNotFoundError
    ├── DuplicateBotError
    └── InvalidApiKeyError

  TaskCoordinator:
    ├── TaskNotFoundError
    ├── InvalidTaskStateError (409)
    └── UnauthorizedTaskOperationError
```

### 6.2 标准错误响应

```json
{
  "success": false,
  "error": {
    "code": "TASK_NOT_FOUND",
    "message": "Task not found: abc-123",
    "details": {}
  },
  "traceId": "uuid-v4"
}
```

全局错误处理器在 `bootstrap.ts` 中注册，自动将 `ClawTeamError` 转换为对应 HTTP 状态码。各模块路由也有自己的 `setErrorHandler`，处理 preHandler（认证中间件）抛出的错误。

---

## 7. API 响应格式

### 7.1 标准成功响应

```typescript
interface ApiResponse<T> {
  success: true;
  data: T;
  traceId: string;
  timestamp?: string;
}
```

### 7.2 分页响应

```typescript
interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
```

### 7.3 不一致之处

⚠️ 部分端点的响应格式不统一：

| 端点 | 响应格式 | 说明 |
|------|---------|------|
| `GET /api/v1/bots` | 裸数组 `Bot[]` | 未包装 ApiResponse |
| `GET /api/v1/tasks/all` | 裸数组 `Task[]` | 未包装 ApiResponse |
| 其他端点 | `ApiResponse<T>` | 标准格式 |

---

## 8. 数据库迁移

迁移脚本位于 `packages/api/scripts/`，使用自定义迁移工具：

```bash
npm run migrate:up     # 执行所有待应用的迁移
npm run migrate:down   # 回滚最后一次迁移
npm run migrate:create # 创建新迁移文件
```

核心表：`bots`, `tasks`, `teams`, `users`
索引：GIN 索引 (JSONB capabilities)、pg_trgm 索引 (模糊搜索)

---

## 9. 部署配置

### 9.1 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DATABASE_URL` | - | PostgreSQL 连接字符串 |
| `REDIS_URL` | `redis://localhost:6379` | Redis 连接字符串 |
| `PORT` / `API_PORT` | `3000` | HTTP 端口 |
| `API_HOST` | `0.0.0.0` | 监听地址 |
| `LOG_LEVEL` | `info` | Pino 日志级别 |
| `USE_MOCK` | `false` | 使用 Mock 实现（开发用） |
| `TIMEOUT_CHECK_INTERVAL_MS` | `60000` | 超时检测间隔 |
| `DEFAULT_TASK_TIMEOUT_SECONDS` | `3600` | 默认任务超时 |
| `DEFAULT_MAX_RETRIES` | `3` | 默认最大重试次数 |

### 9.2 Docker Compose

```bash
# 基础设施
docker compose up postgres redis -d

# API Server (production profile)
docker compose --profile production up -d --build api
```

### 9.3 优雅关闭

`shutdown()` 函数按顺序关闭：Fastify server → PostgreSQL pool → Redis client。

---

## 10. 测试

| 模块 | 测试套件 | 测试数 | 覆盖率 |
|------|---------|--------|--------|
| capability-registry | 7 | 104 | ~100% |
| task-coordinator | 6 | 94 | >80% |
| message-bus | 11 | ~118 | ~83% |
| primitives | - | 待编写 | - |

```bash
npm test                                            # 全部测试
npm test -- --testPathPattern=capability-registry   # 单模块
npm test -- --testPathPattern=task-coordinator
npm test -- --testPathPattern=message-bus
npm run test:coverage                               # 覆盖率报告
```

---

## 11. 已知限制与技术债

| 问题 | 影响 | 优先级 |
|------|------|--------|
| Dashboard admin 端点无鉴权 | `/tasks/all/*` 可被任意访问 | 高 |
| 部分端点响应格式不统一 | `GET /bots` 和 `GET /tasks/all` 返回裸数组 | 中 |
| 原语模块无 REST API 暴露 | PrimitiveService 已实例化但无路由 | 中 |
| 无 rate limiting | 可被暴力请求 | 中 |
| 单实例部署 | Redis 队列支持多实例，但缺少分布式锁 | 低 |
| Message Bus 部分特性未完成 | 离线队列、消息持久化等为框架代码 | 低 |
| TypeScript 编译警告 | `router-api.ts` 存在 TS2783 | 低 |
