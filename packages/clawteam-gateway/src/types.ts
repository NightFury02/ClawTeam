/**
 * TaskRouter Types
 *
 * Routing decision and result types used by the core router.
 */

import type { Task, TaskType } from '@clawteam/shared/types';

/** The action the router decides to take for a given task */
export type RoutingAction = 'send_to_main' | 'send_to_session';

/** Pure routing decision — no I/O, just intent */
export interface RoutingDecision {
  taskId: string;
  action: RoutingAction;
  /** Target session key (only for send_to_session) */
  targetSessionKey?: string;
  task: Task;
  /** Human-readable reason for logging */
  reason: string;
}

/** Result after executing a routing decision */
export interface RoutingResult {
  taskId: string;
  success: boolean;
  action: RoutingAction;
  /** The session that received the message */
  sessionKey?: string;
  error?: string;
  /** True if target session was expired and fell back to main */
  fallback?: boolean;
}

/** Response shape from GET /api/v1/tasks/pending */
export interface PollResponse {
  success: boolean;
  data?: {
    tasks: Task[];
    hasMore: boolean;
  };
  error?: {
    code: string;
    message: string;
  };
  traceId?: string;
}

/** Response shape from GET /api/v1/tasks?status=...&role=to */
export interface ActiveTasksResponse {
  success: boolean;
  data?: {
    items: Task[];
    total: number;
  };
  error?: {
    code: string;
    message: string;
  };
  traceId?: string;
}

/** Response shape from GET /api/v1/tasks/:taskId */
export interface TaskResponse {
  success: boolean;
  data?: Task;
  error?: {
    code: string;
    message: string;
  };
  traceId?: string;
}

/** Message from the unified inbox */
export interface InboxMessage {
  messageId: string;
  fromBotId: string;
  toBotId: string;
  type: 'task_notification' | 'direct_message' | 'broadcast' | 'system' | 'delegate_intent';
  contentType: string;
  content: any;
  priority: string;
  taskId?: string;
  traceId?: string;
  timestamp: string;
}

/** Response shape from GET /api/v1/messages/inbox */
export interface InboxPollResponse {
  success: boolean;
  data?: {
    messages: InboxMessage[];
    count: number;
    remaining: number;
  };
  error?: { code: string; message: string };
  traceId?: string;
}

/** Response shape from OpenClaw session send */
export interface SessionSendResponse {
  success: boolean;
  error?: string;
}

/** Response shape from OpenClaw session status check */
export interface SessionStatusResponse {
  alive: boolean;
  sessionKey: string;
}
