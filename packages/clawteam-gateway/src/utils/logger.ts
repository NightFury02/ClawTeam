/**
 * Structured Logger
 *
 * Pino-based logger for the TaskRouter process.
 * Multi-target transport: terminal (pretty or stdout) + daily-rotated file.
 */

import * as fs from 'node:fs';
import pino from 'pino';

export interface LoggerOptions {
  level?: string;
  logDir?: string;
}

export function createLogger(options: LoggerOptions = {}): pino.Logger {
  const { level = 'info', logDir = 'logs/' } = options;

  // Ensure log directory exists
  fs.mkdirSync(logDir, { recursive: true });

  const targets: pino.TransportTargetOptions[] = [];

  // Target 1: Terminal
  if (process.env.NODE_ENV !== 'production') {
    targets.push({
      target: 'pino-pretty',
      options: { colorize: true },
      level,
    });
  } else {
    targets.push({
      target: 'pino/file',
      options: { destination: 1 }, // stdout
      level,
    });
  }

  // Target 2: Daily-rotated log file
  targets.push({
    target: 'pino-roll',
    options: {
      file: `${logDir.replace(/\/$/, '')}/gateway`,
      frequency: 'daily',
      dateFormat: 'yyyy-MM-dd',
      mkdir: true,
    },
    level,
  });

  return pino({
    level,
    transport: { targets },
  });
}
