/**
 * API Key Utility Tests
 */

import {
  generateApiKey,
  hashApiKey,
  verifyApiKey,
  parseApiKey,
  generateClaimToken,
} from '../../utils/api-key';

describe('API Key Utils', () => {
  describe('generateApiKey', () => {
    it('should generate API key in correct format', () => {
      const key = generateApiKey('my-team', 'my-bot');
      expect(key).toMatch(/^clawteam_my-team_my-bot_[a-f0-9]{32}$/);
    });

    it('should sanitize team slug and bot name', () => {
      const key = generateApiKey('My Team!', 'My Bot@123');
      expect(key).toMatch(/^clawteam_my-team_my-bot-123_[a-f0-9]{32}$/);
    });

    it('should generate unique keys each time', () => {
      const key1 = generateApiKey('team', 'bot');
      const key2 = generateApiKey('team', 'bot');
      expect(key1).not.toBe(key2);
    });
  });

  describe('hashApiKey', () => {
    it('should return SHA-256 hash', () => {
      const hash = hashApiKey('test-key');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce consistent hashes', () => {
      const hash1 = hashApiKey('test-key');
      const hash2 = hashApiKey('test-key');
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different keys', () => {
      const hash1 = hashApiKey('key1');
      const hash2 = hashApiKey('key2');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyApiKey', () => {
    it('should return true for matching key and hash', () => {
      const key = 'test-api-key';
      const hash = hashApiKey(key);
      expect(verifyApiKey(key, hash)).toBe(true);
    });

    it('should return false for non-matching key', () => {
      const hash = hashApiKey('correct-key');
      expect(verifyApiKey('wrong-key', hash)).toBe(false);
    });

    it('should return false for different length hashes', () => {
      expect(verifyApiKey('key', 'short')).toBe(false);
    });
  });

  describe('parseApiKey', () => {
    it('should parse valid API key', () => {
      const result = parseApiKey('clawteam_my-team_my-bot_abc123def456');
      expect(result).toEqual({
        teamSlug: 'my-team',
        botName: 'my-bot',
      });
    });

    it('should return null for invalid prefix', () => {
      const result = parseApiKey('invalid_my-team_my-bot_abc123');
      expect(result).toBeNull();
    });

    it('should return null for too few parts', () => {
      const result = parseApiKey('clawteam_only-two');
      expect(result).toBeNull();
    });
  });

  describe('generateClaimToken', () => {
    it('should generate URL-safe token', () => {
      const token = generateClaimToken();
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('should generate unique tokens', () => {
      const token1 = generateClaimToken();
      const token2 = generateClaimToken();
      expect(token1).not.toBe(token2);
    });
  });
});
