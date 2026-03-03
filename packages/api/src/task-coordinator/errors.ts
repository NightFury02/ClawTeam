/**
 * Task Coordinator Error Definitions
 */

import { ClawTeamError } from '@clawteam/api/common';

/**
 * Base error for task coordinator operations
 */
export class CoordinatorError extends ClawTeamError {
  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    details?: Record<string, unknown>
  ) {
    super(message, code, statusCode, details);
    this.name = 'CoordinatorError';
  }
}

/**
 * Task not found (404)
 */
export class TaskNotFoundError extends CoordinatorError {
  constructor(taskId: string) {
    super(`Task not found: ${taskId}`, 'TASK_NOT_FOUND', 404, { taskId });
    this.name = 'TaskNotFoundError';
  }
}

/**
 * Task already accepted (409)
 */
export class TaskAlreadyAcceptedError extends CoordinatorError {
  constructor(taskId: string) {
    super(
      `Task already accepted: ${taskId}`,
      'TASK_ALREADY_ACCEPTED',
      409,
      { taskId }
    );
    this.name = 'TaskAlreadyAcceptedError';
  }
}

/**
 * Bot not authorized for this task operation (403)
 */
export class UnauthorizedTaskError extends CoordinatorError {
  constructor(taskId: string, botId: string) {
    super(
      `Bot ${botId} is not authorized for task ${taskId}`,
      'UNAUTHORIZED_TASK',
      403,
      { taskId, botId }
    );
    this.name = 'UnauthorizedTaskError';
  }
}

/**
 * Target bot's task queue is full (429)
 */
export class QueueFullError extends CoordinatorError {
  constructor(botId: string, currentSize: number, maxSize: number) {
    super(
      `Bot ${botId} queue is full (${currentSize}/${maxSize})`,
      'QUEUE_FULL',
      429,
      { botId, currentSize, maxSize }
    );
    this.name = 'QueueFullError';
  }
}

/**
 * Invalid API key (401)
 */
export class InvalidApiKeyError extends CoordinatorError {
  constructor() {
    super('Invalid API key', 'INVALID_API_KEY', 401);
    this.name = 'InvalidApiKeyError';
  }
}

/**
 * Invalid task state transition (409)
 */
export class InvalidTaskStateError extends CoordinatorError {
  constructor(taskId: string, currentStatus: string, expectedStatuses: string[]) {
    super(
      `Task ${taskId} is in "${currentStatus}" state, expected one of: ${expectedStatuses.join(', ')}`,
      'INVALID_TASK_STATE',
      409,
      { taskId, currentStatus, expectedStatuses }
    );
    this.name = 'InvalidTaskStateError';
  }
}
