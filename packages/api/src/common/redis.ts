/**
 * Common Redis - Redis 客户端 (基于 ioredis)
 */

import Redis, { RedisOptions } from 'ioredis';
import { getConfig, RedisConfig } from './config';
import { createLogger, Logger } from './logger';
import { ExternalServiceError } from './errors';

export interface RedisClient {
  /**
   * Get a value by key
   */
  get(key: string): Promise<string | null>;

  /**
   * Set a value with optional expiration
   */
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;

  /**
   * Delete a key
   */
  del(key: string): Promise<number>;

  /**
   * Check if key exists
   */
  exists(key: string): Promise<boolean>;

  /**
   * Set expiration on a key
   */
  expire(key: string, seconds: number): Promise<boolean>;

  /**
   * Get TTL of a key
   */
  ttl(key: string): Promise<number>;

  /**
   * Get multiple values by keys
   */
  mget(...keys: string[]): Promise<(string | null)[]>;

  /**
   * Set multiple values
   */
  mset(data: Record<string, string>): Promise<void>;

  /**
   * Hash operations
   */
  hget(key: string, field: string): Promise<string | null>;
  hset(key: string, field: string, value: string): Promise<number>;
  hgetall(key: string): Promise<Record<string, string>>;
  hdel(key: string, ...fields: string[]): Promise<number>;

  /**
   * List operations
   */
  lpush(key: string, ...values: string[]): Promise<number>;
  rpush(key: string, ...values: string[]): Promise<number>;
  lpop(key: string): Promise<string | null>;
  rpop(key: string): Promise<string | null>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  llen(key: string): Promise<number>;

  /**
   * List remove
   */
  lrem(key: string, count: number, value: string): Promise<number>;

  /**
   * Sorted set operations
   */
  zadd(key: string, score: string, member: string): Promise<number>;
  zrem(key: string, ...members: string[]): Promise<number>;
  zrangebyscore(key: string, min: string | number, max: string | number): Promise<string[]>;

  /**
   * Hash increment
   */
  hincrby(key: string, field: string, increment: number): Promise<number>;

  /**
   * Set operations
   */
  sadd(key: string, ...members: string[]): Promise<number>;
  srem(key: string, ...members: string[]): Promise<number>;
  smembers(key: string): Promise<string[]>;
  scard(key: string): Promise<number>;
  sismember(key: string, member: string): Promise<boolean>;

  /**
   * Pub/Sub - get underlying client for pub/sub
   */
  getClient(): Redis;

  /**
   * Create a duplicate client for pub/sub subscriber
   */
  duplicate(): RedisClient;

  /**
   * Close the connection
   */
  close(): Promise<void>;

  /**
   * Check if connected
   */
  isConnected(): boolean;
}

/**
 * Redis client implementation using ioredis
 */
class IoRedisClient implements RedisClient {
  private client: Redis;
  private connected: boolean = false;
  private logger: Logger;
  private keyPrefix: string;

  constructor(config: RedisConfig) {
    this.logger = createLogger('redis');
    this.keyPrefix = config.keyPrefix;

    const options: RedisOptions = {
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db,
      keyPrefix: config.keyPrefix,
      retryStrategy: (times) => {
        if (times > 3) {
          this.logger.error('Redis connection failed after 3 retries');
          return null;
        }
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    };

    this.client = new Redis(options);

    this.client.on('connect', () => {
      this.connected = true;
      this.logger.info('Redis connected');
    });

    this.client.on('error', (err) => {
      this.logger.error('Redis error', { error: err.message });
    });

    this.client.on('close', () => {
      this.connected = false;
      this.logger.info('Redis connection closed');
    });
  }

  private handleError(operation: string, error: unknown): never {
    const err = error as Error;
    this.logger.error(`Redis ${operation} failed`, { error: err.message });
    throw new ExternalServiceError('Redis', err.message, { operation });
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (error) {
      return this.handleError('get', error);
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    try {
      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, value);
      } else {
        await this.client.set(key, value);
      }
    } catch (error) {
      this.handleError('set', error);
    }
  }

  async del(key: string): Promise<number> {
    try {
      return await this.client.del(key);
    } catch (error) {
      return this.handleError('del', error);
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      return this.handleError('exists', error);
    }
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    try {
      const result = await this.client.expire(key, seconds);
      return result === 1;
    } catch (error) {
      return this.handleError('expire', error);
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      return await this.client.ttl(key);
    } catch (error) {
      return this.handleError('ttl', error);
    }
  }

  async mget(...keys: string[]): Promise<(string | null)[]> {
    try {
      return await this.client.mget(...keys);
    } catch (error) {
      return this.handleError('mget', error);
    }
  }

