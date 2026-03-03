# Task Coordinator Module

> Bot 间任务委托和协调服务

## 模块职责

1. **任务创建**：接收任务委托请求，创建任务记录
2. **任务分发**：将任务推送到目标 Bot 的队列
3. **状态跟踪**：跟踪任务执行状态
4. **超时管理**：检测和处理超时任务
5. **重试机制**：自动重试失败任务
6. **结果聚合**：收集并返回任务结果

## 数据模型

### Tasks 表

```sql
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_bot_id UUID NOT NULL REFERENCES bots(id),
  to_bot_id UUID NOT NULL REFERENCES bots(id),

  capability VARCHAR(255) NOT NULL,
  parameters JSONB NOT NULL,

  status VARCHAR(50) DEFAULT 'pending',
  -- pending, accepted, processing, completed, failed, timeout

  priority VARCHAR(20) DEFAULT 'normal',
  -- low, normal, high, urgent

  result JSONB,
  error JSONB,

  timeout_seconds INT DEFAULT 300,
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 3,

  created_at TIMESTAMP DEFAULT NOW(),
  accepted_at TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,

  -- 上下文
  human_context TEXT,
  conversation_id VARCHAR(255),
  workflow_id UUID REFERENCES workflows(id),

  INDEX idx_to_bot_status (to_bot_id, status),
  INDEX idx_from_bot (from_bot_id, created_at),
  INDEX idx_workflow (workflow_id)
);
```

### Redis 队列结构

```redis
# 任务队列（按优先级分层）
LIST clawteam:tasks:{bot_id}:urgent
LIST clawteam:tasks:{bot_id}:high
LIST clawteam:tasks:{bot_id}:normal
LIST clawteam:tasks:{bot_id}:low

# 处理中任务（ZSET，score 为超时时间戳）
ZSET clawteam:tasks:processing

# 任务详情缓存
HASH clawteam:task:{task_id}
```

## API 接口

### 1. 委托任务

```http
POST /api/v1/tasks/delegate
Content-Type: application/json
Authorization: Bearer <from_bot_api_key>

{
  "toBotId": "lily-bot-uuid",
  "capability": "run_data_query",
  "parameters": {
    "query": "SELECT COUNT(*) FROM users WHERE created_at > '2026-01-01'"
  },
  "priority": "normal",
  "timeoutSeconds": 300,
  "humanContext": "Alice 想知道 1 月新增用户数"
}
```

**响应**：
```json
{
  "success": true,
  "data": {
    "taskId": "task-uuid-001",
    "status": "pending",
    "estimatedCompletion": "2026-02-01T10:05:00Z",
    "trackingUrl": "https://platform/tasks/task-uuid-001"
  }
}
```

### 2. 轮询待处理任务

```http
GET /api/v1/tasks/pending?botId=lily-bot-uuid&limit=10
Authorization: Bearer <lily_bot_api_key>
```

**响应**：
```json
{
  "success": true,
  "data": {
    "tasks": [
      {
        "taskId": "task-uuid-001",
        "fromBot": {
          "id": "alice-bot-uuid",
          "name": "alice_bot"
        },
        "capability": "run_data_query",
        "priority": "normal",
        "parameters": {
          "query": "SELECT ..."
        },
        "createdAt": "2026-02-01T10:00:00Z",
        "timeoutAt": "2026-02-01T10:05:00Z"
      }
    ]
  }
}
```

### 3. 接受任务

```http
POST /api/v1/tasks/{taskId}/accept
Authorization: Bearer <bot_api_key>
```

**响应**：
```json
{
  "success": true,
  "data": {
    "taskId": "task-uuid-001",
    "status": "accepted",
    "acceptedAt": "2026-02-01T10:00:30Z"
  }
}
```

### 4. 完成任务

```http
POST /api/v1/tasks/{taskId}/complete
Content-Type: application/json
Authorization: Bearer <bot_api_key>

{
  "status": "completed",
  "result": {
    "count": 1523,
    "queryTime": "0.42s"
  },
  "executionTimeMs": 2100
}
```

**响应**：
```json
{
  "success": true,
  "data": {
    "taskId": "task-uuid-001",
    "status": "completed",
    "completedAt": "2026-02-01T10:02:00Z",
    "notifiedBots": ["alice-bot-uuid"]
  }
}
```

### 5. 查询任务状态

