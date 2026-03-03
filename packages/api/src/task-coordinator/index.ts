/**
 * Task Coordinator Module
 *
 * Bot 间任务委托和协调服务
 *
 * @module task-coordinator
 */

// Interface
export type {
  ITaskCoordinator,
  TaskQueryOptions,
  TaskDelegateResponse,
} from './interface';

// Types
export type { TaskRow, TaskCreateInput } from './types';
export { taskRowToTask } from './types';

// Errors
export {
  CoordinatorError,
  TaskNotFoundError,
  TaskAlreadyAcceptedError,
  UnauthorizedTaskError,
  QueueFullError,
  InvalidApiKeyError,
  InvalidTaskStateError,
} from './errors';

// Constants
export * from './constants';

// Core logic
export { TaskDispatcher, type TaskDispatcherDeps } from './dispatcher';
export { TaskPoller, type TaskPollerDeps } from './poller';
export { TaskCompleter, type TaskCompleterDeps } from './completer';
export { TimeoutDetector, type TimeoutDetectorDeps } from './timeout-detector';

// Impl
export { TaskCoordinatorImpl, type TaskCoordinatorImplDeps } from './coordinator-impl';

// Mock implementation
export { MockTaskCoordinator } from './mocks';

// Middleware
export { createAuthMiddleware } from './middleware/auth';

// Routes
export { createTaskRoutes, type TaskRoutesDeps } from './routes';
export { createMetricsRoute } from './routes/metrics';
export { createHealthRoute, type HealthCheckDeps } from './routes/health';

// Metrics
export * from './metrics';

// Factory function
import type { DatabasePool, RedisClient, Logger } from '@clawteam/api/common';
import type { ICapabilityRegistry } from '@clawteam/api/capability-registry';
import type { IMessageBus } from '@clawteam/api/message-bus';
import type { ITaskCoordinator } from './interface';
import { MockTaskCoordinator } from './mocks';
import { TaskCoordinatorImpl } from './coordinator-impl';
import { TaskDispatcher } from './dispatcher';
import { TaskPoller } from './poller';
import { TaskCompleter } from './completer';
import { TimeoutDetector } from './timeout-detector';

/**
 * Options for creating a task coordinator.
 *
 * - `useMock: true` returns a MockTaskCoordinator (for unit tests, no infra needed).
 * - Otherwise all infra fields (db, redis, registry, messageBus, logger) are required.
 */
export type CreateCoordinatorOptions =
  | { useMock: true }
  | {
      useMock?: false;
      db: DatabasePool;
      redis: RedisClient;
      registry: ICapabilityRegistry;
      messageBus: IMessageBus;
      logger: Logger;
    };

/**
 * Create a task coordinator instance.
 *
 * **Mock mode** (unit tests):
 * ```typescript
 * const coordinator = createTaskCoordinator({ useMock: true });
 * ```
 *
 * **Real mode** (with injected or default dependencies):
 * ```typescript
 * import { createCapabilityRegistry } from '@clawteam/api/capability-registry';
 * import { MockMessageBus } from '@clawteam/api/message-bus';
 * import { getDatabase, getRedis, createLogger } from '@clawteam/api/common';
 *
 * const coordinator = createTaskCoordinator({
 *   db: getDatabase(),
 *   redis: getRedis(),
 *   registry: createCapabilityRegistry({ db, redis, logger }),
 *   messageBus: new MockMessageBus(),
 *   logger: createLogger('task-coordinator'),
 * });
 * ```
 */
export function createTaskCoordinator(options: CreateCoordinatorOptions): ITaskCoordinator & { timeoutDetector?: TimeoutDetector } {
  // Mock mode — no infrastructure required
  if (options.useMock === true) {
    return new MockTaskCoordinator();
  }

  // Real mode — assemble from core components
  const { db, redis, registry, messageBus, logger } = options;

  const dispatcher = new TaskDispatcher({ db, redis, registry, messageBus, logger });
  const poller = new TaskPoller({ db, redis, registry, logger });
  const completer = new TaskCompleter({ db, redis, messageBus, logger });
  const timeoutDetector = new TimeoutDetector({ db, redis, messageBus, logger });

  return new TaskCoordinatorImpl({
    db,
    redis,
    logger,
    dispatcher,
    poller,
    completer,
    timeoutDetector,
  });
}
