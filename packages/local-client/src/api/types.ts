/**
 * API Response Types
 *
 * Types for ClawTeam API Server and Router local API responses.
 */

// --- ClawTeam API types ---

export interface Bot {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'busy';
  capabilities: string[];
  lastSeenAt: string | null;
}

export interface Task {
  id: string;
  type: string;
  capability: string;
  status: 'pending' | 'accepted' | 'processing' | 'waiting_for_input' | 'completed' | 'failed' | 'cancelled' | 'timeout';
  priority: string;
  fromBotId: string;
  toBotId?: string;
  parentTaskId?: string;
  parameters?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: Record<string, unknown> | string;
  senderSessionKey?: string;
  executorSessionKey?: string;
  createdAt: string;
  updatedAt?: string;
  acceptedAt?: string;
  startedAt?: string;
  completedAt?: string;
  timeoutSeconds?: number;
  retryCount?: number;
  maxRetries?: number;
}

export type ColumnId = 'pending' | 'processing' | 'waiting' | 'completed' | 'failed';

export type MessageType = 'direct_message' | 'task_notification' | 'broadcast' | 'system';

export interface Message {
  messageId: string;
  fromBotId: string;
  toBotId: string;
  type: MessageType;
  contentType: string;
  content: any;
  priority: string;
  status: 'delivered' | 'read';
  taskId: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface DelegateTaskRequest {
  capability: string;
  fromBotId: string;
  toBotId?: string;
  type?: string;
  priority?: string;
  parameters?: Record<string, unknown>;
}

// --- Router API types ---

export interface RouterStatus {
  uptime: number;
  trackedTasks: number;
  activeSessions: number;
  pollerRunning: boolean;
  heartbeatRunning: boolean;
  pollIntervalMs: number;
}

export type SessionState =
  | 'active' | 'tool_calling' | 'waiting' | 'idle'
  | 'errored' | 'completed' | 'dead' | 'unknown';

export interface SessionStatus {
  taskId: string;
  sessionKey: string;
  sessionState: SessionState;
  lastActivityAt: string | null;
  details: {
    alive: boolean;
    jsonlAnalysis: {
      lastMessageRole: string | null;
      lastStopReason: string | null;
      toolCallCount: number;
      messageCount: number;
      model: string | null;
    } | null;
    ageMs: number | null;
    agentId: string | null;
    sessionId: string | null;
  };
}

export interface RouteHistoryEntry {
  timestamp: number;
  taskId: string;
  action: string;
  sessionKey?: string;
  success: boolean;
  reason: string;
  fallback?: boolean;
  error?: string;
}

export interface RouterWsEvent {
  type: 'task_routed' | 'session_state_changed' | 'poll_complete';
  [key: string]: unknown;
}