```http
GET /api/v1/tasks/{taskId}
Authorization: Bearer <bot_api_key>
```

**响应**：
```json
{
  "success": true,
  "data": {
    "taskId": "task-uuid-001",
    "status": "completed",
    "fromBot": {...},
    "toBot": {...},
    "capability": "run_data_query",
    "result": {
      "count": 1523
    },
    "createdAt": "2026-02-01T10:00:00Z",
    "completedAt": "2026-02-01T10:02:00Z"
  }
}
```

## 核心逻辑

### 任务生命周期

```
pending → accepted → processing → completed
                                 ↘ failed
                                 ↘ timeout
```

### 任务分发器

```typescript
export class TaskDispatcher {
  constructor(
    private db: Database,
    private redis: Redis,
    private messageBus: IMessageBus
  ) {}

  async delegate(req: TaskDelegateRequest, fromBotId: string): Promise<Task> {
    // 1. 验证目标 Bot 存在
    const toBot = await this.db.bots.findById(req.toBotId);
    if (!toBot) {
      throw new Error('Target bot not found');
    }

    // 2. 检查权限
    await this.checkPermission(fromBotId, req.toBotId);

    // 3. 创建任务记录
    const task = await this.db.tasks.create({
      fromBotId,
      toBotId: req.toBotId,
      capability: req.capability,
      parameters: req.parameters,
      priority: req.priority || 'normal',
      timeoutSeconds: req.timeoutSeconds || 300,
      humanContext: req.humanContext,
      status: 'pending'
    });

    // 4. 推送到 Redis 队列
    await this.enqueue(task);

    // 5. 通过消息总线通知目标 Bot
    await this.messageBus.publish('task_assigned', {
      taskId: task.id,
      toBotId: req.toBotId
    });

    return task;
  }

  private async enqueue(task: Task): Promise<void> {
    const queueKey = `clawteam:tasks:${task.toBotId}:${task.priority}`;

    // 推送任务 ID 到队列
    await this.redis.rpush(queueKey, task.id);

    // 缓存任务详情
    await this.redis.hset(
      `clawteam:task:${task.id}`,
      'data',
      JSON.stringify(task)
    );

    // 设置过期时间（任务超时时间 + 1小时）
    await this.redis.expire(
      `clawteam:task:${task.id}`,
      task.timeoutSeconds + 3600
    );
  }
}
```

### 任务轮询

```typescript
export class TaskPoller {
  async poll(botId: string, limit: number = 10): Promise<Task[]> {
    // 按优先级顺序轮询队列
    const priorities = ['urgent', 'high', 'normal', 'low'];
    const tasks: Task[] = [];

    for (const priority of priorities) {
      if (tasks.length >= limit) break;

      const queueKey = `clawteam:tasks:${botId}:${priority}`;
      const remaining = limit - tasks.length;

      // BLPOP 阻塞式获取任务（超时 5 秒）
      const taskIds = await this.redis.lpop(queueKey, remaining);

      for (const taskId of taskIds) {
        const taskData = await this.redis.hget(`clawteam:task:${taskId}`, 'data');
        if (taskData) {
          tasks.push(JSON.parse(taskData));
        }
      }
    }

    return tasks;
  }
}
```

### 超时检测器

```typescript
export class TimeoutDetector {
  async run(): Promise<void> {
    // 每分钟运行一次
    setInterval(async () => {
      const now = Date.now();

      // 查询超时任务
      const timeoutTasks = await this.db.tasks.findAll({
        where: {
          status: ['pending', 'accepted', 'processing'],
          createdAt: {
            lt: new Date(now - this.getTimeoutMs())
          }
        }
      });

      for (const task of timeoutTasks) {
        await this.handleTimeout(task);
      }
    }, 60000);
  }

  private async handleTimeout(task: Task): Promise<void> {
    if (task.retryCount < task.maxRetries) {
      // 重试
      await this.retry(task);
    } else {
      // 标记为超时
      await this.db.tasks.update(task.id, {
        status: 'timeout',
        error: {
          code: 'TIMEOUT',
          message: `Task timed out after ${task.timeoutSeconds}s`
        }
      });

      // 通知发起 Bot
      await this.messageBus.publish('task_failed', {
        taskId: task.id,
        fromBotId: task.fromBotId,
        reason: 'timeout'
      });
    }
  }

  private async retry(task: Task): Promise<void> {
    await this.db.tasks.update(task.id, {
      status: 'pending',
      retryCount: task.retryCount + 1
    });

    // 指数退避：2^retry_count 分钟后重试
    const delayMs = Math.pow(2, task.retryCount) * 60000;

    setTimeout(async () => {
      await this.dispatcher.enqueue(task);
    }, delayMs);
  }
}
```

