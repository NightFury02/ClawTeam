# Workflow Engine Module

> 多 Bot 协作工作流编排引擎

## 模块职责

1. **工作流解析**：解析 YAML/JSON 工作流定义
2. **DAG 构建**：构建步骤依赖关系图
3. **并行执行**：管理并行步骤的执行
4. **结果聚合**：收集所有步骤结果

## 核心 API

```http
POST /api/v1/workflows/execute
GET /api/v1/workflows/{id}
POST /api/v1/workflows/{id}/cancel
```

## 依赖关系

- **依赖**: task-coordinator（执行每个步骤）
- **被依赖**: dashboard（展示工作流进度）

## 接口契约

```typescript
export interface IWorkflowEngine {
  execute(req: WorkflowExecuteRequest): Promise<Workflow>;
  getWorkflow(id: string): Promise<Workflow | null>;
  cancelWorkflow(id: string): Promise<void>;
}
```

## Mock 实现

```typescript
export class MockWorkflowEngine {
  async execute(req: WorkflowExecuteRequest): Promise<Workflow> {
    return {
      id: `wf-${Date.now()}`,
      name: typeof req.workflow === 'string' ? req.workflow : req.workflow.name,
      status: 'running',
      results: {},
      createdAt: new Date().toISOString()
    };
  }
}
```
