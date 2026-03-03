/**
 * Common Errors - 通用错误基类
 */

/**
 * Base error class for all ClawTeam errors.
 * Provides consistent error structure with code, message, and optional details.
 */
export class ClawTeamError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ClawTeamError';
    // Maintain proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert error to API response format
   */
  toJSON(): {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  } {
    return {
      code: this.code,
      message: this.message,
      ...(this.details && { details: this.details }),
    };
  }
}

/**
 * Resource not found error (404)
 */
export class NotFoundError extends ClawTeamError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} not found: ${id}` : `${resource} not found`;
    super(message, 'NOT_FOUND', 404, { resource, id });
    this.name = 'NotFoundError';
  }
}

/**
 * Validation error (400)
 */
export class ValidationError extends ClawTeamError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

/**
 * Authentication error (401)
 */
export class AuthenticationError extends ClawTeamError {
  constructor(message: string = 'Authentication required', details?: Record<string, unknown>) {
    super(message, 'AUTHENTICATION_ERROR', 401, details);
    this.name = 'AuthenticationError';
  }
}

/**
 * Authorization error (403)
 */
export class AuthorizationError extends ClawTeamError {
  constructor(message: string = 'Access denied', details?: Record<string, unknown>) {
    super(message, 'AUTHORIZATION_ERROR', 403, details);
    this.name = 'AuthorizationError';
  }
}

/**
 * Conflict error (409) - e.g., duplicate resource
 */
export class ConflictError extends ClawTeamError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONFLICT', 409, details);
    this.name = 'ConflictError';
  }
}

/**
 * Rate limit exceeded error (429)
 */
export class RateLimitError extends ClawTeamError {
  constructor(
    message: string = 'Rate limit exceeded',
    public readonly retryAfterSeconds?: number
  ) {
    super(message, 'RATE_LIMIT_EXCEEDED', 429, { retryAfterSeconds });
    this.name = 'RateLimitError';
  }
}

/**
 * Database error (500)
 */
export class DatabaseError extends ClawTeamError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'DATABASE_ERROR', 500, details);
    this.name = 'DatabaseError';
  }
}

/**
 * External service error (502)
 */
export class ExternalServiceError extends ClawTeamError {
  constructor(service: string, message: string, details?: Record<string, unknown>) {
    super(`${service}: ${message}`, 'EXTERNAL_SERVICE_ERROR', 502, { service, ...details });
    this.name = 'ExternalServiceError';
  }
}

/**
 * Service unavailable error (503)
 */
export class ServiceUnavailableError extends ClawTeamError {
  constructor(message: string = 'Service temporarily unavailable', details?: Record<string, unknown>) {
    super(message, 'SERVICE_UNAVAILABLE', 503, details);
    this.name = 'ServiceUnavailableError';
  }
}

/**
 * Type guard to check if error is a ClawTeamError
 */
export function isClawTeamError(error: unknown): error is ClawTeamError {
  return error instanceof ClawTeamError;
}

/**
 * Wrap unknown error into ClawTeamError
 */
export function wrapError(error: unknown): ClawTeamError {
  if (isClawTeamError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new ClawTeamError(error.message, 'INTERNAL_ERROR', 500, {
      originalError: error.name,
    });
  }

  return new ClawTeamError(String(error), 'INTERNAL_ERROR', 500);
}