  async mset(data: Record<string, string>): Promise<void> {
    try {
      const pairs: string[] = [];
      for (const [key, value] of Object.entries(data)) {
        pairs.push(key, value);
      }
      if (pairs.length > 0) {
        await this.client.mset(...pairs);
      }
    } catch (error) {
      this.handleError('mset', error);
    }
  }

  async hget(key: string, field: string): Promise<string | null> {
    try {
      return await this.client.hget(key, field);
    } catch (error) {
      return this.handleError('hget', error);
    }
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    try {
      return await this.client.hset(key, field, value);
    } catch (error) {
      return this.handleError('hset', error);
    }
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    try {
      return await this.client.hgetall(key);
    } catch (error) {
      return this.handleError('hgetall', error);
    }
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    try {
      return await this.client.hdel(key, ...fields);
    } catch (error) {
      return this.handleError('hdel', error);
    }
  }

  async lpush(key: string, ...values: string[]): Promise<number> {
    try {
      return await this.client.lpush(key, ...values);
    } catch (error) {
      return this.handleError('lpush', error);
    }
  }

  async rpush(key: string, ...values: string[]): Promise<number> {
    try {
      return await this.client.rpush(key, ...values);
    } catch (error) {
      return this.handleError('rpush', error);
    }
  }

  async lpop(key: string): Promise<string | null> {
    try {
      return await this.client.lpop(key);
    } catch (error) {
      return this.handleError('lpop', error);
    }
  }

  async rpop(key: string): Promise<string | null> {
    try {
      return await this.client.rpop(key);
    } catch (error) {
      return this.handleError('rpop', error);
    }
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    try {
      return await this.client.lrange(key, start, stop);
    } catch (error) {
      return this.handleError('lrange', error);
    }
  }

  async llen(key: string): Promise<number> {
    try {
      return await this.client.llen(key);
    } catch (error) {
      return this.handleError('llen', error);
    }
  }

  async lrem(key: string, count: number, value: string): Promise<number> {
    try {
      return await this.client.lrem(key, count, value);
    } catch (error) {
      return this.handleError('lrem', error);
    }
  }

  async zadd(key: string, score: string, member: string): Promise<number> {
    try {
      return await this.client.zadd(key, score, member);
    } catch (error) {
      return this.handleError('zadd', error);
    }
  }

  async zrem(key: string, ...members: string[]): Promise<number> {
    try {
      return await this.client.zrem(key, ...members);
    } catch (error) {
      return this.handleError('zrem', error);
    }
  }

  async zrangebyscore(key: string, min: string | number, max: string | number): Promise<string[]> {
    try {
      return await this.client.zrangebyscore(key, min, max);
    } catch (error) {
      return this.handleError('zrangebyscore', error);
    }
  }

  async hincrby(key: string, field: string, increment: number): Promise<number> {
    try {
      return await this.client.hincrby(key, field, increment);
    } catch (error) {
      return this.handleError('hincrby', error);
    }
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    try {
      return await this.client.sadd(key, ...members);
    } catch (error) {
      return this.handleError('sadd', error);
    }
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    try {
      return await this.client.srem(key, ...members);
    } catch (error) {
      return this.handleError('srem', error);
    }
  }

  async smembers(key: string): Promise<string[]> {
    try {
      return await this.client.smembers(key);
    } catch (error) {
      return this.handleError('smembers', error);
    }
  }

  async scard(key: string): Promise<number> {
    try {
      return await this.client.scard(key);
    } catch (error) {
      return this.handleError('scard', error);
    }
  }

  async sismember(key: string, member: string): Promise<boolean> {
    try {
      const result = await this.client.sismember(key, member);
      return result === 1;
    } catch (error) {
      return this.handleError('sismember', error);
    }
  }

  getClient(): Redis {
    return this.client;
  }

  duplicate(): RedisClient {
    const config = getConfig();
    return new IoRedisClient(config.redis);
  }

  async close(): Promise<void> {
    await this.client.quit();
    this.connected = false;
    this.logger.info('Redis client closed');
  }

  isConnected(): boolean {
    return this.connected && this.client.status === 'ready';
  }
}

/** Singleton client instance */
let redisInstance: RedisClient | null = null;

/**
 * Get the Redis client (lazy loaded singleton)
 */
export function getRedis(): RedisClient {
  if (!redisInstance) {
    const config = getConfig();
    redisInstance = new IoRedisClient(config.redis);
  }
  return redisInstance;
}

/**
 * Create a new Redis client with custom config
 */
export function createRedis(config: RedisConfig): RedisClient {
  return new IoRedisClient(config);
}

/**
 * Close and reset the Redis client
 */
export async function closeRedis(): Promise<void> {
  if (redisInstance) {
    await redisInstance.close();
    redisInstance = null;
  }
}
