# sessions_spawn 快速测试指南

## 如何执行测试

在 **OpenClaw 主会话**中，复制以下测试命令执行。

---

## 测试 1: 最简单的 spawn 测试

复制以下内容到 OpenClaw：

```
请帮我测试 sessions_spawn 工具。

执行以下操作：
1. 调用 sessions_spawn，参数：
   - task: "请返回文本 'TEST_OK'"
   - label: "quick-test-1"

2. 告诉我完整的返回值，包括：
   - status 字段
   - runId 字段
   - childSessionKey 字段

不要省略任何信息。
```

**预期输出示例：**
```json
{
  "status": "accepted",
  "runId": "run-abc123",
  "childSessionKey": "agent:xxx:subagent:yyy"
}
```

---

## 测试 2: 验证 sessions_list

```
请执行以下步骤：

1. 先调用 sessions_spawn:
   - task: "等待 30 秒后返回 DONE"
   - label: "list-test"

2. 立即调用 sessions_list

3. 告诉我：
   - sessions_spawn 的返回值
   - sessions_list 中是否能看到刚创建的会话
   - 新会话的状态是什么
```

---

## 测试 3: 验证 sessions_send

```
请执行以下步骤：

1. 调用 sessions_spawn:
   - task: "你是一个消息接收器。等待接收消息，收到后回复 'GOT: ' + 消息内容"
   - label: "send-test"

2. 记录返回的 childSessionKey

3. 等待 3 秒

4. 调用 sessions_send:
   - sessionKey: (使用步骤2的 childSessionKey)
   - message: "Hello World"
   - timeoutSeconds: 30

5. 告诉我 sessions_send 的返回结果
```

---

## 测试 4: 模拟 ClawTeam 新任务

```
模拟场景：收到 ClawTeam 新任务

任务数据：
- id: "task-001"
- type: "new"
- capability: "add_numbers"
- parameters: {"a": 5, "b": 3}

因为 type=new，请使用 sessions_spawn 执行：
- task: "执行 ClawTeam 任务 task-001: 计算 5 + 3，返回结果"
- label: "clawteam-task-001"

告诉我：
1. sessions_spawn 的完整返回值
2. childSessionKey 是什么（这个值在真实场景中需要保存到数据库）
```

---

## 测试 5: 模拟 ClawTeam sub-task 任务

**前提：测试 4 已完成，有 childSessionKey**

```
模拟场景：收到 ClawTeam sub-task 任务

任务数据：
- id: "task-002"
- type: "sub-task"
- parentTaskId: "task-001"
- parameters: {"multiplier": 2}

因为 type=sub-task，需要发送到原会话。

假设 task-001 的 childSessionKey 是: [填入测试4的结果]

请调用 sessions_send:
- sessionKey: [填入 childSessionKey]
- message: "追加任务：将之前的结果乘以 2"
- timeoutSeconds: 60

告诉我结果，特别是：
- 是否成功发送
- 原会话是否响应
- 如果失败，错误信息是什么
```

---

## 结果记录表

| 测试 | 执行时间 | status | childSessionKey | 备注 |
|------|----------|--------|-----------------|------|
| 测试1 | | | | |
| 测试2 | | | | |
| 测试3 | | | | |
| 测试4 | | | | |
| 测试5 | | | | |

---

## 关键发现记录

### sessions_spawn 行为
- 是否非阻塞:
- 返回值格式:
- childSessionKey 格式:

### sessions_send 行为
- 是否能发送到子会话:
- 子会话结束后能否发送:
- 超时行为:

### 问题和限制
-
-

---

*快速测试指南 - 2026-02-08*
