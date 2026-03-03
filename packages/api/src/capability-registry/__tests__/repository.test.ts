/**
 * Repository Tests (with Mock Database)
 */

import type { Bot, BotCapability } from '@clawteam/shared/types';
import type { IBotRepository, ICapabilityIndexRepository } from '../repository';
import type { BotCreateInput, CapabilityIndexInput, TeamRow } from '../types';
import { BotNotFoundError } from '../errors';

/**
 * Mock Bot Repository for testing
 */
class MockBotRepository implements IBotRepository {
  private bots = new Map<string, Bot>();
  private counter = 0;
  private defaultTeam: TeamRow = {
    id: 'team-001',
    name: 'Test Team',
    slug: 'test-team',
    created_at: new Date(),
    updated_at: new Date(),
  };

  async create(input: BotCreateInput): Promise<Bot> {
    const id = `bot-${++this.counter}`;
    const bot: Bot = {
      id,
      teamId: input.teamId,
      name: input.name,
      ownerEmail: input.ownerEmail ?? undefined,
      apiKeyHash: input.apiKeyHash ?? undefined,
      status: 'online',
      capabilities: input.capabilities,
      tags: input.tags,
      availability: input.availability ?? {
        timezone: 'UTC',
        workingHours: '00:00-24:00',
        autoRespond: false,
      },
      createdAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    };
    this.bots.set(id, bot);
    return bot;
  }

  async findById(botId: string): Promise<Bot | null> {
    return this.bots.get(botId) ?? null;
  }

  async findByTeamAndName(teamId: string, name: string): Promise<Bot | null> {
    for (const bot of this.bots.values()) {
      if (bot.teamId === teamId && bot.name === name) {
        return bot;
      }
    }
    return null;
  }

  async findByApiKeyHash(hash: string): Promise<Bot | null> {
    for (const bot of this.bots.values()) {
      if (bot.apiKeyHash === hash) {
        return bot;
      }
    }
    return null;
  }

  async findByUserId(_userId: string): Promise<Bot | null> {
    return null;
  }

  async update(botId: string, fields: Partial<Bot>): Promise<Bot> {
    const bot = this.bots.get(botId);
    if (!bot) throw new BotNotFoundError(botId);
    const updated = { ...bot, ...fields };
    this.bots.set(botId, updated);
    return updated;
  }

  async updateCapabilities(botId: string, capabilities: BotCapability[]): Promise<Bot> {
    return this.update(botId, { capabilities });
  }

  async updateStatus(botId: string, status: Bot['status']): Promise<void> {
    await this.update(botId, { status });
  }

  async updateLastSeen(botId: string): Promise<void> {
    await this.update(botId, { lastSeen: new Date().toISOString() });
  }

  async delete(botId: string): Promise<void> {
    if (!this.bots.has(botId)) throw new BotNotFoundError(botId);
    this.bots.delete(botId);
  }

  async searchByText(query: string, limit: number, offset: number): Promise<Bot[]> {
    const results: Bot[] = [];
    const q = query.toLowerCase();
    for (const bot of this.bots.values()) {
      const text = JSON.stringify(bot.capabilities).toLowerCase() + bot.tags.join(' ').toLowerCase();
      if (text.includes(q)) {
        results.push(bot);
      }
    }
    return results.slice(offset, offset + limit);
  }

  async findByCapabilityName(capabilityName: string): Promise<Bot[]> {
    const results: Bot[] = [];
    for (const bot of this.bots.values()) {
      if (bot.capabilities.some((c) => c.name === capabilityName)) {
        results.push(bot);
      }
    }
    return results;
  }

  async findByTags(tags: string[]): Promise<Bot[]> {
    const results: Bot[] = [];
    for (const bot of this.bots.values()) {
      if (tags.some((t) => bot.tags.includes(t))) {
        results.push(bot);
      }
    }
    return results;
  }

  async getDefaultTeam(): Promise<TeamRow> {
    return this.defaultTeam;
  }
}

/**
 * Mock Capability Index Repository for testing
 */
class MockCapabilityIndexRepository implements ICapabilityIndexRepository {
  private index: CapabilityIndexInput[] = [];

  async createBulk(entries: CapabilityIndexInput[]): Promise<void> {
    this.index.push(...entries);
  }

  async deleteByBotId(botId: string): Promise<void> {
    this.index = this.index.filter((e) => e.botId !== botId);
  }

