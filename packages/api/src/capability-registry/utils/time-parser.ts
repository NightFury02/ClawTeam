/**
 * Time Parser Utility
 *
 * Parse time strings like "5s", "2m", "1h" into seconds.
 */

import { TIME_UNITS } from '../constants';

/**
 * Parse a time string into seconds.
 *
 * Supported formats:
 * - "5s" → 5
 * - "2m" → 120
 * - "1h" → 3600
 * - "1d" → 86400
 * - "1.5m" → 90
 * - "500ms" → 0.5
 * - "30" → 30 (assumed seconds if no unit)
 *
 * @returns Number of seconds, or null if invalid.
 */
export function parseTimeToSeconds(timeStr: string): number | null {
  if (!timeStr || typeof timeStr !== 'string') {
    return null;
  }

  const trimmed = timeStr.trim().toLowerCase();

  // Handle milliseconds specially
  const msMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*ms$/);
  if (msMatch) {
    return parseFloat(msMatch[1]) / 1000;
  }

  // Handle standard units: s, m, h, d
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*([smhd])?$/);
  if (!match) {
    return null;
  }

  const value = parseFloat(match[1]);
  const unit = match[2] || 's';

  if (isNaN(value) || value < 0) {
    return null;
  }

  const multiplier = TIME_UNITS[unit];
  if (multiplier === undefined) {
    return null;
  }

  return value * multiplier;
}

/**
 * Format seconds into a human-readable time string.
 *
 * @returns e.g., "5s", "2m", "1h", "1d"
 */
export function formatSecondsToTime(seconds: number): string {
  if (seconds < 0) {
    return '0s';
  }

  if (seconds < 60) {
    return seconds % 1 === 0 ? `${seconds}s` : `${seconds.toFixed(1)}s`;
  }

  if (seconds < 3600) {
    const minutes = seconds / 60;
    return minutes % 1 === 0 ? `${minutes}m` : `${minutes.toFixed(1)}m`;
  }

  if (seconds < 86400) {
    const hours = seconds / 3600;
    return hours % 1 === 0 ? `${hours}h` : `${hours.toFixed(1)}h`;
  }

  const days = seconds / 86400;
  return days % 1 === 0 ? `${days}d` : `${days.toFixed(1)}d`;
}

/**
 * Check if a time string represents a value within a maximum.
 *
 * @param timeStr - Time string to check (e.g., "5s")
 * @param maxTimeStr - Maximum time string (e.g., "10s")
 * @returns true if timeStr <= maxTimeStr, false otherwise
 */
export function isWithinTimeLimit(timeStr: string, maxTimeStr: string): boolean {
  const time = parseTimeToSeconds(timeStr);
  const maxTime = parseTimeToSeconds(maxTimeStr);

  if (time === null || maxTime === null) {
    return false;
  }

  return time <= maxTime;
}
