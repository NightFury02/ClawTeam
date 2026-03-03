# Session 管理

> OpenClaw Session 架构、生命周期与追踪机制

## 1. Session 架构

```
OpenClaw Agent
├── Main Session (agent:main:main)
│   ├── 接收 [ClawTeam Task Received] 消息
│   ├── 分析任务参数
│   └── Spawn 子 session 执行任务
│
├── Sub-Session 1 (agent:main:subagent:<uuid>)
│   ├── Accept → Start → Execute → Complete
│   └── 对话历史: conversation.jsonl
│
├── Sub-Session 2 (agent:main:subagent:<uuid>)
│   └── ...
└── ...
```

## 2. Session Key 格式

| 格式 | 示例 | 说明 |
|------|------|------|
| `agent:<agentId>:main` | `agent:main:main` | 主 session |
| `agent:<agentId>:subagent:<uuid>` | `agent:main:subagent:a1b2c3d4` | 子 session |

**注意：** API 中的 `executorSessionKey` 可能是原始 UUID（如 `a4b62ffb-a0a5-...`），而非 session key 格式。这是因为子 session 在 accept 时写入的是 OpenClaw 的 session ID，不是 session key。Recovery loop 通过 `resolveSessionKeyFromId()` 做反向解析。

## 3. Session 生命周期

```
创建 (spawn) → 活跃 (active/tool_calling) → 空闲 (idle) → 死亡 (dead)
                     ↕                           │
                  等待 (waiting)                  ↓
                                            完成 (completed)
```

### 状态定义

| 状态 | 含义 | JSONL 特征 |
|------|------|-----------|
| `active` | 正在生成回复 | lastRole=assistant, stopReason=toolUse |
| `tool_calling` | 正在执行工具 | lastRole=toolResult |
| `waiting` | 等待用户输入 | lastRole=user |
| `idle` | 已停止生成 | lastRole=assistant, stopReason=stop |
| `errored` | 发生错误 | 包含错误消息 |
| `completed` | session 已结束 | session 目录存在但进程已退出 |
| `dead` | session 不存在 | isSessionAlive() 返回 false |
| `unknown` | 无法判定 | JSONL 为空或不可读 |

## 4. Session 状态检测

### 4.1 isSessionAlive()

通过 OpenClaw CLI 检查 session 进程是否存在：
```bash
openclaw session status --key "agent:main:subagent:xxx"
```

### 4.2 JSONL 分析

读取 `~/.openclaw/agents/<agentId>/sessions/<sessionId>/conversation.jsonl` 的最后几行：

```typescript
interface JsonlAnalysis {
  lastMessageRole: 'user' | 'assistant' | 'toolResult' | null;
  lastStopReason: 'stop' | 'toolUse' | 'error' | null;
  lastErrorMessage: string | null;
  toolCallCount: number;
  messageCount: number;
  model: string | null;
  provider: string | null;
}
```

## 5. SessionTracker

内存中的双向映射，追踪哪个 session 处理哪个任务：

```
taskId ←→ sessionKey
```

### Track 时机

| 场景 | 触发 |
|------|------|
| sub-task 路由成功 | `router.sendToSession()` |
| syncUntrackedTasks 发现有 executorSessionKey | `recoveryLoop.tick()` 开始时 |
| syncUntrackedTasks 发现 stale pending 任务 | 同上 |

### Untrack 时机

| 场景 | 触发 |
|------|------|
| Recovery fallback 到 main | `recoveryLoop.handleDeadSession()` |
| API reset 成功 | 同上 |
| 任务完成 (API 查询确认) | `recoveryLoop.processTaskStatus()` |

### 注意

`sendToMain()` (new 任务) **不会** track。因为 main session 会 spawn 子 session，子 session 在 accept 时通过 API 设置 `executorSessionKey`。Recovery loop 通过 `syncUntrackedTasks()` 从 API 补录。

## 6. UUID 解析

子 session accept 时写入 API 的 `executorSessionKey` 可能是原始 UUID。

**解析流程：**
```
executorSessionKey = "a4b62ffb-a0a5-4c87-..."
                          │
                          ▼
                  是否以 "agent:" 开头?
                  ├─ 是 → 直接使用
                  └─ 否 → resolveSessionKeyFromId()
                           │
                           ▼
                    扫描 sessions.json
                    ~/.openclaw/agents/<agentId>/sessions/sessions.json
                    查找 sessionId === UUID 的 entry
                    返回对应的 session key
```

## 7. 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| Cannot parse agentId | executorSessionKey 是 UUID 不是 session key | resolveSessionKeyFromId() 解析 |
| Session always dead | OpenClaw CLI 不在 PATH 中 | 检查 openclaw.bin 配置 |
| Task stuck in processing | Sub-session idle 但未 complete | Recovery loop nudge |
| Main session 忽略 fallback | 消息格式与正常任务不同 | 使用 API reset + 正常路由 |
