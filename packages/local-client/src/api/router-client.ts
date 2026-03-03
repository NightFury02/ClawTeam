/**
 * Router Local API Client
 *
 * HTTP + WebSocket client for the TaskRouter local API.
 */

import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import type {
  RouterStatus,
  SessionStatus,
  RouteHistoryEntry,
  RouterWsEvent,
} from './types.js';

export class RouterClient extends EventEmitter {
  private readonly baseUrl: string;
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(baseUrl: string) {
    super();
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private async request<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<T>;
  }

  private async postRequest<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<T>;
  }

  async getStatus(): Promise<RouterStatus> {
    return this.request<RouterStatus>('/status');
  }

  async getSessions(): Promise<{ sessions: SessionStatus[] }> {
    return this.request<{ sessions: SessionStatus[] }>('/sessions');
  }

  async getTrackedTasks(): Promise<{ tasks: Array<{ taskId: string; sessionKey: string }> }> {
    return this.request('/tasks');
  }

  async getRouteHistory(): Promise<{ entries: RouteHistoryEntry[] }> {
    return this.request('/routes/history');
  }

  async nudgeTask(taskId: string): Promise<{ success: boolean; reason: string }> {
    return this.postRequest(`/tasks/${taskId}/nudge`);
  }

  async cancelTask(taskId: string, reason = 'Cancelled from dashboard'): Promise<{ success: boolean; apiCancelled: boolean; sessionNotified: boolean; reason: string }> {
    return this.postRequest(`/tasks/${taskId}/cancel`, { reason });
  }

  async createTask(toBotId: string, prompt: string, priority = 'normal'): Promise<{ success: boolean; taskId?: string }> {
    const res = await fetch(`${this.baseUrl}/gateway/tasks/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ toBotId, prompt, priority }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<{ success: boolean; taskId?: string }>;
  }

  async delegateIntent(fromBotId: string, intentText: string, taskId?: string): Promise<{ success: boolean; message: string }> {
    return this.postRequest('/delegate-intent', { fromBotId, intentText, ...(taskId ? { taskId } : {}) });
  }

  async resetMainSession(): Promise<{ success: boolean; newSessionId?: string; message?: string }> {
    return this.postRequest('/sessions/main/reset');
  }

  async resumeTask(taskId: string, humanInput?: string): Promise<{ success: boolean }> {
    return this.postRequest(`/tasks/${taskId}/resume`, humanInput ? { humanInput } : {});
  }

  connectWs(): void {
    const wsUrl = this.baseUrl.replace(/^http/, 'ws') + '/ws';
    this.ws = new WebSocket(wsUrl);

    this.ws.on('open', () => this.emit('connected'));

    this.ws.on('message', (data: WebSocket.Data) => {
      try {
        const event = JSON.parse(data.toString()) as RouterWsEvent;
        this.emit(event.type, event);
        this.emit('event', event);
      } catch { /* ignore malformed messages */ }
    });

    this.ws.on('close', () => {
      this.emit('disconnected');
      this.scheduleReconnect();
    });

    this.ws.on('error', () => {
      this.emit('disconnected');
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectWs();
    }, 3000);
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }
}
