/**
 * Message Bus Error Definitions
 */

export class MessageBusError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'MessageBusError';
  }
}

export class AuthenticationError extends MessageBusError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'AUTHENTICATION_ERROR', details);
    this.name = 'AuthenticationError';
  }
}

export class ConnectionError extends MessageBusError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONNECTION_ERROR', details);
    this.name = 'ConnectionError';
  }
}

export class PublishError extends MessageBusError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'PUBLISH_ERROR', details);
    this.name = 'PublishError';
  }
}

export class SubscriptionError extends MessageBusError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'SUBSCRIPTION_ERROR', details);
    this.name = 'SubscriptionError';
  }
}

export class BotNotFoundError extends MessageBusError {
  constructor(botId: string) {
    super(`Bot not found: ${botId}`, 'BOT_NOT_FOUND', { botId });
    this.name = 'BotNotFoundError';
  }
}

export class BotOfflineError extends MessageBusError {
  constructor(botId: string) {
    super(`Bot is offline: ${botId}`, 'BOT_OFFLINE', { botId });
    this.name = 'BotOfflineError';
  }
}

// Phase 2 error classes

export class AckTimeoutError extends MessageBusError {
  constructor(messageId: string, botId: string) {
    super(
      `ACK timeout for message ${messageId} to bot ${botId}`,
      'ACK_TIMEOUT',
      { messageId, botId }
    );
    this.name = 'AckTimeoutError';
  }
}

export class QueueFullError extends MessageBusError {
  constructor(botId: string, maxSize: number) {
    super(
      `Offline queue full for bot ${botId} (max: ${maxSize})`,
      'QUEUE_FULL',
      { botId, maxSize }
    );
    this.name = 'QueueFullError';
  }
}

export class MaxRetriesExceededError extends MessageBusError {
  constructor(messageId: string, botId: string, maxRetries: number) {
    super(
      `Max retries (${maxRetries}) exceeded for message ${messageId} to bot ${botId}`,
      'MAX_RETRIES_EXCEEDED',
      { messageId, botId, maxRetries }
    );
    this.name = 'MaxRetriesExceededError';
  }
}

/** WebSocket close codes for client errors */
export const WS_CLOSE_CODES = {
  MISSING_PARAMS: 4001,
  INVALID_API_KEY: 4002,
  BOT_NOT_FOUND: 4003,
  HEARTBEAT_TIMEOUT: 4004,
} as const;

export type WsCloseCode = (typeof WS_CLOSE_CODES)[keyof typeof WS_CLOSE_CODES];
