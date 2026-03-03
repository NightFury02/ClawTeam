# Dashboard 手动创建任务

> 我是一个 Task。这是人类操作员通过 Dashboard 手动创建我的过程。

## 触发

人类操作员在 Dashboard 点击 "Create Task" 按钮，打开 `CreateTaskModal`。

## 意图委托 (Intent Delegate)

操作员填写目标 Bot、Prompt 等信息，由 Agent 自主 spawn 子会话执行委托。

```
Dashboard (CreateTaskModal)
  │
  │ 1. 选择 From Bot（来源：me.ownedBots）
  │ 2. 选择 To Bot（来源：在线 Bot 列表）
  │ 3. 输入 Prompt（自然语言任务描述）
  │ 4. 可选：Capability、Priority
  │
  │ POST /router-api/delegate-intent
  │ Body: { fromBotId, intentText }
  ▼
┌─────────────────────────────────────────────────────────┐
│ Router API — POST /delegate-intent                      │
│ 📁 packages/clawteam-gateway/src/server/router-api.ts   │
│                                                         │
│ 1. 构造结构化消息（含 SPAWN_RESULT 追踪指令）            │
│ 2. sendToMainSession(message)                           │
└─────────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────────┐
│ Agent (Main Session)                                    │
│                                                         │
│ 收到 [ClawTeam Delegate Intent] 后：                    │
│ 1. sessions_spawn → 创建子会话                          │
│ 2. 输出 SPAWN_RESULT JSON（供 Router 追踪映射）          │
└─────────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────────┐
│ Sub-session                                             │
│ 📁 packages/openclaw-skill/SKILL.md                     │
│                                                         │
│ 1. curl POST /gateway/delegate (fromBotId, toBotId,    │
│    prompt, priority)                                    │
│ 2. 报告 task ID → done                                 │
└─────────────────────────────────────────────────────────┘
```

### 鉴权

- 不需要 API key（Router API 不做 Bot 鉴权，Gateway 代理端点自带认证）
- 只需要 `fromBotId`（操作员选择）

### 反馈

- 前端立即返回"已提交"
- 操作员通过 Dashboard 任务列表追踪 Agent 创建的任务

## 涉及模块

| 模块 | 角色 | 关键文件 |
|------|------|---------|
| Dashboard | 任务创建 UI | `packages/dashboard/src/components/CreateTaskModal.tsx` |
| Dashboard | Router API 客户端 | `packages/dashboard/src/lib/router-api.ts` |
| Router API | 转发 intent 到 Agent | `packages/clawteam-gateway/src/server/router-api.ts` |
| SKILL.md | Agent 自主处理指引 | `packages/openclaw-skill/SKILL.md` |

## 状态变化

```
无 → (Agent spawn 子会话 → 子会话 curl /gateway/delegate) → pending
```

## 与 DELEGATE.md 的关系

[DELEGATE.md](./DELEGATE.md) 描述的是 Bot 程序化创建任务的通用流程。本文档描述的是人类通过 Dashboard UI 触发同一流程。最终由子会话通过 Gateway curl 端点 `POST /gateway/delegate` 创建任务。
