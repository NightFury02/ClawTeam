/**
 * Authentication Middleware Tests
 */

import Fastify, { FastifyInstance } from 'fastify';
import { MockCapabilityRegistry } from '../mocks';
import { createRegistryRoutes } from '../routes';
import type { BotCapability } from '@clawteam/shared/types';

describe('Auth Middleware', () => {
  let app: FastifyInstance;
  let registry: MockCapabilityRegistry;

  const sampleCapability: BotCapability = {
    name: 'code_search',
    description: 'Search code in repository',
    async: false,
    estimatedTime: '5s',
  };

  beforeAll(async () => {
    registry = new MockCapabilityRegistry();
    app = Fastify();
    await app.register(createRegistryRoutes({ registry }), { prefix: '/api/v1' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    registry.reset();
  });

  // Helper to register a bot and return botId + apiKey (via mock helper)
  async function registerBot(name = 'test-bot') {
    const result = await registry.register({
      name,
      ownerEmail: 'test@example.com',
      capabilities: [sampleCapability],
    });
    const apiKey = registry.getApiKeyForBot(result.botId)!;
    return { botId: result.botId, apiKey };
  }

  describe('PUT /api/v1/bots/:botId/capabilities', () => {
    it('should return 401 without Authorization header', async () => {
      const { botId } = await registerBot();

      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/bots/${botId}/capabilities`,
        payload: {
          capabilities: [sampleCapability],
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(false);
    });

    it('should return 401 with invalid API key', async () => {
      const { botId } = await registerBot();

      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/bots/${botId}/capabilities`,
        headers: {
          authorization: 'Bearer invalid-key-12345',
        },
        payload: {
          capabilities: [sampleCapability],
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(false);
    });

    it('should return 200 with valid API key', async () => {
      const { botId, apiKey } = await registerBot();

      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/bots/${botId}/capabilities`,
        headers: {
          authorization: `Bearer ${apiKey}`,
        },
        payload: {
          capabilities: [sampleCapability],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
    });

    it('should return 401 with malformed header (no Bearer prefix)', async () => {
      const { botId, apiKey } = await registerBot();

      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/bots/${botId}/capabilities`,
        headers: {
          authorization: apiKey,
        },
        payload: {
          capabilities: [sampleCapability],
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(false);
    });
  });

  describe('PUT /api/v1/bots/:botId/status', () => {
    it('should return 401 without auth', async () => {
      const { botId } = await registerBot();

      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/bots/${botId}/status`,
        payload: { status: 'busy' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 200 with valid auth', async () => {
      const { botId, apiKey } = await registerBot();

      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/bots/${botId}/status`,
        headers: {
          authorization: `Bearer ${apiKey}`,
        },
        payload: { status: 'busy' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('busy');
    });
  });

  describe('POST /api/v1/bots/:botId/heartbeat', () => {
    it('should return 401 without auth', async () => {
      const { botId } = await registerBot();

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/bots/${botId}/heartbeat`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 200 with valid auth', async () => {
      const { botId, apiKey } = await registerBot();

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/bots/${botId}/heartbeat`,
        headers: {
          authorization: `Bearer ${apiKey}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.botId).toBe(botId);
    });
  });

  describe('Auth-required endpoints', () => {
    it('POST /register should require auth (user-level key)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/bots/register',
        payload: {
          name: 'new-bot',
          capabilities: [sampleCapability],
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('POST /register should succeed with valid bot-level key (fallback)', async () => {
      // Register a bot first via mock to get a valid key
      const { apiKey } = await registerBot('seed-bot');

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/bots/register',
        headers: {
          authorization: `Bearer ${apiKey}`,
        },
        payload: {
          name: 'new-bot',
          capabilities: [sampleCapability],
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.botId).toBeDefined();
    });
  });

  describe('Public endpoints (no auth required)', () => {
    it('GET /:botId should work without auth', async () => {
      const { botId } = await registerBot();

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/bots/${botId}`,
      });

      expect(response.statusCode).toBe(200);
    });

    it('POST /capabilities/search should work without auth', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/capabilities/search',
        payload: {
          query: 'code search',
          page: 1,
          pageSize: 10,
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });
});
