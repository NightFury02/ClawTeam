/**
 * Common Database - PostgreSQL 连接池 (基于 pg)
 */

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { getConfig, DatabaseConfig } from './config';
import { createLogger, Logger } from './logger';
import { DatabaseError } from './errors';

export interface DatabasePool {
  /**
   * Execute a query and return results
   */
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[]
  ): Promise<QueryResult<T>>;

  /**
   * Get a client from the pool for transaction support
   */
  getClient(): Promise<PoolClient>;

  /**
   * Execute a function within a transaction
   */
  transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T>;

  /**
   * Close the pool
   */
  close(): Promise<void>;

  /**
   * Check if pool is connected
   */
  isConnected(): boolean;
}

/**
 * PostgreSQL connection pool implementation
 */
class PostgresPool implements DatabasePool {
  private pool: Pool;
  private connected: boolean = false;
  private logger: Logger;

  constructor(config: DatabaseConfig) {
    this.logger = createLogger('database');

    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
      max: config.poolSize,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    // Handle pool errors
    this.pool.on('error', (err) => {
      this.logger.error('Unexpected pool error', { error: err.message });
    });

    this.pool.on('connect', () => {
      this.connected = true;
      this.logger.debug('New database connection established');
    });

    this.pool.on('remove', () => {
      this.logger.debug('Database connection removed from pool');
    });
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[]
  ): Promise<QueryResult<T>> {
    const start = Date.now();
    try {
      const result = await this.pool.query<T>(text, values);
      const duration = Date.now() - start;

      this.logger.debug('Query executed', {
        query: text.substring(0, 100),
        duration,
        rowCount: result.rowCount,
      });

      return result;
    } catch (error) {
      const err = error as Error;
      this.logger.error('Query failed', {
        query: text.substring(0, 100),
        error: err.message,
      });
      throw new DatabaseError(err.message, { query: text.substring(0, 100) });
    }
  }

  async getClient(): Promise<PoolClient> {
    try {
      return await this.pool.connect();
    } catch (error) {
      const err = error as Error;
      throw new DatabaseError(`Failed to get database client: ${err.message}`);
    }
  }

  async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.getClient();

    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
    this.connected = false;
    this.logger.info('Database pool closed');
  }

  isConnected(): boolean {
    return this.connected;
  }
}

/** Singleton pool instance */
let poolInstance: DatabasePool | null = null;

/**
 * Get the database pool (lazy loaded singleton)
 */
export function getDatabase(): DatabasePool {
  if (!poolInstance) {
    const config = getConfig();
    poolInstance = new PostgresPool(config.database);
  }
  return poolInstance;
}

/**
 * Create a new database pool with custom config
 */
export function createDatabase(config: DatabaseConfig): DatabasePool {
  return new PostgresPool(config);
}

/**
 * Close and reset the database pool
 */
export async function closeDatabase(): Promise<void> {
  if (poolInstance) {
    await poolInstance.close();
    poolInstance = null;
  }
}

// Re-export pg types for convenience
export type { PoolClient, QueryResult, QueryResultRow };
