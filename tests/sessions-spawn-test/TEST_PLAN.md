# sessions_spawn 测试计划

> 目标: 验证 OpenClaw 的 sessions_spawn 工具能否正确触发，以及触发条件和返回值

---

## 测试环境要求

- OpenClaw 已安装并配置
- 有一个可用的 OpenClaw agent

---

## 测试 1: 基础 sessions_spawn 调用

### 目标
验证 sessions_spawn 的基本调用是否成功

### 测试步骤

在 OpenClaw 主会话中，让 agent 执行以下操作：

```
请调用 sessions_spawn 工具，参数如下：
- task: "这是一个测试任务，请返回 'Hello from subagent'"
- label: "test-spawn-001"

然后告诉我返回结果是什么。
```

### 预期结果

```json
{
  "status": "accepted",
  "runId": "run-xxx-xxx",
  "childSessionKey": "agent:<agentId>:subagent:<uuid>"
}
```

### 验证点
- [ ] status 是否为 "accepted"
- [ ] 是否返回 runId
- [ ] 是否返回 childSessionKey
- [ ] childSessionKey 格式是否正确

---

## 测试 2: sessions_spawn 参数验证

### 目标
验证不同参数组合的行为

### 测试 2.1: 仅 task 参数

```
请调用 sessions_spawn，只传 task 参数：
- task: "简单测试任务"
```

### 测试 2.2: task + label 参数

```
请调用 sessions_spawn：
- task: "带标签的测试任务"
- label: "my-custom-label"
```

### 测试 2.3: 完整参数

```
请调用 sessions_spawn：
- task: "完整参数测试"
- label: "full-params-test"
- runTimeoutSeconds: 60
```

### 验证点
- [ ] 各参数组合是否都能成功
- [ ] label 是否影响 childSessionKey
- [ ] timeout 是否生效

---

## 测试 3: sessions_list 验证子会话

### 目标
验证 spawn 的子会话是否出现在 sessions_list 中

### 测试步骤

1. 先调用 sessions_spawn 创建子会话
2. 立即调用 sessions_list 查看会话列表

```
1. 请先调用 sessions_spawn:
   - task: "测试任务，等待 30 秒后返回"
   - label: "list-test-001"

2. 然后立即调用 sessions_list，告诉我结果
```

### 预期结果

sessions_list 应该显示新创建的子会话

### 验证点
- [ ] 子会话是否出现在列表中
- [ ] 会话状态是什么
- [ ] label 是否正确显示

---

## 测试 4: sessions_send 向子会话发送消息

### 目标
验证能否通过 sessions_send 向已存在的子会话发送消息

### 测试步骤

```
1. 先调用 sessions_spawn:
   - task: "请等待接收消息，收到消息后回复 'Message received: ' + 消息内容"
   - label: "send-test-001"

2. 记录返回的 childSessionKey

3. 等待 5 秒

4. 调用 sessions_send:
   - sessionKey: <上面返回的 childSessionKey>
   - message: "这是追加消息"
   - timeoutSeconds: 30

5. 告诉我 sessions_send 的返回结果
```

### 验证点
- [ ] sessions_send 是否成功
- [ ] 子会话是否收到消息
- [ ] 返回结果是什么

---

## 测试 5: 模拟 ClawTeam 场景

### 目标
模拟 ClawTeam 任务执行场景，验证完整流程

### 测试步骤

```
模拟场景：你收到一个 ClawTeam 新任务

任务信息：
{
  "id": "test-task-001",
  "type": "new",
  "capability": "echo_test",
  "parameters": {"message": "Hello ClawTeam"}
}

请按照以下步骤执行：

1. 因为 type=new，使用 sessions_spawn 创建隔离会话：
   - task: "执行 ClawTeam 任务 test-task-001: 返回参数中的 message"
   - label: "clawteam-task-test-task-001"

2. 记录返回的 childSessionKey

3. 告诉我完整的执行过程和结果
```

### 验证点
- [ ] sessions_spawn 是否成功触发
- [ ] 子会话是否正确执行任务
- [ ] childSessionKey 是否可用于后续 sessions_send

---

## 测试 6: Sub-task 任务场景

### 目标
验证 sub-task 任务能否通过 sessions_send 发送到原会话

### 前置条件
测试 5 已完成，有一个活跃的子会话

### 测试步骤

```
模拟场景：你收到一个 ClawTeam sub-task 任务

任务信息：
{
  "id": "test-task-002",
  "type": "sub-task",
  "parentTaskId": "test-task-001",
  "capability": "echo_test",
  "parameters": {"message": "This is sub-task"}
}

假设 test-task-001 的 childSessionKey 是: <从测试5获取>

请执行：
1. 因为 type=sub-task，使用 sessions_send 发送到原会话
2. 调用 sessions_send:
   - sessionKey: <test-task-001 的 childSessionKey>
   - message: "Sub-task 任务: 请处理追加消息 'This is sub-task'"
   - timeoutSeconds: 60

3. 告诉我结果
```

### 验证点
- [ ] sessions_send 是否成功
- [ ] 原会话是否收到并处理消息
- [ ] 如果会话已结束，错误信息是什么

---

## 测试结果记录模板

| 测试 | 状态 | 返回值 | 备注 |
|------|------|--------|------|
| 测试 1 | | | |
| 测试 2.1 | | | |
| 测试 2.2 | | | |
| 测试 2.3 | | | |
| 测试 3 | | | |
| 测试 4 | | | |
| 测试 5 | | | |
| 测试 6 | | | |

---

## 关键问题待验证

1. **sessions_spawn 是否真的非阻塞？**
   - 调用后是否立即返回
   - 子会话是否在后台执行

2. **childSessionKey 的生命周期？**
   - 子会话完成后 key 是否还有效
   - 能否向已完成的会话发送消息

3. **sessions_send 的行为？**
   - 同步还是异步
   - 超时后会发生什么

4. **错误处理？**
   - 无效 sessionKey 会怎样
   - 子会话崩溃会怎样

---

*测试计划创建时间: 2026-02-08*
