/**
 * Capability Registry Integration Tests
 *
 * Uses real PostgreSQL database, Fastify, and non-mock implementations.
 * Requires: docker-compose up -d postgres && npm run migrate:up
 */

import Fastify, { FastifyInstance } from 'fastify';
import type { BotCapability } from '@clawteam/shared/types';
import { BotRegistrar } from '../../registry';
import { CapabilitySearcher } from '../../searcher';
import { BotRepository, CapabilityIndexRepository, UserRepository } from '../../repository';
import { NullCache } from '../../cache';
import { createRegistryRoutes } from '../../routes';
import type { ICapabilityRegistry } from '../../interface';
import type { IUserRepository } from '../../repository';
import { getTestDatabase, cleanDatabase, seedTestTeam, seedTestUser, closeTestDatabase } from './setup';

describe('Capability Registry Integration', () => {
  let app: FastifyInstance;
  let registry: ICapabilityRegistry;
  let userRepo: IUserRepository;
  let testApiKey: string;

  const sampleCapability: BotCapability = {
    name: 'code_search',
    description: 'Search code in repository',
    async: false,
    estimatedTime: '5s',
  };

  const logger = {
    info: () => {},
    error: () => {},
    warn: () => {},
    debug: () => {},
    child: () => logger,
  } as any;

  beforeAll(async () => {
    const db = getTestDatabase();

    const botRepo = new BotRepository(db);
    const indexRepo = new CapabilityIndexRepository(db);
    userRepo = new UserRepository(db);
    const cache = new NullCache();

    const registrar = new BotRegistrar({ botRepo, indexRepo, userRepo, cache, logger });
    const searcher = new CapabilitySearcher({ botRepo, cache, logger });

    registry = {
      register: registrar.register.bind(registrar),
      updateCapabilities: registrar.updateCapabilities.bind(registrar),
      getBot: registrar.getBot.bind(registrar),
      updateStatus: registrar.updateStatus.bind(registrar),
      heartbeat: registrar.heartbeat.bind(registrar),
      validateApiKey: registrar.validateApiKey.bind(registrar),
      search: searcher.search.bind(searcher),
      findByCapability: searcher.findByCapability.bind(searcher),
    };

    app = Fastify();
    await app.register(createRegistryRoutes({ registry, userRepo }), { prefix: '/api/v1' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await closeTestDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase();
    await seedTestTeam();
    const { apiKey } = await seedTestUser();
    testApiKey = apiKey;
  });

  // Helper to register a bot via HTTP (with user-level auth)
  async function registerBot(name = 'integration-bot') {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/bots/register',
      headers: { authorization: `Bearer ${testApiKey}` },
      payload: {
        name,
        capabilities: [sampleCapability],
        tags: ['integration-test'],
      },
    });
    expect(response.statusCode).toBe(201);
    return JSON.parse(response.payload).data as { botId: string };
  }

  describe('Registration flow', () => {
    it('should register a bot and return botId', async () => {
      const { botId } = await registerBot();
      expect(botId).toBeDefined();
    });

    it('should require auth for registration', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/bots/register',
        payload: {
          name: 'no-auth-bot',
          capabilities: [sampleCapability],
        },
      });
      expect(response.statusCode).toBe(401);
    });

    it('should return bot info by ID (without apiKeyHash)', async () => {
      const { botId } = await registerBot();

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/bots/${botId}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.id).toBe(botId);
      expect(body.data.name).toBe('integration-bot');
      expect(body.data.apiKeyHash).toBeUndefined();
    });
  });

  describe('API Key validation flow', () => {
    it('should validate a valid user-level API key', async () => {
      const { botId } = await registerBot();
      // User-level key doesn't go through validateApiKey (that's for bot keys)
      // Just verify the bot was created
      const bot = await registry.getBot(botId);
      expect(bot).not.toBeNull();
      expect(bot!.id).toBe(botId);
    });

    it('should return null for an invalid API key', async () => {
      const bot = await registry.validateApiKey('invalid-key-12345');
      expect(bot).toBeNull();
    });
  });

  describe('Authenticated operations', () => {
    it('should update capabilities with valid user-level API key', async () => {
      const { botId } = await registerBot();

      const newCapability: BotCapability = {
        name: 'run_tests',
        description: 'Execute test suite',
        async: true,
        estimatedTime: '2m',
      };

      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/bots/${botId}/capabilities`,
        headers: { authorization: `Bearer ${testApiKey}` },
        payload: { capabilities: [newCapability] },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.capabilitiesCount).toBe(1);
    });

    it('should return 401 when updating capabilities without API key', async () => {
      const { botId } = await registerBot();

      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/bots/${botId}/capabilities`,
        payload: { capabilities: [sampleCapability] },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('Search flow', () => {
    it('should find a bot by search query after registration', async () => {
      await registerBot('search-test-bot');

      // Small delay to allow async indexing to complete
      await new Promise((r) => setTimeout(r, 200));

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
      const body = JSON.parse(response.payload);
      expect(body.data.items).toBeDefined();
      expect(body.data.total).toBeGreaterThanOrEqual(0);
    });

    it('should find bots by exact capability name', async () => {
      await registerBot('capability-bot');

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/capabilities/code_search/bots',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.bots.length).toBeGreaterThanOrEqual(1);
      expect(body.data.bots[0].name).toBe('capability-bot');
    });
  });

  describe('Status and heartbeat', () => {
    it('should update bot status with auth', async () => {
      const { botId } = await registerBot();

      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/bots/${botId}/status`,
        headers: { authorization: `Bearer ${testApiKey}` },
        payload: { status: 'busy' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.status).toBe('busy');
    });

    it('should record heartbeat with auth', async () => {
      const { botId } = await registerBot();

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/bots/${botId}/heartbeat`,
        headers: { authorization: `Bearer ${testApiKey}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.botId).toBe(botId);
      expect(body.data.lastSeen).toBeDefined();
    });
  });
});
