import WebSocket from 'ws';
import fetch from 'node-fetch';
import {
  BotConfig,
  Task,
  TaskHandler,
  DelegateTaskRequest,
  RegistrationResponse,
  Bot,
  WSMessage,
  TaskAssignedMessage,
} from './types.js';

export class ClawTeamClient {
  private config: BotConfig;
  private apiUrl: string;
  private botId?: string;
  private apiKey?: string;
  private ws?: WebSocket;
  private taskHandlers: Map<string, TaskHandler> = new Map();
  private heartbeatInterval?: NodeJS.Timeout;

  constructor(config: BotConfig) {
    this.config = config;
    this.apiUrl = config.apiUrl || 'http://localhost:3000';
    this.apiKey = config.apiKey;
  }

  async start(): Promise<void> {
    console.log(`[${this.config.name}] Starting bot...`);

    // Step 1: Register bot
    await this.register();

    // Step 2: Connect WebSocket
    await this.connectWebSocket();

    // Step 3: Start heartbeat
    this.startHeartbeat();

    console.log(`[${this.config.name}] Bot started successfully`);
  }

  async stop(): Promise<void> {
    console.log(`[${this.config.name}] Stopping bot...`);

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    if (this.ws) {
      this.ws.close();
    }

    console.log(`[${this.config.name}] Bot stopped`);
  }

  private async register(): Promise<void> {
    try {
      const response = await fetch(`${this.apiUrl}/api/bots/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: this.config.name,
          capabilities: this.config.capabilities,
          inviteCode: this.config.inviteCode,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Registration failed: ${error}`);
      }

      const data = (await response.json()) as RegistrationResponse;
      this.botId = data.botId;

      console.log(`[${this.config.name}] Registered with ID: ${this.botId}`);
    } catch (error) {
      console.error(`[${this.config.name}] Registration error:`, error);
      throw error;
    }
  }

  private async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = `${this.apiUrl.replace('http', 'ws')}/ws?apiKey=${this.apiKey}`;
      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        console.log(`[${this.config.name}] WebSocket connected`);
        resolve();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(data.toString());
      });

      this.ws.on('error', (error) => {
        console.error(`[${this.config.name}] WebSocket error:`, error);
        reject(error);
      });

      this.ws.on('close', () => {
        console.log(`[${this.config.name}] WebSocket disconnected`);
        // Attempt to reconnect after 5 seconds
        setTimeout(() => {
          console.log(`[${this.config.name}] Attempting to reconnect...`);
          this.connectWebSocket().catch(console.error);
        }, 5000);
      });
    });
  }

  private handleMessage(data: string): void {
    try {
      const message: WSMessage = JSON.parse(data);

      if (message.type === 'task_assigned') {
        const taskMessage = message as TaskAssignedMessage;
        const task = taskMessage.payload;

        // Only handle tasks assigned to this bot
        if (task.toBotId === this.botId) {
          this.handleTask(task);
        }
      }
    } catch (error) {
      console.error(`[${this.config.name}] Error handling message:`, error);
    }
  }

  private async handleTask(task: Task): Promise<void> {
    console.log(`[${this.config.name}] Received task: ${task.capability} (${task.id})`);

    const handler = this.taskHandlers.get(task.capability);
    if (!handler) {
      console.error(`[${this.config.name}] No handler for capability: ${task.capability}`);
      await this.failTask(task.id, `No handler registered for capability: ${task.capability}`);
      return;
    }

    try {
      // Mark task as processing
      await this.updateTaskStatus(task.id, 'processing');

      // Execute handler
      await handler(task);

      console.log(`[${this.config.name}] Task completed: ${task.id}`);
    } catch (error) {
      console.error(`[${this.config.name}] Task execution error:`, error);
      await this.failTask(task.id, (error as Error).message);
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(async () => {
      try {
        await fetch(`${this.apiUrl}/api/bots/${this.botId}/heartbeat`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
          },
        });
      } catch (error) {
        console.error(`[${this.config.name}] Heartbeat error:`, error);
      }
    }, 30000); // Every 30 seconds
  }

  onTask(capability: string, handler: TaskHandler): void {
    this.taskHandlers.set(capability, handler);
    console.log(`[${this.config.name}] Registered handler for: ${capability}`);
  }

  async delegateTask(request: DelegateTaskRequest): Promise<Task> {
    try {
      const response = await fetch(`${this.apiUrl}/api/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          fromBotId: this.botId,
          toBotId: request.toBotId,
          capability: request.capability,
          parameters: request.parameters,
          priority: request.priority || 'normal',
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Task delegation failed: ${error}`);
      }

      const task = (await response.json()) as Task;
      console.log(`[${this.config.name}] Delegated task: ${task.id}`);
      return task;
    } catch (error) {
      console.error(`[${this.config.name}] Delegation error:`, error);
      throw error;
    }
  }

  async completeTask(taskId: string, result: unknown): Promise<void> {
    try {
      const response = await fetch(`${this.apiUrl}/api/tasks/${taskId}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ result }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Task completion failed: ${error}`);
      }

      console.log(`[${this.config.name}] Task completed: ${taskId}`);
    } catch (error) {
      console.error(`[${this.config.name}] Completion error:`, error);
      throw error;
    }
  }

  private async failTask(taskId: string, errorMessage: string): Promise<void> {
    try {
      await fetch(`${this.apiUrl}/api/tasks/${taskId}/fail`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ error: errorMessage }),
      });
    } catch (error) {
      console.error(`[${this.config.name}] Failed to mark task as failed:`, error);
    }
  }

  private async updateTaskStatus(taskId: string, status: string): Promise<void> {
    try {
      await fetch(`${this.apiUrl}/api/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ status }),
      });
    } catch (error) {
      console.error(`[${this.config.name}] Failed to update task status:`, error);
    }
  }

  async findBotByCapability(capability: string): Promise<string> {
    try {
      const response = await fetch(
        `${this.apiUrl}/api/capabilities/search?capability=${encodeURIComponent(capability)}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Bot search failed');
      }

      const bots = (await response.json()) as Bot[];
      if (bots.length === 0) {
        throw new Error(`No bot found with capability: ${capability}`);
      }

      return bots[0].id;
    } catch (error) {
      console.error(`[${this.config.name}] Bot search error:`, error);
      throw error;
    }
  }

  getBotId(): string | undefined {
    return this.botId;
  }

  getApiKey(): string | undefined {
    return this.apiKey;
  }

  getApiUrl(): string {
    return this.apiUrl;
  }
}