  async search(query: string, limit: number, offset: number): Promise<any[]> {
    const q = query.toLowerCase();
    return this.index
      .filter((e) => e.capabilityName.toLowerCase().includes(q) || e.capabilityDescription?.toLowerCase().includes(q))
      .slice(offset, offset + limit) as any[];
  }

  getAll(): CapabilityIndexInput[] {
    return [...this.index];
  }
}

describe('Repository (Mock Implementation)', () => {
  describe('BotRepository', () => {
    let repo: MockBotRepository;

    const sampleInput: BotCreateInput = {
      teamId: 'team-001',
      name: 'test-bot',
      ownerEmail: 'test@example.com',
      apiKeyHash: 'hash123',
      capabilities: [
        {
          name: 'search',
          description: 'Search capability',
          async: false,
          estimatedTime: '5s',
        },
      ],
      tags: ['test'],
      availability: null,
    };

    beforeEach(() => {
      repo = new MockBotRepository();
    });

    it('should create a bot', async () => {
      const bot = await repo.create(sampleInput);

      expect(bot.id).toBeDefined();
      expect(bot.name).toBe('test-bot');
      expect(bot.status).toBe('online');
    });

    it('should find bot by ID', async () => {
      const created = await repo.create(sampleInput);
      const found = await repo.findById(created.id);

      expect(found).toEqual(created);
    });

    it('should return null for non-existent bot', async () => {
      const found = await repo.findById('non-existent');
      expect(found).toBeNull();
    });

    it('should find bot by team and name', async () => {
      const created = await repo.create(sampleInput);
      const found = await repo.findByTeamAndName('team-001', 'test-bot');

      expect(found).toEqual(created);
    });

    it('should update capabilities', async () => {
      const created = await repo.create(sampleInput);
      const newCaps: BotCapability[] = [
        { name: 'new_cap', description: 'New', async: true, estimatedTime: '1m' },
      ];

      const updated = await repo.updateCapabilities(created.id, newCaps);

      expect(updated.capabilities).toEqual(newCaps);
    });

    it('should update status', async () => {
      const created = await repo.create(sampleInput);
      await repo.updateStatus(created.id, 'busy');

      const found = await repo.findById(created.id);
      expect(found!.status).toBe('busy');
    });

    it('should delete bot', async () => {
      const created = await repo.create(sampleInput);
      await repo.delete(created.id);

      const found = await repo.findById(created.id);
      expect(found).toBeNull();
    });

    it('should throw on delete non-existent', async () => {
      await expect(repo.delete('non-existent')).rejects.toThrow(BotNotFoundError);
    });

    it('should search by text', async () => {
      await repo.create({ ...sampleInput, name: 'bot-1' });
      await repo.create({ ...sampleInput, name: 'bot-2', tags: ['frontend'] });

      const results = await repo.searchByText('frontend', 10, 0);
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('bot-2');
    });

    it('should find by capability name', async () => {
      await repo.create(sampleInput);
      const results = await repo.findByCapabilityName('search');

      expect(results).toHaveLength(1);
    });

    it('should get default team', async () => {
      const team = await repo.getDefaultTeam();
      expect(team.id).toBe('team-001');
    });
  });

  describe('CapabilityIndexRepository', () => {
    let repo: MockCapabilityIndexRepository;

    beforeEach(() => {
      repo = new MockCapabilityIndexRepository();
    });

    it('should create bulk entries', async () => {
      const entries: CapabilityIndexInput[] = [
        { botId: 'bot-1', capabilityName: 'search', capabilityDescription: 'Search' },
        { botId: 'bot-1', capabilityName: 'run', capabilityDescription: 'Run' },
      ];

      await repo.createBulk(entries);

      expect(repo.getAll()).toHaveLength(2);
    });

    it('should delete by bot ID', async () => {
      await repo.createBulk([
        { botId: 'bot-1', capabilityName: 'cap1', capabilityDescription: null },
        { botId: 'bot-2', capabilityName: 'cap2', capabilityDescription: null },
      ]);

      await repo.deleteByBotId('bot-1');

      const all = repo.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].botId).toBe('bot-2');
    });

    it('should search by capability name', async () => {
      await repo.createBulk([
        { botId: 'bot-1', capabilityName: 'code_search', capabilityDescription: 'Search code' },
        { botId: 'bot-1', capabilityName: 'run_tests', capabilityDescription: 'Run tests' },
      ]);

      const results = await repo.search('code', 10, 0);
      expect(results).toHaveLength(1);
      expect(results[0].capabilityName).toBe('code_search');
    });
  });
});
