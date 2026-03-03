/**
 * Gateway Proxy Types
 */

export interface GatewayProxyDeps {
  clawteamApiUrl: string;
  clawteamApiKey: string;
  clawteamBotId?: string;
  sessionTracker: SessionTrackerLike;
  logger: LoggerLike;
  onBotIdChanged?: (newBotId: string) => void;
}

export interface SessionTrackerLike {
  track(taskId: string, sessionKey: string): void;
  untrack(taskId: string): void;
  getSessionForTask(taskId: string): string | undefined;
  getAllTracked(): Array<{ taskId: string; sessionKey: string }>;
}

export interface LoggerLike {
  info(obj: Record<string, any>, msg?: string): void;
  warn(obj: Record<string, any>, msg?: string): void;
  error(obj: Record<string, any>, msg?: string): void;
  debug(obj: Record<string, any>, msg?: string): void;
}