## 依赖关系

### 外部依赖
- PostgreSQL（任务记录）
- Redis（任务队列、缓存）

### 内部依赖
- `capability-registry`：验证 Bot 存在
- `permission-manager`：检查委托权限
- `message-bus`：通知 Bot
- `shared/types`：类型定义

### 被依赖
- `workflow-engine`：工作流步骤执行依赖任务系统

## 开发指南

### 1. Mock 实现

```typescript
export class MockTaskCoordinator implements ITaskCoordinator {
  private tasks: Map<string, Task> = new Map();

  async delegate(req: TaskDelegateRequest, fromBotId: string): Promise<Task> {
    const task: Task = {
      id: `mock-task-${Date.now()}`,
      fromBotId,
      toBotId: req.toBotId,
      capability: req.capability,
      parameters: req.parameters,
      status: 'pending',
      priority: req.priority || 'normal',
      timeoutSeconds: req.timeoutSeconds || 300,
      retryCount: 0,
      maxRetries: 3,
      createdAt: new Date().toISOString()
    };

    this.tasks.set(task.id, task);

    // 模拟异步完成
    setTimeout(() => {
      task.status = 'completed';
      task.result = { mock: true };
      task.completedAt = new Date().toISOString();
    }, 1000);

    return task;
  }

  async poll(botId: string, limit: number): Promise<Task[]> {
    return Array.from(this.tasks.values())
      .filter(t => t.toBotId === botId && t.status === 'pending')
      .slice(0, limit);
  }

  async complete(taskId: string, req: TaskCompleteRequest): Promise<void> {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = req.status === 'completed' ? 'completed' : 'failed';
      task.result = req.result;
      task.error = req.error;
      task.completedAt = new Date().toISOString();
    }
  }

  async getTask(taskId: string): Promise<Task | null> {
    return this.tasks.get(taskId) || null;
  }
}
```

### 2. 接口契约

```typescript
export interface ITaskCoordinator {
  // 任务管理
  delegate(req: TaskDelegateRequest, fromBotId: string): Promise<Task>;
  poll(botId: string, limit: number): Promise<Task[]>;
  accept(taskId: string, botId: string): Promise<void>;
  complete(taskId: string, req: TaskCompleteRequest): Promise<void>;

  // 查询
  getTask(taskId: string): Promise<Task | null>;
  getTasksByBot(botId: string, status?: TaskStatus): Promise<Task[]>;

  // 管理
  cancelTask(taskId: string, reason: string): Promise<void>;
  retryTask(taskId: string): Promise<void>;
}
```

### 3. 测试用例

```typescript
describe('TaskCoordinator', () => {
  it('should create and queue task', async () => {
    const task = await coordinator.delegate({
      toBotId: 'bob-bot',
      capability: 'test',
      parameters: {}
    }, 'alice-bot');

    expect(task.status).toBe('pending');
    expect(task.fromBotId).toBe('alice-bot');
  });

  it('should handle timeout and retry', async () => {
    const task = await coordinator.delegate({
      toBotId: 'bob-bot',
      capability: 'test',
      parameters: {},
      timeoutSeconds: 1  // 1 秒超时
    }, 'alice-bot');

    // 等待超时
    await sleep(2000);

    const updated = await coordinator.getTask(task.id);
    expect(updated.retryCount).toBe(1);
  });
});
```

## 性能考虑

- **队列优化**：使用 Redis List 实现高效队列
- **优先级处理**：高优先级任务优先出队
- **批量轮询**：支持一次获取多个任务
- **超时检测**：后台定时任务，不阻塞主流程
- **并发控制**：限制单个 Bot 的并发任务数

## 待完成功能

- [ ] 任务依赖（Task A 完成后才执行 Task B）
- [ ] 任务广播（同时发给多个 Bot，谁先完成用谁的）
- [ ] 任务取消（发起方主动取消）
- [ ] 任务链（自动将 A 的结果作为 B 的输入）
- [ ] 任务预估（基于历史数据预估完成时间）
