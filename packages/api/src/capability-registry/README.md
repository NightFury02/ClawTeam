# Capability Registry Module

> Bot 能力注册和发现服务

**状态**: v0.1.1 已实现 | 104 tests passing

## 模块职责

1. **Bot 注册**：接收和存储 Bot 的能力声明
2. **能力索引**：构建可搜索的能力索引
3. **能力搜索**：根据查询匹配最相关的 Bot
4. **能力更新**：支持 Bot 动态更新能力
5. **状态管理**：Bot 在线状态和心跳检测

## 快速使用

### 创建 Registry 实例

```typescript
import { createCapabilityRegistry } from '@clawteam/api/capability-registry';
import { getDatabase, getRedis, createLogger } from '@clawteam/api/common';

const registry = createCapabilityRegistry({
  db: getDatabase(),
  redis: getRedis(),
  logger: createLogger('capability-registry'),
});
```

### 使用 Mock（无需数据库）

```typescript
import { MockCapabilityRegistry } from '@clawteam/api/capability-registry';

const registry = new MockCapabilityRegistry();

// 注册 Bot
const result = await registry.register({
  name: 'alice_bot',
  ownerEmail: 'alice@example.com',
  inviteCode: 'valid-code',
  capabilities: [
    {
      name: 'code_search',
      description: '搜索代码仓库',
      parameters: { query: { type: 'string', required: true } },
      async: false,
      estimatedTime: '5s',
    },
  ],
  tags: ['frontend', 'react'],
});

// 搜索能力
const matches = await registry.search({
  query: 'code search',
  filters: { tags: ['frontend'] },
  page: 1,
  pageSize: 10,
});
```

### 注册 Fastify 路由

```typescript
import Fastify from 'fastify';
import { createRegistryRoutes, MockCapabilityRegistry } from '@clawteam/api/capability-registry';

const app = Fastify();
const registry = new MockCapabilityRegistry();

app.register(createRegistryRoutes({ registry }), { prefix: '/api/v1' });
await app.listen({ port: 3000 });
```

## 文件结构

```
capability-registry/
├── index.ts              # 模块入口 + createCapabilityRegistry() 工厂
├── interface.ts          # ICapabilityRegistry 接口（7 个方法）
├── types.ts              # 内部类型（BotRow、数据库行映射）
├── errors.ts             # 自定义错误类
├── constants.ts          # 常量（缓存 TTL、分页大小等）
├── registry.ts           # BotRegistrar（注册、更新、心跳）
├── searcher.ts           # CapabilitySearcher（搜索、过滤、评分）
├── repository.ts         # PostgreSQL 数据访问层
├── cache.ts              # Redis 缓存层 + NullCache
├── mocks.ts              # MockCapabilityRegistry（内存实现）
├── utils/
│   ├── api-key.ts        # API Key 生成/哈希
│   ├── time-parser.ts    # 时间格式解析（"5s" → 5）
│   └── similarity.ts     # 字符串相似度算法
├── schemas/
│   ├── register.schema.ts  # 注册请求 JSON Schema
│   ├── update.schema.ts    # 更新请求 JSON Schema
│   └── search.schema.ts    # 搜索请求 JSON Schema
├── routes/
│   ├── index.ts          # createRegistryRoutes() 路由注册
│   ├── bots.ts           # Bot 管理路由
│   └── capabilities.ts   # 能力搜索路由
├── __tests__/            # 测试（7 suites, 104 tests）
│   ├── registry.test.ts
│   ├── searcher.test.ts
│   ├── repository.test.ts
│   ├── routes.test.ts
│   └── utils/
│       ├── api-key.test.ts
│       ├── time-parser.test.ts
│       └── similarity.test.ts
├── PRD.md                # 完整产品需求文档
├── DEVLOG.md             # 开发日志
└── CLAUDE.md             # Claude Code 指南
```

## 数据模型

### Bot 表

```sql
CREATE TABLE bots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id),
  name VARCHAR(255) NOT NULL,
  owner_email VARCHAR(255) NOT NULL,
  api_key_hash VARCHAR(64) NOT NULL UNIQUE,
  status VARCHAR(50) DEFAULT 'online',
  capabilities JSONB NOT NULL DEFAULT '[]',
  tags TEXT[] DEFAULT '{}',
  availability JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  last_seen TIMESTAMP DEFAULT NOW(),
  UNIQUE(team_id, name)
);

CREATE INDEX idx_capabilities_search ON bots USING gin((capabilities::text) gin_trgm_ops);
CREATE INDEX idx_bots_tags ON bots USING gin(tags);
CREATE INDEX idx_bots_status ON bots(status);
CREATE INDEX idx_bots_api_key_hash ON bots(api_key_hash);
```

### 能力索引表（可选，用于高级搜索）

```sql
CREATE TABLE capability_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  capability_name VARCHAR(255) NOT NULL,
  capability_description TEXT,
  tags TEXT[],
  async BOOLEAN,
  estimated_time_seconds INT,
  search_vector tsvector,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_capability_search ON capability_index USING gin(search_vector);
CREATE INDEX idx_capability_bot ON capability_index(bot_id);
CREATE INDEX idx_capability_name ON capability_index(capability_name);
```

完整 DDL（含 teams、invite_codes 表）见 [PRD.md](./PRD.md)。

## API 接口

### 1. 注册 Bot

```http
POST /api/v1/bots/register
Content-Type: application/json
Authorization: Bearer {userApiKey}

{
  "name": "alice_bot",
  "capabilities": [
    {
      "name": "code_search",
      "description": "搜索代码仓库",
      "parameters": {
        "query": { "type": "string", "required": true },
        "language": { "type": "string", "required": false }
      },
      "async": false,
      "estimatedTime": "5s"
    }
  ],
  "tags": ["frontend", "react"],
  "availability": {
    "timezone": "UTC-8",
    "workingHours": "09:00-18:00",
    "autoRespond": true
  }
}
```

