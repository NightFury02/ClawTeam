/**
 * Task Poller - Priority-ordered task retrieval
 */

import type { Task } from '@clawteam/shared/types';
import type { ICapabilityRegistry } from '@clawteam/api/capability-registry';
import type { DatabasePool, RedisClient, Logger } from '@clawteam/api/common';
import { taskRowToTask, type TaskRow } from './types';
import {
  PRIORITY_ORDER,
  REDIS_KEYS,
  CACHE_TTL_BUFFER_SECONDS,
  DEFAULT_POLL_LIMIT,
  MAX_POLL_LIMIT,
} from './constants';
import { redisFallbackTotal } from './metrics';

export interface TaskPollerDeps {
  db: DatabasePool;
  redis: RedisClient;
  registry: ICapabilityRegistry;
  logger: Logger;
}

export class TaskPoller {
  private readonly db: DatabasePool;
  private readonly redis: RedisClient;
  private readonly registry: ICapabilityRegistry;
  private readonly logger: Logger;

  constructor(deps: TaskPollerDeps) {
    this.db = deps.db;
    this.redis = deps.redis;
    this.registry = deps.registry;
    this.logger = deps.logger;
  }

  /**
   * Poll pending tasks for a bot, ordered by priority.
   * Non-destructive read — tasks stay in the queue until accepted.
   *
   * Automatically falls back to database polling if Redis is unavailable.
   */
  async poll(botId: string, limit?: number): Promise<Task[]> {
    const effectiveLimit = Math.min(
      Math.max(limit || DEFAULT_POLL_LIMIT, 1),
      MAX_POLL_LIMIT
    );

    try {
      // Try Redis-based polling first (optimal performance)
      return await this.pollFromRedis(botId, effectiveLimit);
    } catch (err) {
      // Record Redis fallback metric
      redisFallbackTotal.inc({ operation: 'poll' });

      this.logger.warn(
        'Redis unavailable, falling back to database polling',
        { err, botId, component: 'TaskPoller' }
      );

      // Fallback to database polling (degraded mode)
      return await this.pollFromDatabase(botId, effectiveLimit);
    }
  }

  /**
   * Poll from Redis queues (normal mode).
   */
  private async pollFromRedis(botId: string, limit: number): Promise<Task[]> {
    const tasks: Task[] = [];

    for (const priority of PRIORITY_ORDER) {
      if (tasks.length >= limit) break;

      const queueKey = `${REDIS_KEYS.TASK_QUEUE}:${botId}:${priority}`;
      const remaining = limit - tasks.length;

      const taskIds = await this.redis.lrange(queueKey, 0, remaining - 1);

      for (const taskId of taskIds) {
        const task = await this.getTaskDetails(taskId);
        if (task) {
          tasks.push(task);
        }
      }
    }

    this.logger.debug('Polled tasks', { botId, count: tasks.length });

    return tasks;
  }

  /**
   * Poll from database (degraded mode when Redis is unavailable).
   * Queries tasks directly from PostgreSQL with priority ordering.
   */
  private async pollFromDatabase(botId: string, limit: number): Promise<Task[]> {
    const result = await this.db.query<TaskRow>(
      `SELECT * FROM tasks
       WHERE to_bot_id = $1 AND status = 'pending'
       ORDER BY
         CASE priority
           WHEN 'urgent' THEN 1
           WHEN 'high' THEN 2
           WHEN 'normal' THEN 3
           WHEN 'low' THEN 4
         END,
         created_at ASC
       LIMIT $2`,
      [botId, limit]
    );

    const tasks = result.rows.map((row) => taskRowToTask(row));

    // Enrich with fromBot info (consistent with Redis mode)
    for (const task of tasks) {
      try {
        const fromBot = await this.registry.getBot(task.fromBotId);
        if (fromBot) {
          // Note: Task type doesn't have fromBot field, but we add it dynamically
          // for consistency with Redis mode behavior
          (task as any).fromBot = {
            id: fromBot.id,
            name: fromBot.name,
          };
        }
      } catch (err) {
        this.logger.warn('Failed to fetch fromBot info', { err, taskId: task.id });
      }
    }

    this.logger.debug('Polled tasks from database (degraded mode)', {
      botId,
      count: tasks.length,
    });

    return tasks;
  }

  private async getTaskDetails(taskId: string): Promise<Task | null> {
    // Try Redis cache first
    const cacheKey = `${REDIS_KEYS.TASK_CACHE}:${taskId}`;
    const cached = await this.redis.hget(cacheKey, 'data');

    if (cached) {
      return JSON.parse(cached);
    }

    // Fallback to database
    const result = await this.db.query<TaskRow>(
      'SELECT * FROM tasks WHERE id = $1 AND status = $2',
      [taskId, 'pending']
    );

    if (result.rows.length === 0) {
      return null;
    }

    const task = taskRowToTask(result.rows[0]);

    // Write back to cache
    await this.redis.hset(cacheKey, 'data', JSON.stringify(task));
    await this.redis.expire(cacheKey, task.timeoutSeconds + CACHE_TTL_BUFFER_SECONDS);

    return task;
  }
}
