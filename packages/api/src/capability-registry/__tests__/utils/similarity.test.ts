/**
 * Similarity Utility Tests
 */

import {
  calculateSimilarity,
  scoreCapabilityMatch,
  levenshteinDistance,
  tokenize,
} from '../../utils/similarity';

describe('Similarity Utils', () => {
  describe('tokenize', () => {
    it('should tokenize simple string', () => {
      expect(tokenize('hello world')).toEqual(['hello', 'world']);
    });

    it('should handle punctuation', () => {
      expect(tokenize('hello, world!')).toEqual(['hello', 'world']);
    });

    it('should handle mixed case', () => {
      expect(tokenize('Hello World')).toEqual(['hello', 'world']);
    });

    it('should handle underscores and hyphens', () => {
      expect(tokenize('code_search run-tests')).toEqual(['code', 'search', 'run', 'tests']);
    });

    it('should handle empty string', () => {
      expect(tokenize('')).toEqual([]);
    });

    it('should preserve Chinese characters', () => {
      expect(tokenize('代码搜索')).toEqual(['代码搜索']);
    });
  });

  describe('levenshteinDistance', () => {
    it('should return 0 for identical strings', () => {
      expect(levenshteinDistance('hello', 'hello')).toBe(0);
    });

    it('should return string length for empty comparisons', () => {
      expect(levenshteinDistance('hello', '')).toBe(5);
      expect(levenshteinDistance('', 'hello')).toBe(5);
    });

    it('should calculate single edit distance', () => {
      expect(levenshteinDistance('cat', 'bat')).toBe(1);
      expect(levenshteinDistance('cat', 'cats')).toBe(1);
      expect(levenshteinDistance('cat', 'ca')).toBe(1);
    });

    it('should calculate multiple edit distance', () => {
      expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
    });
  });

  describe('calculateSimilarity', () => {
    it('should return 1 for identical strings', () => {
      expect(calculateSimilarity('hello', 'hello')).toBe(1);
    });

    it('should return 0 for empty strings', () => {
      expect(calculateSimilarity('', 'hello')).toBe(0);
      expect(calculateSimilarity('hello', '')).toBe(0);
    });

    it('should be case insensitive', () => {
      expect(calculateSimilarity('Hello', 'hello')).toBe(1);
    });

    it('should return high score for similar strings', () => {
      const score = calculateSimilarity('code search', 'code searching');
      expect(score).toBeGreaterThan(0.6);
    });

    it('should return low score for different strings', () => {
      const score = calculateSimilarity('apple', 'banana');
      expect(score).toBeLessThan(0.3);
    });

    it('should handle substring matches', () => {
      const score = calculateSimilarity('run tests', 'run');
      expect(score).toBeGreaterThan(0.3);
    });
  });

  describe('scoreCapabilityMatch', () => {
    it('should return high score for exact name match', () => {
      const score = scoreCapabilityMatch('code_search', 'Search for code', ['search'], 'code_search');
      expect(score).toBeGreaterThan(0.7);
    });

    it('should return moderate score for description match', () => {
      const score = scoreCapabilityMatch('search_files', 'Search for files in repository', [], 'find files');
      expect(score).toBeGreaterThan(0.3);
    });

    it('should boost score for tag match', () => {
      const scoreWithTag = scoreCapabilityMatch('run', 'Run something', ['testing'], 'testing');
      const scoreWithoutTag = scoreCapabilityMatch('run', 'Run something', [], 'testing');
      expect(scoreWithTag).toBeGreaterThan(scoreWithoutTag);
    });

    it('should return low score for unrelated query', () => {
      const score = scoreCapabilityMatch('code_search', 'Search for code', ['search'], 'database migration');
      expect(score).toBeLessThan(0.3);
    });
  });
});