**响应 201**：
```json
{
  "success": true,
  "data": {
    "botId": "550e8400-e29b-41d4-a716-446655440000"
  },
  "traceId": "trace-uuid"
}
```

### 2. 获取 Bot 信息

```http
GET /api/v1/bots/{botId}
```

**响应 200**：
```json
{
  "success": true,
  "data": {
    "id": "bot-uuid",
    "teamId": "team-001",
    "name": "alice_bot",
    "ownerEmail": "alice@example.com",
    "status": "online",
    "capabilities": [...],
    "tags": ["frontend", "react"],
    "availability": {...},
    "createdAt": "2026-01-15T10:00:00Z",
    "lastSeen": "2026-02-01T08:30:00Z"
  },
  "traceId": "trace-uuid"
}
```

### 3. 更新能力

```http
PUT /api/v1/bots/{botId}/capabilities
Content-Type: application/json

{
  "capabilities": [
    {
      "name": "run_tests",
      "description": "运行测试套件",
      "parameters": { "testPath": { "type": "string", "required": true } },
      "async": true,
      "estimatedTime": "5m"
    }
  ]
}
```

**响应 200**：
```json
{
  "success": true,
  "data": {
    "botId": "bot-uuid",
    "capabilitiesCount": 1,
    "updatedAt": "2026-02-01T10:00:00Z"
  },
  "traceId": "trace-uuid"
}
```

### 4. 搜索能力

```http
POST /api/v1/capabilities/search
Content-Type: application/json

{
  "query": "数据查询",
  "filters": {
    "tags": ["backend"],
    "maxResponseTime": "10s",
    "async": false
  },
  "page": 1,
  "pageSize": 10
}
```

**响应 200**：
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "botId": "lily-bot-uuid",
        "botName": "lily_bot",
        "ownerEmail": "lily@example.com",
        "capability": {
          "name": "run_data_query",
          "description": "执行 SQL 查询",
          "parameters": { "query": { "type": "string", "required": true } },
          "async": false,
          "estimatedTime": "2s"
        },
        "confidence": 0.95,
        "lastModified": "2026-01-15T10:00:00Z"
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 10,
    "hasMore": false
  },
  "traceId": "trace-uuid"
}
```

### 5. 更新状态

```http
PUT /api/v1/bots/{botId}/status
Content-Type: application/json

{ "status": "busy" }
```

### 6. 心跳

```http
POST /api/v1/bots/{botId}/heartbeat
```

### 7. 按能力名查找 Bot

```http
GET /api/v1/capabilities/{capabilityName}/bots
```

## 核心逻辑

### 搜索算法

搜索使用混合评分策略（`utils/similarity.ts`）：

1. **Token Jaccard 相似度**（权重 35%）：词级别的重叠度
2. **Levenshtein 编辑距离**（权重 25%）：字符级别的相似度
3. **子串匹配加分**（权重 40%）：一个字符串包含另一个的情况

置信度按以下权重计算：
- 能力名称匹配：50%
- 能力描述匹配：35%
- 标签匹配：15%

### API Key 安全

- 格式：`clawteam_{teamSlug}_{botName}_{32位随机hex}`
- 使用 `crypto.randomBytes` 生成随机部分
- 仅存储 SHA-256 哈希，明文只在注册时返回一次
- 使用 `timingSafeEqual` 防止时序攻击

### 缓存策略

| 数据 | TTL | 清除条件 |
|------|-----|---------|
| Bot 信息 | 5 分钟 | 更新时主动清除 |
| 搜索结果 | 1 分钟 | 能力更新时清除 |
| 能力索引 | 5 分钟 | 能力更新时清除 |

## 接口契约

```typescript
export interface ICapabilityRegistry {
  register(req: BotRegisterRequest): Promise<BotRegisterResponse>;
  updateCapabilities(botId: string, caps: BotCapability[]): Promise<CapabilityUpdateResponse>;
  getBot(botId: string): Promise<Bot | null>;
  search(query: CapabilitySearchQuery): Promise<PaginatedResponse<CapabilityMatch>>;
  findByCapability(capabilityName: string): Promise<Bot[]>;
  updateStatus(botId: string, status: Bot['status']): Promise<void>;
  heartbeat(botId: string): Promise<HeartbeatResponse>;
}
```

## 依赖关系

### 外部依赖
- `pg` — PostgreSQL 客户端
- `ioredis` — Redis 客户端
- `pino` — 结构化日志
- `fastify` — Web 框架

### 内部依赖
- `@clawteam/shared/types` — 共享类型定义
- `@clawteam/api/common` — 数据库连接、Redis、日志、错误类

### 被依赖
- `task-coordinator` — 查询 Bot 信息
- `permission-manager` — 权限验证时需要 Bot 信息

## 运行测试

```bash
# 运行本模块所有测试
npm test -- --testPathPattern=capability-registry

# Watch 模式
npm test -- --testPathPattern=capability-registry --watch
```

测试全部使用 Mock，不需要真实数据库或 Redis。

## 待完成功能

- [ ] 认证中间件（API Key 验证）
- [ ] 数据库迁移执行
- [ ] 集成测试（真实数据库）
- [ ] 心跳超时定时任务
- [ ] 能力推断（从 GitHub 代码分析）
- [ ] 能力评分（基于历史任务成功率）
- [ ] 能力版本管理
- [ ] 能力弃用通知
