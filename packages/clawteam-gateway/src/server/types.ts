/**
 * Router Local API Types
 *
 * Request/response types for the local HTTP+WebSocket API
 * exposed by the TaskRouter for client consumption.
 */

import type { RoutingAction } from '../types.js';
import type { SessionState, TaskSessionStatus } from '../monitoring/types.js';

/** GET /status response */
export interface RouterStatusResponse {
  uptime: number;
  trackedTasks: number;
  activeSessions: number;
  pollerRunning: boolean;
  heartbeatRunning: boolean;
  pollIntervalMs: number;
}

/** GET /sessions response */
export interface SessionListResponse {
  sessions: TaskSessionStatus[];
}

/** GET /tasks response */
export interface TrackedTasksResponse {
  tasks: Array<{ taskId: string; sessionKey: string }>;
}

/** GET /routes/history response */
export interface RouteHistoryResponse {
  entries: RouteHistoryEntry[];
}

/** Single route history entry */
export interface RouteHistoryEntry {
  timestamp: number;
  taskId: string;
  action: RoutingAction;
  sessionKey?: string;
  success: boolean;
  reason: string;
  fallback?: boolean;
  error?: string;
}

/** WebSocket event: task_routed */
export interface TaskRoutedEvent {
  type: 'task_routed';
  taskId: string;
  action: RoutingAction;
  sessionKey?: string;
  success: boolean;
  reason: string;
}

/** WebSocket event: session_state_changed */
export interface SessionStateChangedEvent {
  type: 'session_state_changed';
  taskId: string;
  sessionKey: string;
  state: SessionState;
  details: TaskSessionStatus['details'];
}

/** WebSocket event: poll_complete */
export interface PollCompleteEvent {
  type: 'poll_complete';
  fetched: number;
  routed: number;
  failed: number;
  skipped: number;
}

export type RouterWsEvent =
  | TaskRoutedEvent
  | SessionStateChangedEvent
  | PollCompleteEvent;
