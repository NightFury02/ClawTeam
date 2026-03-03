/**
 * ClawTeam API Client
 *
 * HTTP client for the ClawTeam API Server.
 */

import type { Bot, Task, DelegateTaskRequest, Message } from './types.js';

export class ClawTeamClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        ...options?.headers,
      },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
    return json.data ?? json;
  }

  async listBots(): Promise<Bot[]> {
    return this.request<Bot[]>('/api/v1/bots');
  }

  async getBot(id: string): Promise<Bot> {
    return this.request<Bot>(`/api/v1/bots/${id}`);
  }

  async updateBotStatus(id: string, status: string): Promise<void> {
    await this.request(`/api/v1/bots/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
  }

  async listTasks(filter?: string): Promise<Task[]> {
    const query = filter ? `?status=${filter}` : '';
    return this.request<Task[]>(`/api/v1/tasks/all${query}`);
  }

  async getTask(id: string): Promise<Task> {
    return this.request<Task>(`/api/v1/tasks/${id}`);
  }

  async delegateTask(req: DelegateTaskRequest): Promise<Task> {
    return this.request<Task>('/api/v1/tasks/delegate', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  }

  async cancelTask(id: string): Promise<void> {
    await this.request(`/api/v1/tasks/all/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'Cancelled from dashboard' }),
    });
  }

  async retryTask(task: Task): Promise<Task> {
    return this.delegateTask({
      capability: task.capability,
      fromBotId: task.fromBotId,
      toBotId: task.toBotId,
      type: task.type,
      priority: task.priority,
      parameters: task.parameters,
    });
  }

  async listMessages(): Promise<Message[]> {
    return this.request<Message[]>('/api/v1/messages');
  }
}
