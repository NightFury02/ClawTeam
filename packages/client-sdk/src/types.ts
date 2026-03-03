export interface BotCapability {
  name: string;
  description: string;
  parameters: Record<string, string>;
  async: boolean;
  estimatedTime?: string;
}

export interface BotConfig {
  name: string;
  capabilities: BotCapability[];
  inviteCode?: string;
  apiUrl?: string;
  apiKey?: string;
}

export interface Task {
  id: string;
  fromBotId: string;
  toBotId: string;
  capability: string;
  parameters: Record<string, unknown>;
  priority: 'urgent' | 'high' | 'normal' | 'low';
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'timeout';
  result?: unknown;
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface DelegateTaskRequest {
  toBotId: string;
  capability: string;
  parameters: Record<string, unknown>;
  priority?: 'urgent' | 'high' | 'normal' | 'low';
}

export interface Bot {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'busy';
  capabilities: BotCapability[];
  registeredAt: string;
}

export interface RegistrationResponse {
  botId: string;
}

export interface WSMessage {
  type: string;
  payload: unknown;
}

export interface TaskAssignedMessage extends WSMessage {
  type: 'task_assigned';
  payload: Task;
}

export type TaskHandler = (task: Task) => Promise<void>;
