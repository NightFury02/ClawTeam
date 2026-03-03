/**
 * Timeout Detector - Background task for detecting and handling timed-out tasks
 */

import type { IMessageBus } from '@clawteam/api/message-bus';
import type { DatabasePool, RedisClient, Logger } from '@clawteam/api/common';
import type { TaskRow } from './types';
import { REDIS_KEYS, PRIORITY_ORDER, TIMEOUT_CHECK_INTERVAL_MS } from './constants';
import { tasksTimeoutTotal, taskDuration } from './metrics';

export interface TimeoutDetectorDeps {
  db: DatabasePool;
  redis: RedisClient;
  messageBus: IMessageBus;
  logger: Logger;
  /** Override the check interval for testing */
  checkIntervalMs?: number;
}

export class TimeoutDetector {
  private readonly db: DatabasePool;
  private readonly redis: RedisClient;
  private readonly messageBus: IMessageBus;
  private readonly logger: Logger;
  private readonly checkIntervalMs: number;
  private intervalId?: ReturnType<typeof setInterval>;

  constructor(deps: TimeoutDetectorDeps) {
    this.db = deps.db;
    this.redis = deps.redis;
    this.messageBus = deps.messageBus;
    this.logger = deps.logger;
    this.checkIntervalMs = deps.checkIntervalMs ?? TIMEOUT_CHECK_INTERVAL_MS;
  }

  start(): void {
    if (this.intervalId) {
      this.logger.warn('TimeoutDetector already started');
      return;
    }

    this.logger.info('Starting timeout detector', {
      intervalMs: this.checkIntervalMs,
    });

    this.intervalId = setInterval(() => {
      this.detectTimeouts().catch((err) => {
        this.logger.error('Error in timeout detection', { err });
      });
    }, this.checkIntervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
      this.logger.info('Timeout detector stopped');
    }
  }

  /**
   * Run a single detection pass. Exposed for testing.
   */
  async detectTimeouts(): Promise<number> {
    const now = new Date();

    const result = await this.db.query<TaskRow>(
      `SELECT * FROM tasks
       WHERE status IN ('pending', 'accepted', 'processing')
       AND created_at + (timeout_seconds || ' seconds')::INTERVAL < $1`,
      [now]
    );

    const timeoutTasks = result.rows;

    if (timeoutTasks.length > 0) {
      this.logger.info('Found timeout tasks', { count: timeoutTasks.length });
    }

    let handled = 0;
    for (const row of timeoutTasks) {
      await this.handleTimeout(row);
      handled++;
    }

    return handled;
  }

  private async handleTimeout(row: TaskRow): Promise<void> {
    const taskId = row.id;

    if (row.retry_count < row.max_retries) {
      await this.retryTask(row);
    } else {
      await this.markTimeout(row);
    }
  }

  private async retryTask(row: TaskRow): Promise<void> {
    const taskId = row.id;
    const newRetryCount = row.retry_count + 1;

    this.logger.info('Retrying timeout task', {
      taskId,
      retryCount: newRetryCount,
      maxRetries: row.max_retries,
    });

    await this.db.query(
      `UPDATE tasks SET status = 'pending', retry_count = $1, created_at = NOW() WHERE id = $2`,
      [newRetryCount, taskId]
    );

    // Re-enqueue to Redis
    const priority = row.priority || 'normal';
    const queueKey = `${REDIS_KEYS.TASK_QUEUE}:${row.to_bot_id}:${priority}`;
    await this.redis.rpush(queueKey, taskId);

    // Remove from processing ZSET if present
    await this.redis.zrem(REDIS_KEYS.PROCESSING_SET, taskId);
  }

  private async markTimeout(row: TaskRow): Promise<void> {
    const taskId = row.id;

    this.logger.warn('Task exceeded max retries, marking as timeout', {
      taskId,
      retryCount: row.retry_count,
      maxRetries: row.max_retries,
    });

    const errorPayload = {
      code: 'TIMEOUT',
      message: `Task timed out after ${row.timeout_seconds} seconds`,
      retries: row.retry_count,
    };

    await this.db.query(
      `UPDATE tasks SET status = 'timeout', error = $1, completed_at = NOW() WHERE id = $2`,
      [JSON.stringify(errorPayload), taskId]
    );

    // Record timeout metrics
    tasksTimeoutTotal.inc({ capability: row.capability || 'unknown' });

    // Record task duration
    const now = new Date();
    const durationSeconds = (now.getTime() - new Date(row.created_at).getTime()) / 1000;
    taskDuration.observe(
      { capability: row.capability || 'unknown', status: 'timeout' },
      durationSeconds
    );

    // Clean up Redis
    for (const priority of PRIORITY_ORDER) {
      const queueKey = `${REDIS_KEYS.TASK_QUEUE}:${row.to_bot_id}:${priority}`;
      await this.redis.lrem(queueKey, 0, taskId);
    }
    await this.redis.zrem(REDIS_KEYS.PROCESSING_SET, taskId);
    await this.redis.del(`${REDIS_KEYS.TASK_CACHE}:${taskId}`);

    // Notify originating bot
    try {
      await this.messageBus.publish('task_failed', {
        taskId,
        reason: 'timeout',
        error: errorPayload,
      }, row.from_bot_id);
    } catch (err) {
      this.logger.error('Failed to notify task timeout', { err, taskId });
    }
  }
}
