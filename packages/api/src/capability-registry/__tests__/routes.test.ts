/**
 * Routes Integration Tests (with Fastify and Mock Registry)
 */

import Fastify, { FastifyInstance } from 'fastify';
import { MockCapabilityRegistry } from '../mocks';
import { createRegistryRoutes } from '../routes';
import type { BotCapability } from '@clawteam/shared/types';

describe('Routes', () => {
  let app: FastifyInstance;
  let registry: MockCapabilityRegistry;

  const sampleCapability: BotCapability = {
    name: 'code_search',
    description: 'Search code in repository',
    async: false,
    estimatedTime: '5s',
  };

  // Seed bot key for authenticating register requests
  let seedApiKey: string;

  beforeAll(async () => {
    registry = new MockCapabilityRegistry();
    app = Fastify();
    await app.register(createRegistryRoutes({ registry }), { prefix: '/api/v1' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    registry.reset();
    // Create a seed bot for auth (register endpoint now requires auth)
    const seed = await registry.register({
      name: 'seed-bot',
      capabilities: [sampleCapability],
    });
    seedApiKey = registry.getApiKeyForBot(seed.botId)!;
  });

  // Helper to register a bot via HTTP with auth
  async function registerBotViaHttp(name: string, extra: Record<string, any> = {}) {
    return app.inject({
      method: 'POST',
      url: '/api/v1/bots/register',
      headers: {
        authorization: `Bearer ${seedApiKey}`,
      },
      payload: {
        name,
        capabilities: [sampleCapability],
        ...extra,
      },
    });
  }

  describe('POST /api/v1/bots/register', () => {
    it('should register a bot', async () => {
      const response = await registerBotViaHttp('test-bot', { tags: ['frontend'] });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.botId).toBeDefined();
      expect(body.traceId).toBeDefined();
    });
  });

  describe('GET /api/v1/bots/:botId', () => {
    it('should get bot information', async () => {
      const registerResponse = await registerBotViaHttp('test-bot');
      const { botId } = JSON.parse(registerResponse.payload).data;

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/bots/${botId}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(botId);
      expect(body.data.name).toBe('test-bot');
      // Should not expose apiKeyHash
      expect(body.data.apiKeyHash).toBeUndefined();
    });

    it('should return 404 for non-existent bot', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/bots/non-existent-id',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PUT /api/v1/bots/:botId/capabilities', () => {
    it('should update bot capabilities', async () => {
      const registerResponse = await registerBotViaHttp('test-bot');
      const { botId } = JSON.parse(registerResponse.payload).data;
      const apiKey = registry.getApiKeyForBot(botId)!;

      const newCapability: BotCapability = {
        name: 'run_tests',
        description: 'Run tests',
        async: true,
        estimatedTime: '2m',
      };

      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/bots/${botId}/capabilities`,
        headers: {
          authorization: `Bearer ${apiKey}`,
        },
        payload: {
          capabilities: [newCapability],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.capabilitiesCount).toBe(1);
    });
  });

  describe('PUT /api/v1/bots/:botId/status', () => {
    it('should update bot status', async () => {
      const registerResponse = await registerBotViaHttp('test-bot');
      const { botId } = JSON.parse(registerResponse.payload).data;
      const apiKey = registry.getApiKeyForBot(botId)!;

      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/bots/${botId}/status`,
        headers: {
          authorization: `Bearer ${apiKey}`,
        },
        payload: {
          status: 'busy',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('busy');
    });
  });

  describe('POST /api/v1/bots/:botId/heartbeat', () => {
    it('should record heartbeat', async () => {
      const registerResponse = await registerBotViaHttp('test-bot');
      const { botId } = JSON.parse(registerResponse.payload).data;
      const apiKey = registry.getApiKeyForBot(botId)!;

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
      expect(body.data.lastSeen).toBeDefined();
    });
  });

  describe('POST /api/v1/capabilities/search', () => {
    it('should search capabilities', async () => {
      await registerBotViaHttp('search-bot', { tags: ['frontend'] });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/capabilities/search',
        payload: {
          query: 'code search',
          filters: {
            tags: ['frontend'],
          },
          page: 1,
          pageSize: 10,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.items).toBeDefined();
      expect(Array.isArray(body.data.items)).toBe(true);
      expect(body.data.total).toBeGreaterThanOrEqual(0);
      expect(body.data.page).toBe(1);
    });
  });

  describe('GET /api/v1/capabilities/:capabilityName/bots', () => {
    it('should find bots by capability', async () => {
      await registerBotViaHttp('test-bot');

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/capabilities/code_search/bots',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.bots.length).toBeGreaterThanOrEqual(1);
    });
  });
});
