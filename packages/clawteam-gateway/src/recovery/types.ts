/**
 * Stale Task Recovery Types
 */

import type { SessionState } from '../monitoring/types.js';

/** Session states considered stale when a task is still processing */
export const STALE_SESSION_STATES: ReadonlySet<SessionState> = new Set([
  'idle',
  'completed',
  'dead',
  'errored',
]);

export type RecoveryAction = 'nudge' | 'restore_and_nudge' | 'fallback_to_main' | 'fail' | 'skip';

export interface RecoveryRecord {
  attempts: number;
  lastAttemptAt: number;
  lastSessionState: SessionState;
}

export interface RecoveryResult {
  taskId: string;
  sessionKey: string;
  action: RecoveryAction;
  success: boolean;
  reason: string;
}
