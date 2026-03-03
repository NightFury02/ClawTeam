/**
 * Retry Manager
 * Handles message retry with exponential backoff.
 */

import type { RetryConfig, ServerMessage } from './interface';

export interface RetryEntry {
  messageId: string;
  botId: string;
  message: ServerMessage;
  attempt: number;
  timeout: NodeJS.Timeout;
  scheduledAt: Date;
}

/**
 * Manages message retries with exponential backoff and jitter.
 * Connects to AckTracker (timeout → retry) and OfflineQueue (max retries → dead letter).
 */
export class RetryManager {
  private retries = new Map<string, RetryEntry>();
  private config: RetryConfig;

  /** Called when a retry attempt should be made. Return true if sent successfully. */
  onRetryAttempt?: (entry: RetryEntry) => Promise<boolean>;

  /** Called when max retries exceeded for a message. */
  onMaxRetriesExceeded?: (entry: RetryEntry) => void;

  constructor(config: RetryConfig) {
    this.config = config;
  }

  /**
   * Schedule a retry for a message.
   * Uses exponential backoff: min(baseDelayMs * 2^attempt + jitter, maxDelayMs)
   */
  scheduleRetry(
    botId: string,
    message: ServerMessage,
    attempt: number = 0
  ): void {
    const messageId = message.messageId ?? `retry-${Date.now()}-${Math.random()}`;

    if (attempt >= this.config.maxRetries) {
      this.onMaxRetriesExceeded?.({
        messageId,
        botId,
        message,
        attempt,
        timeout: null as any,
        scheduledAt: new Date(),
      });
      return;
    }

    const delay = this.calculateDelay(attempt);

    const timeout = setTimeout(async () => {
      this.retries.delete(messageId);

      if (this.onRetryAttempt) {
        const success = await this.onRetryAttempt({
          messageId,
          botId,
          message,
          attempt: attempt + 1,
          timeout,
          scheduledAt: new Date(),
        });

        if (!success) {
          // Retry again with incremented attempt
          this.scheduleRetry(botId, message, attempt + 1);
        }
      }
    }, delay);

    this.retries.set(messageId, {
      messageId,
      botId,
      message,
      attempt,
      timeout,
      scheduledAt: new Date(),
    });
  }

  /**
   * Cancel a specific retry by messageId.
   */
  cancelRetry(messageId: string): void {
    const entry = this.retries.get(messageId);
    if (entry) {
      clearTimeout(entry.timeout);
      this.retries.delete(messageId);
    }
  }

  /**
   * Cancel all retries for a specific bot.
   * Returns the cancelled entries.
   */
  cancelRetriesForBot(botId: string): RetryEntry[] {
    const cancelled: RetryEntry[] = [];
    for (const [id, entry] of this.retries) {
      if (entry.botId === botId) {
        clearTimeout(entry.timeout);
        this.retries.delete(id);
        cancelled.push(entry);
      }
    }
    return cancelled;
  }

  /**
   * Cancel all pending retries.
   */
  cancelAll(): void {
    for (const entry of this.retries.values()) {
      clearTimeout(entry.timeout);
    }
    this.retries.clear();
  }

  /**
   * Get the number of pending retries.
   */
  getPendingCount(): number {
    return this.retries.size;
  }

  /**
   * Calculate delay with exponential backoff and jitter.
   */
  private calculateDelay(attempt: number): number {
    const exponential = this.config.baseDelayMs * Math.pow(2, attempt);
    const jitter = Math.random() * this.config.baseDelayMs * 0.1;
    return Math.min(exponential + jitter, this.config.maxDelayMs);
  }
}
