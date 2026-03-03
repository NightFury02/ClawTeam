/**
 * Capability Registry Interface - ICapabilityRegistry 接口定义
 *
 * 定义 Capability Registry 模块的公共契约，
 * 真实实现和 Mock 实现都满足此接口。
 */

import type {
  Bot,
  BotCapability,
  CapabilitySearchQuery,
  CapabilityMatch,
  PaginatedResponse,
} from '@clawteam/shared/types';
import type { UserRow } from './types';

/**
 * Bot 注册请求
 */
export interface BotRegisterRequest {
  /** Bot 名称 */
  name: string;
  /** 所有者邮箱（可选，从 authenticatedUser 获取） */
  ownerEmail?: string;
  /** 能力声明列表 */
  capabilities: BotCapability[];
  /** 标签 */
  tags?: string[];
  /** 可用性配置 */
  availability?: {
    timezone: string;
    workingHours: string;
    autoRespond: boolean;
  };
  /** 用户 ID（OpenClaw 用户邮箱） */
  userId?: string;
  /** 用户名称 */
  userName?: string;
  /** 客户端类型 */
  clientType?: 'openclaw' | 'custom' | 'sdk';
}

/**
 * Bot 注册响应
 */
export interface BotRegisterResponse {
  /** Bot ID */
  botId: string;
}

/**
 * 能力更新响应
 */
export interface CapabilityUpdateResponse {
  botId: string;
  capabilitiesCount: number;
  updatedAt: string;
}

/**
 * 心跳响应
 */
export interface HeartbeatResponse {
  botId: string;
  status: Bot['status'];
  lastSeen: string;
}

/**
 * Core Capability Registry interface.
 * Both real and mock implementations satisfy this contract.
 */
export interface ICapabilityRegistry {
  /**
   * Register a new bot with capabilities.
   * Requires an authenticated user (user-level API key).
   */
  register(req: BotRegisterRequest, authenticatedUser?: UserRow): Promise<BotRegisterResponse>;

  /**
   * Update a bot's capabilities.
   */
  updateCapabilities(botId: string, capabilities: BotCapability[]): Promise<CapabilityUpdateResponse>;

  /**
   * Get bot information by ID.
   * Returns null if not found.
   */
  getBot(botId: string): Promise<Bot | null>;

  /**
   * Search for capabilities matching a query.
   * Returns paginated results with confidence scores.
   */
  search(query: CapabilitySearchQuery): Promise<PaginatedResponse<CapabilityMatch>>;

  /**
   * Find bots by exact capability name.
   */
  findByCapability(capabilityName: string): Promise<Bot[]>;

  /**
   * Update a bot's status.
   */
  updateStatus(botId: string, status: Bot['status']): Promise<void>;

  /**
   * Record a heartbeat from a bot.
   */
  heartbeat(botId: string): Promise<HeartbeatResponse>;

  /**
   * Validate an API key and return the associated bot.
   * Returns null if the key is invalid.
   */
  validateApiKey(apiKey: string): Promise<Bot | null>;
}
