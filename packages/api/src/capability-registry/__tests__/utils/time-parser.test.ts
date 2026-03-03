/**
 * Time Parser Utility Tests
 */

import {
  parseTimeToSeconds,
  formatSecondsToTime,
  isWithinTimeLimit,
} from '../../utils/time-parser';

describe('Time Parser Utils', () => {
  describe('parseTimeToSeconds', () => {
    it('should parse seconds', () => {
      expect(parseTimeToSeconds('5s')).toBe(5);
      expect(parseTimeToSeconds('10s')).toBe(10);
      expect(parseTimeToSeconds('0s')).toBe(0);
    });

    it('should parse minutes', () => {
      expect(parseTimeToSeconds('2m')).toBe(120);
      expect(parseTimeToSeconds('5m')).toBe(300);
    });

    it('should parse hours', () => {
      expect(parseTimeToSeconds('1h')).toBe(3600);
      expect(parseTimeToSeconds('2h')).toBe(7200);
    });

    it('should parse days', () => {
      expect(parseTimeToSeconds('1d')).toBe(86400);
    });

    it('should parse decimal values', () => {
      expect(parseTimeToSeconds('1.5m')).toBe(90);
      expect(parseTimeToSeconds('0.5h')).toBe(1800);
    });

    it('should parse milliseconds', () => {
      expect(parseTimeToSeconds('500ms')).toBe(0.5);
      expect(parseTimeToSeconds('1000ms')).toBe(1);
    });

    it('should assume seconds when no unit', () => {
      expect(parseTimeToSeconds('30')).toBe(30);
    });

    it('should handle whitespace', () => {
      expect(parseTimeToSeconds('  5s  ')).toBe(5);
      expect(parseTimeToSeconds('5 s')).toBe(5);
    });

    it('should return null for invalid input', () => {
      expect(parseTimeToSeconds('')).toBeNull();
      expect(parseTimeToSeconds('abc')).toBeNull();
      expect(parseTimeToSeconds('-5s')).toBeNull();
      expect(parseTimeToSeconds(null as unknown as string)).toBeNull();
    });
  });

  describe('formatSecondsToTime', () => {
    it('should format seconds', () => {
      expect(formatSecondsToTime(5)).toBe('5s');
      expect(formatSecondsToTime(30)).toBe('30s');
    });

    it('should format minutes', () => {
      expect(formatSecondsToTime(60)).toBe('1m');
      expect(formatSecondsToTime(120)).toBe('2m');
      expect(formatSecondsToTime(90)).toBe('1.5m');
    });

    it('should format hours', () => {
      expect(formatSecondsToTime(3600)).toBe('1h');
      expect(formatSecondsToTime(7200)).toBe('2h');
    });

    it('should format days', () => {
      expect(formatSecondsToTime(86400)).toBe('1d');
      expect(formatSecondsToTime(172800)).toBe('2d');
    });

    it('should handle fractional seconds', () => {
      expect(formatSecondsToTime(5.5)).toBe('5.5s');
    });

    it('should handle zero and negative', () => {
      expect(formatSecondsToTime(0)).toBe('0s');
      expect(formatSecondsToTime(-5)).toBe('0s');
    });
  });

  describe('isWithinTimeLimit', () => {
    it('should return true when within limit', () => {
      expect(isWithinTimeLimit('5s', '10s')).toBe(true);
      expect(isWithinTimeLimit('1m', '2m')).toBe(true);
      expect(isWithinTimeLimit('5s', '5s')).toBe(true);
    });

    it('should return false when exceeding limit', () => {
      expect(isWithinTimeLimit('15s', '10s')).toBe(false);
      expect(isWithinTimeLimit('3m', '2m')).toBe(false);
    });

    it('should handle different units', () => {
      expect(isWithinTimeLimit('30s', '1m')).toBe(true);
      expect(isWithinTimeLimit('2m', '60s')).toBe(false);
    });

    it('should return false for invalid input', () => {
      expect(isWithinTimeLimit('invalid', '10s')).toBe(false);
      expect(isWithinTimeLimit('5s', 'invalid')).toBe(false);
    });
  });
});
