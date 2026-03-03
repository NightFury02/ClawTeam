/**
 * Health Check Endpoint Tests
 *
 * Tests the /health endpoint for the Message Bus service.
 */

import Fastify, { FastifyInstance } from 'fastify';
import messageBusPlugin from '../plugin';
import { MockCapabilityRegistry } from '../../capability-registry/mocks';

describe('Health Check Endpoint', () => {
  let app: FastifyInstance;
  let registry: MockCapabilityRegistry;

  beforeAll(async () => {
    registry = new MockCapabilityRegistry();

    app = Fastify({ logger: false });

    await app.register(messageBusPlugin, {
      enablePubSub: false, // Disable Redis for basic health check test
      registry,
    });

    await app.listen({ port: 0, host: '127.0.0.1' });
  });

  afterAll(async () => {
    await app.close();
  });

  test('GET /health returns 200 with healthy status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body.status).toBe('healthy');
    expect(body.service).toBe('message-bus');
    expect(body.timestamp).toBeDefined();
    expect(body.version).toBeDefined();
  });

  test('health check includes Redis status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    const body = JSON.parse(response.body);
    expect(body.checks).toBeDefined();
    expect(body.checks.redis).toBeDefined();
    expect(body.checks.redis.status).toBe('disabled'); // Redis not enabled
    expect(body.checks.redis.details).toBeDefined();
  });

  test('health check includes WebSocket status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    const body = JSON.parse(response.body);
    expect(body.checks.websocket).toBeDefined();
    expect(body.checks.websocket.status).toBe('healthy');
    expect(body.checks.websocket.activeConnections).toBeDefined();
    expect(typeof body.checks.websocket.activeConnections).toBe('number');
  });

  test('health check includes uptime', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    const body = JSON.parse(response.body);
    expect(body.uptime).toBeDefined();
    expect(typeof body.uptime).toBe('number');
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });

  test('health check includes memory usage', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    const body = JSON.parse(response.body);
    expect(body.memory).toBeDefined();
    expect(body.memory.used).toBeDefined();
    expect(body.memory.total).toBeDefined();
    expect(body.memory.percentage).toBeDefined();
    expect(typeof body.memory.used).toBe('number');
    expect(typeof body.memory.total).toBe('number');
    expect(typeof body.memory.percentage).toBe('number');
  });
});

describe('Health Check with Redis Enabled', () => {
  let app: FastifyInstance;
  let registry: MockCapabilityRegistry;

  const REDIS_CONFIG = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  };

  beforeAll(async () => {
    registry = new MockCapabilityRegistry();

    app = Fastify({ logger: false });

    await app.register(messageBusPlugin, {
      enablePubSub: true,
      redis: REDIS_CONFIG,
      registry,
    });

    await app.listen({ port: 0, host: '127.0.0.1' });
  });

  afterAll(async () => {
    await app.close();
  });

  test('health check shows Redis status when enabled', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    const body = JSON.parse(response.body);
    expect(body.checks.redis.status).toMatch(/healthy|unhealthy/);

    // If Redis is available, status should be healthy
    // If not available, status should be unhealthy and overall should be degraded
    if (body.checks.redis.status === 'healthy') {
      expect(body.status).toBe('healthy');
      expect(body.checks.redis.responseTime).toBeGreaterThanOrEqual(0);
    } else {
      expect(body.status).toBe('degraded');
      expect(body.checks.redis.details).toContain('unavailable');
    }
  });

  test('degraded status when Redis is unavailable', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    const body = JSON.parse(response.body);

    // If Redis is not available, overall status should be degraded
    if (body.checks.redis.status === 'unhealthy') {
      expect(body.status).toBe('degraded');
      expect(response.statusCode).toBe(200); // Still returns 200 (degraded mode)
    }
  });
});
