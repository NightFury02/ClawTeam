/**
 * Health Check Route
 *
 * Provides health status for the capability-registry service.
 * Checks PostgreSQL and Redis connectivity.
 */

import type { FastifyPluginAsync } from 'fastify';
import type { DatabasePool, RedisClient } from '@clawteam/api/common';

/** Service start time for uptime calculation */
const startTime = Date.now();

/** Health check status */
type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

/** Individual check result */
interface CheckResult {
  status: HealthStatus;
  responseTime: number;
  details: string;
  lastCheck: string;
}

/** Health check response */
interface HealthResponse {
  status: HealthStatus;
  timestamp: string;
  version: string;
  service: string;
  checks: {
    database: CheckResult;
    redis: CheckResult;
  };
  uptime: number;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  stats: {
    totalBots: number;
    onlineBots: number;
    totalTeams: number;
  };
}

interface HealthRouteDeps {
  db: DatabasePool;
  redis: RedisClient | null;
}

/**
 * Create health check routes plugin.
 */
export function createHealthRoutes(deps: HealthRouteDeps): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/health', async (_request, reply) => {
      const { db, redis } = deps;

      // 1. Check PostgreSQL
      let dbStatus: HealthStatus = 'healthy';
      let dbResponseTime = 0;
      let dbDetails = 'PostgreSQL connection OK';

      try {
        const dbPingStart = Date.now();
        await db.query('SELECT 1');
        dbResponseTime = Date.now() - dbPingStart;
      } catch (err) {
        dbStatus = 'unhealthy';
        dbDetails = `PostgreSQL unavailable: ${(err as Error).message}`;
      }

      // 2. Check Redis
      let redisStatus: HealthStatus = 'healthy';
      let redisResponseTime = 0;
      let redisDetails = 'Redis ping successful';

      if (redis) {
        try {
          const redisPingStart = Date.now();
          // Use getClient().ping() since ioredis supports it
          await redis.getClient().ping();
          redisResponseTime = Date.now() - redisPingStart;
        } catch (err) {
          redisStatus = 'unhealthy';
          redisDetails = `Redis unavailable: ${(err as Error).message}`;
        }
      } else {
        redisStatus = 'unhealthy';
        redisDetails = 'Redis client not configured';
      }

      // 3. Calculate overall status
      let overallStatus: HealthStatus = 'healthy';
      let statusCode = 200;

      if (dbStatus === 'unhealthy') {
        overallStatus = 'unhealthy';
        statusCode = 503;
      } else if (redisStatus === 'unhealthy') {
        overallStatus = 'degraded'; // Redis unavailable but PostgreSQL OK
      }

      // 4. Get statistics (only if DB is healthy)
      let stats = { totalBots: 0, onlineBots: 0, totalTeams: 0 };

      if (dbStatus === 'healthy') {
        try {
          const [botsResult, teamsResult] = await Promise.all([
            db.query<{ total: string; online: string }>(
              "SELECT COUNT(*) as total, COUNT(CASE WHEN status = 'online' THEN 1 END) as online FROM bots"
            ),
            db.query<{ total: string }>('SELECT COUNT(*) as total FROM teams'),
          ]);

          stats = {
            totalBots: parseInt(botsResult.rows[0]?.total || '0', 10),
            onlineBots: parseInt(botsResult.rows[0]?.online || '0', 10),
            totalTeams: parseInt(teamsResult.rows[0]?.total || '0', 10),
          };
        } catch {
          // Stats failure doesn't affect health check
        }
      }

      // 5. Memory usage
      const memUsage = process.memoryUsage();
      const memUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
      const memTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);

      const now = new Date().toISOString();

      const response: HealthResponse = {
        status: overallStatus,
        timestamp: now,
        version: process.env.npm_package_version || '1.0.0',
        service: 'capability-registry',
        checks: {
          database: {
            status: dbStatus,
            responseTime: dbResponseTime,
            details: dbDetails,
            lastCheck: now,
          },
          redis: {
            status: redisStatus,
            responseTime: redisResponseTime,
            details: redisDetails,
            lastCheck: now,
          },
        },
        uptime: Math.floor((Date.now() - startTime) / 1000),
        memory: {
          used: memUsedMB,
          total: memTotalMB,
          percentage: memTotalMB > 0 ? Math.round((memUsedMB / memTotalMB) * 100 * 100) / 100 : 0,
        },
        stats,
      };

      return reply.code(statusCode).send(response);
    });
  };
}
