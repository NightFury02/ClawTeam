/**
 * Capability Registry Performance Tests
 *
 * Validates performance requirements for validateApiKey and search operations.
 * Requires: docker-compose up -d postgres && npm run migrate:up
 *
 * Performance targets:
 * - validateApiKey: P50 < 20ms, P95 < 50ms, P99 < 100ms
 * - Concurrent validation: 100 parallel < 1 second
 * - search: P95 < 100ms
 */

import type { BotCapability } from '@clawteam/shared/types';
import { BotRegistrar } from '../../registry';
import { CapabilitySearcher } from '../../searcher';
import { BotRepository, CapabilityIndexRepository, UserRepository } from '../../repository';
import { NullCache } from '../../cache';
import type { ICapabilityRegistry } from '../../interface';
import { getTestDatabase, cleanDatabase, seedTestTeam, seedTestUser, closeTestDatabase } from './setup';
import { hashApiKey } from '../../utils/api-key';

describe('Capability Registry Performance Tests', () => {
  let registry: ICapabilityRegistry;
  let testApiKey: string;
  let testApiKeyHash: string;

  const logger = {
    info: () => {},
    error: () => {},
    warn: () => {},
    debug: () => {},
    child: function () { return this; },
  } as any;

  const sampleCapability: BotCapability = {
    name: 'code_search',
    description: 'Search code in repository',
    async: false,
    estimatedTime: '5s',
  };

  beforeAll(async () => {
    await cleanDatabase();
    await seedTestTeam();
    const { apiKey } = await seedTestUser();
    testApiKey = apiKey;
    testApiKeyHash = hashApiKey(apiKey);

    const db = getTestDatabase();
    const botRepo = new BotRepository(db);
    const indexRepo = new CapabilityIndexRepository(db);
    const userRepo = new UserRepository(db);
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

    // Register a test bot
    await registry.register({
      name: 'perf_test_bot',
      capabilities: [sampleCapability],
    });
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  describe('validateApiKey Performance', () => {
    it('should complete in < 50ms (P95)', async () => {
      const times: number[] = [];

      // Warm up (first few calls may be slower)
      for (let i = 0; i < 5; i++) {
        await registry.validateApiKey(testApiKey);
      }

      // Run 100 times
      for (let i = 0; i < 100; i++) {
        const start = Date.now();
        await registry.validateApiKey(testApiKey);
        const duration = Date.now() - start;
        times.push(duration);
      }

      // Calculate P50, P95, P99
      times.sort((a, b) => a - b);
      const p50 = times[Math.floor(times.length * 0.5)];
      const p95 = times[Math.floor(times.length * 0.95)];
      const p99 = times[Math.floor(times.length * 0.99)];

      console.log(`validateApiKey Performance:
        P50: ${p50}ms
        P95: ${p95}ms
        P99: ${p99}ms
      `);

      expect(p50).toBeLessThan(20);  // P50 < 20ms
      expect(p95).toBeLessThan(50);  // P95 < 50ms
      expect(p99).toBeLessThan(100); // P99 < 100ms
    });

    it('should handle concurrent requests (100 parallel)', async () => {
      const start = Date.now();

      const promises = Array.from({ length: 100 }, () =>
        registry.validateApiKey(testApiKey)
      );

      const results = await Promise.all(promises);
      const duration = Date.now() - start;

      console.log(`100 concurrent validateApiKey: ${duration}ms`);

      expect(results).toHaveLength(100);
      expect(results.every((bot) => bot !== null)).toBe(true);
      expect(duration).toBeLessThan(1000); // 100 concurrent requests < 1 second
    });

    it('should handle invalid key efficiently', async () => {
      const times: number[] = [];

      for (let i = 0; i < 50; i++) {
        const start = Date.now();
        await registry.validateApiKey('invalid-key-' + i);
        const duration = Date.now() - start;
        times.push(duration);
      }

      times.sort((a, b) => a - b);
      const p95 = times[Math.floor(times.length * 0.95)];

      console.log(`validateApiKey (invalid) P95: ${p95}ms`);

      expect(p95).toBeLessThan(50); // Invalid key validation should also be fast
    });
  });

  describe('search Performance', () => {
    beforeAll(async () => {
      // Register 20 bots with 3 capabilities each for search tests
      for (let i = 0; i < 20; i++) {
        await registry.register({
          name: `search_bot_${i}`,
          capabilities: [
            {
              name: `capability_${i}_search`,
              description: 'Search functionality for testing',
              async: false,
              estimatedTime: '5s',
            },
            {
              name: `capability_${i}_process`,
              description: 'Process data for analysis',
              async: true,
              estimatedTime: '30s',
            },
            {
              name: `capability_${i}_export`,
              description: 'Export results to file',
              async: false,
              estimatedTime: '10s',
            },
          ],
          tags: ['performance', 'test', `group-${i % 5}`],
        });
      }

      // Small delay to allow async indexing
      await new Promise((r) => setTimeout(r, 500));
    });

    it('should complete search in < 100ms (P95)', async () => {
      const times: number[] = [];

      // Warm up
      for (let i = 0; i < 3; i++) {
        await registry.search({ query: 'search', page: 1, pageSize: 10 });
      }

      // Run 50 times with different queries
      const queries = ['search', 'process', 'export', 'data', 'analysis'];
      for (let i = 0; i < 50; i++) {
        const query = queries[i % queries.length];
        const start = Date.now();
        await registry.search({ query, page: 1, pageSize: 10 });
        const duration = Date.now() - start;
        times.push(duration);
      }

      times.sort((a, b) => a - b);
      const p50 = times[Math.floor(times.length * 0.5)];
      const p95 = times[Math.floor(times.length * 0.95)];

      console.log(`search Performance:
        P50: ${p50}ms
        P95: ${p95}ms
      `);

      expect(p95).toBeLessThan(100); // P95 < 100ms
    });

    it('should handle search with filters efficiently', async () => {
      const times: number[] = [];

      for (let i = 0; i < 30; i++) {
        const start = Date.now();
        await registry.search({
          query: 'capability',
          filters: {
            tags: ['performance'],
            async: i % 2 === 0,
          },
          page: 1,
          pageSize: 10,
        });
        const duration = Date.now() - start;
        times.push(duration);
      }

      times.sort((a, b) => a - b);
      const p95 = times[Math.floor(times.length * 0.95)];

      console.log(`search with filters P95: ${p95}ms`);

      expect(p95).toBeLessThan(150); // Filtered search P95 < 150ms
    });

    it('should handle findByCapability efficiently', async () => {
      const times: number[] = [];

      for (let i = 0; i < 30; i++) {
        const capName = `capability_${i % 20}_search`;
        const start = Date.now();
        await registry.findByCapability(capName);
        const duration = Date.now() - start;
        times.push(duration);
      }

      times.sort((a, b) => a - b);
      const p95 = times[Math.floor(times.length * 0.95)];

      console.log(`findByCapability P95: ${p95}ms`);

      expect(p95).toBeLessThan(50); // P95 < 50ms
    });
  });
});
