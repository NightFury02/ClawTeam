/**
 * BotRegistrar Tests (using MockCapabilityRegistry)
 */

import { MockCapabilityRegistry } from '../mocks';
import type { BotCapability } from '@clawteam/shared/types';
import { BotNotFoundError } from '../errors';

describe('Registry (via MockCapabilityRegistry)', () => {
  let registry: MockCapabilityRegistry;

  const sampleCapability: BotCapability = {
    name: 'code_search',
    description: 'Search code in repository',
    async: false,
    estimatedTime: '5s',
  };

  beforeEach(() => {
    registry = new MockCapabilityRegistry();
  });

  describe('register', () => {
    it('should register a bot successfully', async () => {
      const result = await registry.register({
        name: 'test-bot',
        ownerEmail: 'test@example.com',
        capabilities: [sampleCapability],
        tags: ['frontend', 'react'],
      });

      expect(result.botId).toBeDefined();
    });

    it('should store bot with correct properties', async () => {
      const result = await registry.register({
        name: 'my-bot',
        ownerEmail: 'owner@example.com',
        capabilities: [sampleCapability],
        tags: ['test'],
        availability: {
          timezone: 'UTC-8',
          workingHours: '09:00-18:00',
          autoRespond: true,
        },
      });

      const bot = await registry.getBot(result.botId);
      expect(bot).not.toBeNull();
      expect(bot!.name).toBe('my-bot');
      expect(bot!.ownerEmail).toBe('owner@example.com');
      expect(bot!.status).toBe('online');
      expect(bot!.capabilities).toHaveLength(1);
      expect(bot!.tags).toEqual(['test']);
      expect(bot!.availability.timezone).toBe('UTC-8');
    });
  });

  describe('getBot', () => {
    it('should return bot by ID', async () => {
      const { botId } = await registry.register({
        name: 'test-bot',
        ownerEmail: 'test@example.com',
        capabilities: [sampleCapability],
      });

      const bot = await registry.getBot(botId);
      expect(bot).not.toBeNull();
      expect(bot!.id).toBe(botId);
    });

    it('should return null for non-existent bot', async () => {
      const bot = await registry.getBot('non-existent-id');
      expect(bot).toBeNull();
    });
  });

  describe('updateCapabilities', () => {
    it('should update bot capabilities', async () => {
      const { botId } = await registry.register({
        name: 'test-bot',
        ownerEmail: 'test@example.com',
        capabilities: [sampleCapability],
      });

      const newCapability: BotCapability = {
        name: 'run_tests',
        description: 'Run test suite',
        async: true,
        estimatedTime: '2m',
      };

      const result = await registry.updateCapabilities(botId, [newCapability]);
      expect(result.capabilitiesCount).toBe(1);

      const bot = await registry.getBot(botId);
      expect(bot!.capabilities[0].name).toBe('run_tests');
    });

    it('should throw for non-existent bot', async () => {
      await expect(
        registry.updateCapabilities('non-existent', [sampleCapability])
      ).rejects.toThrow(BotNotFoundError);
    });
  });

  describe('updateStatus', () => {
    it('should update bot status', async () => {
      const { botId } = await registry.register({
        name: 'test-bot',
        ownerEmail: 'test@example.com',
        capabilities: [sampleCapability],
      });

      await registry.updateStatus(botId, 'busy');

      const bot = await registry.getBot(botId);
      expect(bot!.status).toBe('busy');
    });

    it('should throw for non-existent bot', async () => {
      await expect(
        registry.updateStatus('non-existent', 'offline')
      ).rejects.toThrow(BotNotFoundError);
    });
  });

  describe('heartbeat', () => {
    it('should update lastSeen and return status', async () => {
      const { botId } = await registry.register({
        name: 'test-bot',
        ownerEmail: 'test@example.com',
        capabilities: [sampleCapability],
      });

      const result = await registry.heartbeat(botId);
      expect(result.botId).toBe(botId);
      expect(result.status).toBe('online');
      expect(result.lastSeen).toBeDefined();
    });

    it('should throw for non-existent bot', async () => {
      await expect(registry.heartbeat('non-existent')).rejects.toThrow(BotNotFoundError);
    });
  });

  describe('test helpers', () => {
    it('should allow adding custom invite codes', async () => {
      registry.addInviteCode('custom-code', 'team-123', 'custom-team');

      const result = await registry.register({
        name: 'test-bot',
        ownerEmail: 'test@example.com',
        capabilities: [sampleCapability],
      });

      const bot = await registry.getBot(result.botId);
      expect(bot!.teamId).toBe('team-123');
    });

    it('should reset all state', async () => {
      await registry.register({
        name: 'test-bot',
        ownerEmail: 'test@example.com',
        capabilities: [sampleCapability],
      });

      expect(registry.getBotCount()).toBe(1);

      registry.reset();

      expect(registry.getBotCount()).toBe(0);
    });

    it('should return all bots', async () => {
      await registry.register({
        name: 'bot-1',
        ownerEmail: 'test@example.com',
        capabilities: [sampleCapability],
      });

      await registry.register({
        name: 'bot-2',
        ownerEmail: 'test@example.com',
        capabilities: [sampleCapability],
      });

      const bots = registry.getAllBots();
      expect(bots).toHaveLength(2);
    });
  });
});
