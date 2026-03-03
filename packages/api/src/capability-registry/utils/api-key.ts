/**
 * API Key Generation and Hashing Utilities
 *
 * Format: clawteam_{teamSlug}_{botName}_{randomBytes}
 * Storage: Only SHA-256 hash is stored, plaintext returned once at registration.
 */

import { createHash, randomBytes } from 'crypto';
import {
  API_KEY_PREFIX,
  API_KEY_SEPARATOR,
  API_KEY_RANDOM_LENGTH,
} from '../constants';

/**
 * Generate a new API key.
 *
 * Format: clawteam_{teamSlug}_{botName}_{32-char-hex}
 * The random portion uses crypto.randomBytes for security.
 */
export function generateApiKey(teamSlug: string, botName: string): string {
  const sanitizedSlug = sanitize(teamSlug);
  const sanitizedName = sanitize(botName);
  const random = randomBytes(API_KEY_RANDOM_LENGTH / 2).toString('hex');

  return [
    API_KEY_PREFIX,
    sanitizedSlug,
    sanitizedName,
    random,
  ].join(API_KEY_SEPARATOR);
}

/**
 * Hash an API key using SHA-256.
 * This is a one-way hash - the original key cannot be recovered.
 */
export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Verify an API key against a stored hash.
 */
export function verifyApiKey(apiKey: string, storedHash: string): boolean {
  const hash = hashApiKey(apiKey);
  // Use timing-safe comparison to prevent timing attacks
  if (hash.length !== storedHash.length) {
    return false;
  }

  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(storedHash, 'hex');

  // timingSafeEqual requires same-length buffers
  if (a.length !== b.length) {
    return false;
  }

  try {
    const { timingSafeEqual } = require('crypto');
    return timingSafeEqual(a, b);
  } catch {
    // Fallback for environments without timingSafeEqual
    return hash === storedHash;
  }
}

/**
 * Extract team slug and bot name from an API key.
 * Returns null if the key format is invalid.
 */
export function parseApiKey(apiKey: string): { teamSlug: string; botName: string } | null {
  const parts = apiKey.split(API_KEY_SEPARATOR);
  if (parts.length < 4 || parts[0] !== API_KEY_PREFIX) {
    return null;
  }

  return {
    teamSlug: parts[1],
    botName: parts[2],
  };
}

/**
 * Generate a claim token (URL-safe random string)
 */
export function generateClaimToken(): string {
  return randomBytes(24).toString('base64url');
}

/**
 * Sanitize a string for use in API key (lowercase, alphanumeric + hyphen)
 */
function sanitize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
