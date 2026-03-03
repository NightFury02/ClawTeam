/**
 * CapabilitySearcher Tests (using MockCapabilityRegistry)
 */

import { MockCapabilityRegistry } from '../mocks';
import type { BotCapability } from '@clawteam/shared/types';

describe('Searcher (via MockCapabilityRegistry)', () => {
  let registry: MockCapabilityRegistry;

  const codeSearchCapability: BotCapability = {
    name: 'code_search',
    description: 'Search for code in the repository',
    async: false,
    estimatedTime: '5s',
  };

  const runTestsCapability: BotCapability = {
    name: 'run_tests',
    description: 'Run the test suite',
    async: true,
    estimatedTime: '2m',
  };

  const dataQueryCapability: BotCapability = {
    name: 'data_query',
    description: 'Execute SQL queries on the database',
    async: false,
    estimatedTime: '3s',
  };

  beforeEach(async () => {
    registry = new MockCapabilityRegistry();

    // Register test bots
    await registry.register({
      name: 'frontend-bot',
      ownerEmail: 'frontend@example.com',
      capabilities: [codeSearchCapability, runTestsCapability],
      tags: ['frontend', 'react', 'typescript'],
    });

    await registry.register({
      name: 'backend-bot',
      ownerEmail: 'backend@example.com',
      capabilities: [dataQueryCapability, runTestsCapability],
      tags: ['backend', 'node', 'sql'],
    });

    await registry.register({
      name: 'data-bot',
      ownerEmail: 'data@example.com',
      capabilities: [dataQueryCapability],
      tags: ['data', 'analytics', 'sql'],
    });
  });

  describe('search', () => {
    it('should find capabilities by name', async () => {
      const results = await registry.search({ query: 'code_search' });

      expect(results.items.length).toBeGreaterThan(0);
      expect(results.items[0].capability.name).toBe('code_search');
    });

    it('should find capabilities by description', async () => {
      const results = await registry.search({ query: 'SQL queries' });

      expect(results.items.length).toBeGreaterThan(0);
      const hasDataQuery = results.items.some((m) => m.capability.name === 'data_query');
      expect(hasDataQuery).toBe(true);
    });

    it('should return confidence scores', async () => {
      const results = await registry.search({ query: 'run tests' });

      expect(results.items.length).toBeGreaterThan(0);
      for (const match of results.items) {
        expect(match.confidence).toBeGreaterThanOrEqual(0);
        expect(match.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should sort by confidence (descending)', async () => {
      const results = await registry.search({ query: 'code search' });

      for (let i = 1; i < results.items.length; i++) {
        expect(results.items[i - 1].confidence).toBeGreaterThanOrEqual(results.items[i].confidence);
      }
    });

    it('should paginate results', async () => {
      const page1 = await registry.search({ query: 'run', page: 1, pageSize: 1 });
      const page2 = await registry.search({ query: 'run', page: 2, pageSize: 1 });

      if (page1.total > 1) {
        expect(page1.items[0].botId).not.toBe(page2.items[0]?.botId);
      }
      expect(page1.page).toBe(1);
      expect(page2.page).toBe(2);
    });

    it('should set hasMore correctly', async () => {
      const results = await registry.search({ query: 'run', page: 1, pageSize: 1 });

      if (results.total > 1) {
        expect(results.hasMore).toBe(true);
      }
    });
  });

  describe('search with filters', () => {
    it('should filter by tags', async () => {
      const results = await registry.search({
        query: 'run_tests',
        filters: { tags: ['frontend'] },
      });

      expect(results.items.length).toBeGreaterThan(0);
      expect(results.items[0].botName).toBe('frontend-bot');
    });

    it('should filter by async', async () => {
      const asyncResults = await registry.search({
        query: 'run',
        filters: { async: true },
      });

      const syncResults = await registry.search({
        query: 'run',
        filters: { async: false },
      });

      for (const match of asyncResults.items) {
        expect(match.capability.async).toBe(true);
      }

      for (const match of syncResults.items) {
        expect(match.capability.async).toBe(false);
      }
    });

    it('should filter by maxResponseTime', async () => {
      const results = await registry.search({
        query: 'data',
        filters: { maxResponseTime: '10s' },
      });

      // data_query has 3s, should be included
      // run_tests has 2m, should be excluded if matched
      for (const match of results.items) {
        // All matches should have estimatedTime <= 10s
        const time = match.capability.estimatedTime;
        expect(['1s', '2s', '3s', '4s', '5s', '6s', '7s', '8s', '9s', '10s']).toContain(time);
      }
    });

    it('should combine multiple filters', async () => {
      const results = await registry.search({
        query: 'data',
        filters: {
          tags: ['sql'],
          async: false,
          maxResponseTime: '10s',
        },
      });

      for (const match of results.items) {
        expect(match.capability.async).toBe(false);
      }
    });
  });

  describe('findByCapability', () => {
    it('should find bots by exact capability name', async () => {
      const bots = await registry.findByCapability('run_tests');

      expect(bots).toHaveLength(2);
      const names = bots.map((b) => b.name);
      expect(names).toContain('frontend-bot');
      expect(names).toContain('backend-bot');
    });

    it('should return empty array for unknown capability', async () => {
      const bots = await registry.findByCapability('unknown_capability');
      expect(bots).toHaveLength(0);
    });
  });

  describe('offline bots', () => {
    it('should exclude offline bots from search', async () => {
      const { botId } = await registry.register({
        name: 'offline-bot',
        ownerEmail: 'offline@example.com',
        capabilities: [codeSearchCapability],
        tags: ['test'],
      });

      await registry.updateStatus(botId, 'offline');

      const results = await registry.search({ query: 'code_search' });

      const hasOfflineBot = results.items.some((m) => m.botName === 'offline-bot');
      expect(hasOfflineBot).toBe(false);
    });
  });
});
