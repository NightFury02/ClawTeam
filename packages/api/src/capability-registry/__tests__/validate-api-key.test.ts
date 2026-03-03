/**
 * validateApiKey Unit Tests
 */

import { MockCapabilityRegistry } from '../mocks';
import type { BotCapability } from '@clawteam/shared/types';

describe('validateApiKey', () => {
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

  it('should return the correct bot for a valid API key', async () => {
    const result = await registry.register({
      name: 'test-bot',
      ownerEmail: 'test@example.com',
      capabilities: [sampleCapability],
    });

    const apiKey = registry.getApiKeyForBot(result.botId)!;
    const bot = await registry.validateApiKey(apiKey);
    expect(bot).not.toBeNull();
    expect(bot!.id).toBe(result.botId);
    expect(bot!.name).toBe('test-bot');
  });

  it('should return null for an invalid API key', async () => {
    await registry.register({
      name: 'test-bot',
      ownerEmail: 'test@example.com',
      capabilities: [sampleCapability],
    });

    const bot = await registry.validateApiKey('invalid-key-12345');
    expect(bot).toBeNull();
  });

  it('should return null for an empty string', async () => {
    const bot = await registry.validateApiKey('');
    expect(bot).toBeNull();
  });

  it('should distinguish between different bots API keys', async () => {
    const result1 = await registry.register({
      name: 'bot-one',
      ownerEmail: 'one@example.com',
      capabilities: [sampleCapability],
    });

    const result2 = await registry.register({
      name: 'bot-two',
      ownerEmail: 'two@example.com',
      capabilities: [sampleCapability],
    });

    const key1 = registry.getApiKeyForBot(result1.botId)!;
    const key2 = registry.getApiKeyForBot(result2.botId)!;

    const bot1 = await registry.validateApiKey(key1);
    const bot2 = await registry.validateApiKey(key2);

    expect(bot1).not.toBeNull();
    expect(bot2).not.toBeNull();
    expect(bot1!.id).toBe(result1.botId);
    expect(bot2!.id).toBe(result2.botId);
    expect(bot1!.id).not.toBe(bot2!.id);
  });
});
