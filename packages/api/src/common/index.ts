/**
 * Common Module - 共享基础设施
 *
 * 提供数据库连接、Redis 客户端、日志、配置和错误处理等基础功能。
 */

// Config
export {
  loadConfig,
  getConfig,
  resetConfig,
  type AppConfig,
  type DatabaseConfig,
  type RedisConfig,
  type ApiConfig,
} from './config';

// Logger
export {
  getLogger,
  createLogger,
  resetLogger,
  type Logger,
  type LogLevel,
  type LogContext,
} from './logger';

// Database
export {
  getDatabase,
  createDatabase,
  closeDatabase,
  type DatabasePool,
  type PoolClient,
  type QueryResult,
  type QueryResultRow,
} from './db';

// Redis
export {
  getRedis,
  createRedis,
  closeRedis,
  type RedisClient,
} from './redis';

// Errors
export {
  ClawTeamError,
  NotFoundError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  RateLimitError,
  DatabaseError,
  ExternalServiceError,
  ServiceUnavailableError,
  isClawTeamError,
  wrapError,
} from './errors';
