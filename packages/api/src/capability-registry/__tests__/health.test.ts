/**
 * Health Route Tests
 */

import Fastify, { FastifyInstance } from 'fastify';
import { createHealthRoutes } from '../routes/health';
import type { DatabasePool, RedisClient } from '@clawteam/api/common';

describe('Health Route', () => {
  let app: FastifyInstance;

  // Mock database
  const createMockDb = (healthy = true): DatabasePool => ({
    query: jest.fn().mockImplementation((sql: string) => {
      if (!healthy) {
        return Promise.reject(new Error('Connection refused'));
      }
      if (sql.includes('bots')) {
        return Promise.resolve({ rows: [{ total: '10', online: '5' }] });
      }
      if (sql.includes('teams')) {
        return Promise.resolve({ rows: [{ total: '3' }] });
      }
      return Promise.resolve({ rows: [{ '?column?': 1 }] });
    }),
    getClient: jest.fn(),
    transaction: jest.fn(),
    close: jest.fn(),
    isConnected: jest.fn().mockReturnValue(healthy),
  });

  // Mock Redis client
  const createMockRedis = (healthy = true): RedisClient => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    expire: jest.fn(),
    ttl: jest.fn(),
    mget: jest.fn(),
    mset: jest.fn(),
    hget: jest.fn(),
    hset: jest.fn(),
    hgetall: jest.fn(),
    hdel: jest.fn(),
    lpush: jest.fn(),
    rpush: jest.fn(),
    lpop: jest.fn(),
    rpop: jest.fn(),
    lrange: jest.fn(),
    llen: jest.fn(),
    lrem: jest.fn(),
    zadd: jest.fn(),
    zrem: jest.fn(),
    zrangebyscore: jest.fn(),
    hincrby: jest.fn(),
    sadd: jest.fn(),
    srem: jest.fn(),
    smembers: jest.fn(),
    scard: jest.fn(),
    sismember: jest.fn(),
    getClient: jest.fn().mockReturnValue({
      ping: healthy
        ? jest.fn().mockResolvedValue('PONG')
        : jest.fn().mockRejectedValue(new Error('Redis connection failed')),
    }),
    duplicate: jest.fn(),
    close: jest.fn(),
    isConnected: jest.fn().mockReturnValue(healthy),
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('GET /health', () => {
    it('should return healthy when both DB and Redis are available', async () => {
      const mockDb = createMockDb(true);
      const mockRedis = createMockRedis(true);

      app = Fastify();
      await app.register(createHealthRoutes({ db: mockDb, redis: mockRedis }));
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.status).toBe('healthy');
      expect(body.service).toBe('capability-registry');
      expect(body.checks.database.status).toBe('healthy');
      expect(body.checks.redis.status).toBe('healthy');
      expect(body.stats.totalBots).toBe(10);
      expect(body.stats.onlineBots).toBe(5);
      expect(body.stats.totalTeams).toBe(3);
      expect(body.uptime).toBeGreaterThanOrEqual(0);
      expect(body.memory).toHaveProperty('used');
      expect(body.memory).toHaveProperty('total');
      expect(body.memory).toHaveProperty('percentage');
    });

    it('should return degraded when Redis is unavailable', async () => {
      const mockDb = createMockDb(true);
      const mockRedis = createMockRedis(false);

      app = Fastify();
      await app.register(createHealthRoutes({ db: mockDb, redis: mockRedis }));
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200); // Still 200 for degraded
      const body = JSON.parse(response.payload);
      expect(body.status).toBe('degraded');
      expect(body.checks.database.status).toBe('healthy');
      expect(body.checks.redis.status).toBe('unhealthy');
      expect(body.checks.redis.details).toContain('Redis');
    });

    it('should return degraded when Redis is null', async () => {
      const mockDb = createMockDb(true);

      app = Fastify();
      await app.register(createHealthRoutes({ db: mockDb, redis: null }));
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.status).toBe('degraded');
      expect(body.checks.redis.status).toBe('unhealthy');
      expect(body.checks.redis.details).toBe('Redis client not configured');
    });

    it('should return unhealthy (503) when PostgreSQL is unavailable', async () => {
      const mockDb = createMockDb(false);
      const mockRedis = createMockRedis(true);

      app = Fastify();
      await app.register(createHealthRoutes({ db: mockDb, redis: mockRedis }));
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.payload);
      expect(body.status).toBe('unhealthy');
      expect(body.checks.database.status).toBe('unhealthy');
      expect(body.checks.database.details).toContain('PostgreSQL unavailable');
    });

    it('should return unhealthy (503) when both DB and Redis are unavailable', async () => {
      const mockDb = createMockDb(false);
      const mockRedis = createMockRedis(false);

      app = Fastify();
      await app.register(createHealthRoutes({ db: mockDb, redis: mockRedis }));
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.payload);
      expect(body.status).toBe('unhealthy');
      expect(body.checks.database.status).toBe('unhealthy');
      expect(body.checks.redis.status).toBe('unhealthy');
    });

    it('should include timestamp and version in response', async () => {
      const mockDb = createMockDb(true);
      const mockRedis = createMockRedis(true);

      app = Fastify();
      await app.register(createHealthRoutes({ db: mockDb, redis: mockRedis }));
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      const body = JSON.parse(response.payload);
      expect(body.timestamp).toBeDefined();
      expect(new Date(body.timestamp).getTime()).not.toBeNaN();
      expect(body.version).toBeDefined();
    });

    it('should include response times for checks', async () => {
      const mockDb = createMockDb(true);
      const mockRedis = createMockRedis(true);

      app = Fastify();
      await app.register(createHealthRoutes({ db: mockDb, redis: mockRedis }));
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      const body = JSON.parse(response.payload);
      expect(typeof body.checks.database.responseTime).toBe('number');
      expect(typeof body.checks.redis.responseTime).toBe('number');
      expect(body.checks.database.responseTime).toBeGreaterThanOrEqual(0);
      expect(body.checks.redis.responseTime).toBeGreaterThanOrEqual(0);
    });

    it('should still return stats even if stats query fails', async () => {
      const mockDb: DatabasePool = {
        query: jest.fn().mockImplementation((sql: string) => {
          if (sql === 'SELECT 1') {
            return Promise.resolve({ rows: [{ '?column?': 1 }] });
          }
          // Stats queries fail
          return Promise.reject(new Error('Stats query failed'));
        }),
        getClient: jest.fn(),
        transaction: jest.fn(),
        close: jest.fn(),
        isConnected: jest.fn().mockReturnValue(true),
      };
      const mockRedis = createMockRedis(true);

      app = Fastify();
      await app.register(createHealthRoutes({ db: mockDb, redis: mockRedis }));
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.status).toBe('healthy');
      expect(body.stats.totalBots).toBe(0);
      expect(body.stats.onlineBots).toBe(0);
      expect(body.stats.totalTeams).toBe(0);
    });
  });
});
