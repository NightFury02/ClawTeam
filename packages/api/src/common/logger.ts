/**
 * Common Logger - 结构化日志 (基于 pino)
 */

import pino, { Logger as PinoLogger, LoggerOptions } from 'pino';
import { getConfig } from './config';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogContext {
  [key: string]: unknown;
}

export interface Logger {
  trace(msg: string, context?: LogContext): void;
  debug(msg: string, context?: LogContext): void;
  info(msg: string, context?: LogContext): void;
  warn(msg: string, context?: LogContext): void;
  error(msg: string, context?: LogContext): void;
  fatal(msg: string, context?: LogContext): void;
  child(bindings: LogContext): Logger;
}

/**
 * Wrapper around pino logger with consistent interface
 */
class PinoLoggerWrapper implements Logger {
  constructor(private readonly pinoLogger: PinoLogger) {}

  trace(msg: string, context?: LogContext): void {
    if (context) {
      this.pinoLogger.trace(context, msg);
    } else {
      this.pinoLogger.trace(msg);
    }
  }

  debug(msg: string, context?: LogContext): void {
    if (context) {
      this.pinoLogger.debug(context, msg);
    } else {
      this.pinoLogger.debug(msg);
    }
  }

  info(msg: string, context?: LogContext): void {
    if (context) {
      this.pinoLogger.info(context, msg);
    } else {
      this.pinoLogger.info(msg);
    }
  }

  warn(msg: string, context?: LogContext): void {
    if (context) {
      this.pinoLogger.warn(context, msg);
    } else {
      this.pinoLogger.warn(msg);
    }
  }

  error(msg: string, context?: LogContext): void {
    if (context) {
      this.pinoLogger.error(context, msg);
    } else {
      this.pinoLogger.error(msg);
    }
  }

  fatal(msg: string, context?: LogContext): void {
    if (context) {
      this.pinoLogger.fatal(context, msg);
    } else {
      this.pinoLogger.fatal(msg);
    }
  }

  child(bindings: LogContext): Logger {
    return new PinoLoggerWrapper(this.pinoLogger.child(bindings));
  }
}

/** Root logger instance */
let rootLogger: Logger | null = null;

/**
 * Create the root logger instance
 */
function createRootLogger(): Logger {
  const config = getConfig();

  const options: LoggerOptions = {
    level: config.logLevel as LogLevel,
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    base: {
      service: 'clawteam-api',
    },
  };

  // Use pretty printing in development
  if (process.env.NODE_ENV !== 'production') {
    return new PinoLoggerWrapper(
      pino({
        ...options,
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      })
    );
  }

  return new PinoLoggerWrapper(pino(options));
}

/**
 * Get the root logger (lazy loaded singleton)
 */
export function getLogger(): Logger {
  if (!rootLogger) {
    rootLogger = createRootLogger();
  }
  return rootLogger;
}

/**
 * Create a child logger with specific context
 */
export function createLogger(name: string, context?: LogContext): Logger {
  const base = getLogger();
  return base.child({ module: name, ...context });
}

/**
 * Reset logger (for testing)
 */
export function resetLogger(): void {
  rootLogger = null;
}
