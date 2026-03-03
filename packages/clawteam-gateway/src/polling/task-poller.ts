/**
 * Task Polling Loop (Unified Inbox)
 *
 * Polls GET /api/v1/messages/inbox on a configurable interval and
 * routes each message through the TaskRouter based on message type:
 * - task_notification → fetch full Task, route via router.route(task)
 * - direct_message   → route via router.routeMessage(message)
 */

import { EventEmitter } from 'node:events';
import type { TaskRouter } from '../routing/router.js';
import type { IClawTeamApiClient } from '../clients/clawteam-api.js';
import { RoutedTasksTracker } from '../routing/routed-tasks.js';
import { printPollTickSummary } from '../utils/visual-log.js';
import type { Logger } from 'pino';

export interface TaskPollingLoopDeps {
  clawteamApi: IClawTeamApiClient;
  router: TaskRouter;
  pollIntervalMs: number;
  pollLimit: number;
  logger: Logger;
  routedTasksTtlMs?: number;
  /** Optional external RoutedTasksTracker (shared with recovery loop). If not provided, one is created internally. */
  routedTasks?: RoutedTasksTracker;
}

export class TaskPollingLoop extends EventEmitter {
  private readonly clawteamApi: IClawTeamApiClient;
  private readonly router: TaskRouter;
  private readonly pollIntervalMs: number;
  private readonly pollLimit: number;
  private readonly logger: Logger;
  private readonly routedTasks: RoutedTasksTracker;

  private timer: ReturnType<typeof setInterval> | null = null;
  private isPolling = false;
  private consecutiveErrors = 0;
  private readonly maxConsecutiveErrors = 5;

  constructor(deps: TaskPollingLoopDeps) {
    super();
    this.clawteamApi = deps.clawteamApi;
    this.router = deps.router;
    this.pollIntervalMs = deps.pollIntervalMs;
    this.pollLimit = deps.pollLimit;
    this.logger = deps.logger.child({ component: 'poller' });
    this.routedTasks = deps.routedTasks ?? new RoutedTasksTracker(deps.routedTasksTtlMs);
  }

  start(): void {
    this.logger.info(
      { intervalMs: this.pollIntervalMs, limit: this.pollLimit },
      'Starting inbox polling loop',
    );

    // Run immediately, then on interval
    this.pollOnce();
    this.timer = setInterval(() => this.pollOnce(), this.pollIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.logger.info('Polling loop stopped');
  }

  async pollOnce(): Promise<void> {
    // Guard against overlapping polls
    if (this.isPolling) {
      this.logger.debug('Skipping poll — previous poll still running');
      return;
    }

    this.isPolling = true;

    try {
      const messages = await this.clawteamApi.pollInbox(this.pollLimit);

      if (messages.length === 0) {
        this.logger.debug('No inbox messages');
        this.consecutiveErrors = 0;
        return;
      }

      this.logger.info({ count: messages.length }, 'Found inbox messages');

      let routed = 0;
      let failed = 0;
      let skipped = 0;

      for (const msg of messages) {
        if (msg.type === 'task_notification') {
          const taskId = msg.content?.taskId || msg.taskId;
          if (!taskId) {
            this.logger.warn({ messageId: msg.messageId }, 'task_notification missing taskId, skipping');
            skipped++;
            continue;
          }

          const task = await this.clawteamApi.getTask(taskId);
          if (!task) {
            this.logger.warn({ taskId, messageId: msg.messageId }, 'Task not found for task_notification, skipping');
            skipped++;
            continue;
          }

          const result = await this.router.route(task);
          if (result.success) {
            routed++;
            this.routedTasks.markRouted(task.id);
            // ACK the inbox message (best-effort, non-blocking on failure)
            await this.clawteamApi.ackMessage(msg.messageId).catch((err) => {
              this.logger.warn(
                { messageId: msg.messageId, error: (err as Error).message },
                'ACK failed for task_notification',
              );
            });
          } else if (result.error === 'session_busy') {
            // Session busy — don't ACK, message stays in inbox for retry on next poll
            skipped++;
          } else {
            failed++;
            this.logger.warn(
              { taskId: task.id, error: result.error },
              'Failed to route task from inbox',
            );
          }
        } else if (msg.type === 'delegate_intent') {
          const result = await this.router.routeDelegateIntent(msg);
          if (result.success) {
            routed++;
            await this.clawteamApi.ackMessage(msg.messageId).catch((err) => {
              this.logger.warn(
                { messageId: msg.messageId, error: (err as Error).message },
                'ACK failed for delegate_intent',
              );
            });
          } else {
            failed++;
            this.logger.warn(
              { messageId: msg.messageId, error: result.error },
              'Failed to route delegate_intent',
            );
          }
        } else if (msg.type === 'direct_message') {
          const result = await this.router.routeMessage(msg);
          if (result.success) {
            routed++;
            // ACK the inbox message (best-effort, non-blocking on failure)
            await this.clawteamApi.ackMessage(msg.messageId).catch((err) => {
              this.logger.warn(
                { messageId: msg.messageId, error: (err as Error).message },
                'ACK failed for direct_message',
              );
            });
          } else {
            failed++;
            this.logger.warn(
              { messageId: msg.messageId, error: result.error },
              'Failed to route direct message',
            );
          }
        } else {
          // broadcast/system: log and skip for now
          this.logger.debug({ messageId: msg.messageId, type: msg.type }, 'Skipping unsupported message type');
          skipped++;
        }
      }

      this.logger.info({ routed, failed, skipped, total: messages.length }, 'Poll cycle complete');
      this.consecutiveErrors = 0;
      this.emit('poll_complete', { fetched: messages.length, routed, failed, skipped });
      printPollTickSummary({ fetched: messages.length, routed, failed, skipped });

      // Periodic cleanup of expired dedup entries
      const cleaned = this.routedTasks.cleanup();
      if (cleaned > 0) {
        this.logger.debug({ cleaned }, 'Cleaned expired routed-task entries');
      }
    } catch (error) {
      this.consecutiveErrors++;
      this.logger.error(
        { error: (error as Error).message, consecutiveErrors: this.consecutiveErrors },
        'Poll cycle failed',
      );

      if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
        this.logger.warn(
          { consecutiveErrors: this.consecutiveErrors },
          'Too many consecutive errors, backing off',
        );
      }
    } finally {
      this.isPolling = false;
    }
  }
}
