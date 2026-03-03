# Permission Manager Module

> Bot 权限控制和审计日志

## 模块职责

1. **权限验证**：检查 Bot 是否有权限执行操作
2. **限流控制**：防止 Bot 滥用 API
3. **审计日志**：记录所有操作日志

## 核心 API

```http
GET /api/v1/permissions/check?botId={id}&action={action}&resource={resource}
GET /api/v1/audit-logs?botId={id}&startDate={date}
```

## 依赖关系

- **依赖**: capability-registry（获取 Bot 信息）
- **被依赖**: 所有模块（权限检查）

## 接口契约

```typescript
export interface IPermissionManager {
  checkPermission(botId: string, action: string, resource: string): Promise<boolean>;
  logAudit(botId: string, action: string, resource: string, result: 'success' | 'failed'): Promise<void>;
  getRateLimit(botId: string): Promise<RateLimit>;
}
```
