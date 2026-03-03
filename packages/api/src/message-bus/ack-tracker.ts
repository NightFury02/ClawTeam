/**
 * ACK Tracker
 * Tracks pending message acknowledgments and triggers timeouts.
 */

import { randomUUID } from 'crypto';
import type { MessageType } from '@clawteam/shared/types';
import type { AckConfig, ServerMessage } from './interface';

export interface PendingAck {
  messageId: string;
  botId: string;
  message: ServerMessage;
  sentAt: Date;
  timeout: NodeJS.Timeout;
  retryCount: number;
}

/**
 * Tracks messages that require ACK from bots.
 * When an ACK is not received within the timeout, the onAckTimeout callback is invoked.
 */
export class AckTracker {
  private pendingAcks = new Map<string, PendingAck>();
  private config: AckConfig;

  /** Called when an ACK times out */
  onAckTimeout?: (pending: PendingAck) => void;

  /** Called when an ACK is received */
  onAckReceived?: (messageId: string) => void;

  constructor(config: AckConfig) {
    this.config = config;
  }

  /**
   * Track a message that requires ACK.
   * Adds a messageId to the message and starts a timeout timer.
   * Returns the message with messageId attached.
   */
  trackMessage(botId: string, message: ServerMessage): ServerMessage {
    const messageId = randomUUID();
    const trackedMessage: ServerMessage = {
      ...message,
      messageId,
    };

    const timeout = setTimeout(() => {
      const pending = this.pendingAcks.get(messageId);
      if (pending) {
        this.pendingAcks.delete(messageId);
        this.onAckTimeout?.(pending);
      }
    }, this.config.timeoutMs);

    this.pendingAcks.set(messageId, {
      messageId,
      botId,
      message: trackedMessage,
      sentAt: new Date(),
      timeout,
      retryCount: 0,
    });

    return trackedMessage;
  }

  /**
   * Acknowledge receipt of a message.
   * Returns true if the messageId was found and acknowledged.
   */
  acknowledgeMessage(messageId: string): boolean {
    const pending = this.pendingAcks.get(messageId);
    if (!pending) return false;

    clearTimeout(pending.timeout);
    this.pendingAcks.delete(messageId);
    this.onAckReceived?.(messageId);
    return true;
  }

  /**
   * Get all pending ACKs for a specific bot.
   */
  getPendingForBot(botId: string): PendingAck[] {
    const result: PendingAck[] = [];
    for (const pending of this.pendingAcks.values()) {
      if (pending.botId === botId) {
        result.push(pending);
      }
    }
    return result;
  }

  /**
   * Check if a message type requires ACK.
   */
  requiresAck(messageType: MessageType): boolean {
    return this.config.requiredFor.includes(messageType);
  }

  /**
   * Cancel all pending ACK timers.
   */
  cancelAll(): void {
    for (const pending of this.pendingAcks.values()) {
      clearTimeout(pending.timeout);
    }
    this.pendingAcks.clear();
  }

  /**
   * Get the number of pending ACKs.
   */
  getPendingCount(): number {
    return this.pendingAcks.size;
  }
}
