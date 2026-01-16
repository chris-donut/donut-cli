/**
 * Client Factory - Singleton Factory for Backend Clients
 *
 * Provides centralized creation and caching of API client instances.
 * Prevents duplicate connections and enables consistent configuration.
 *
 * Features:
 * - Singleton pattern with per-config caching
 * - Lazy initialization
 * - Type-safe client retrieval
 * - Health check utilities
 */

import { HummingbotClient, HummingbotClientConfig } from "./hummingbot-client.js";
import { NofxClient, NofxClientConfig } from "./nofx-client.js";
import {
  TelegramClientConfig,
  sendMessage,
  sendTradeApproval,
  validateCredentials,
} from "./telegram-client.js";
import { loadConfig } from "../core/config.js";
import { TradeApprovalRequest } from "../core/types.js";

// ============================================================================
// Telegram Client Wrapper
// ============================================================================

/**
 * Wrapper class for Telegram functions to provide consistent interface
 */
export class TelegramClient {
  private config: TelegramClientConfig;

  constructor(config: TelegramClientConfig) {
    this.config = config;
  }

  async sendMessage(
    message: string,
    options?: { parseMode?: "HTML" | "Markdown"; disableNotification?: boolean }
  ): Promise<{ success: boolean; messageId?: number; error?: string }> {
    return sendMessage(this.config, message, options);
  }

  async sendTradeApproval(
    approval: TradeApprovalRequest
  ): Promise<{ success: boolean; messageId?: number; error?: string }> {
    return sendTradeApproval(this.config, approval);
  }

  async validateCredentials(): Promise<{ valid: boolean; error?: string }> {
    return validateCredentials(this.config);
  }

  async healthCheck(): Promise<boolean> {
    const result = await this.validateCredentials();
    return result.valid;
  }
}

/**
 * Alias for TelegramClientConfig for consistency
 */
export type TelegramConfig = TelegramClientConfig;

// ============================================================================
// Types
// ============================================================================

/**
 * Client types available through the factory
 */
export type ClientType = "hummingbot" | "nofx" | "telegram";

/**
 * Configuration union for all client types
 */
export type ClientConfig =
  | { type: "hummingbot"; config: HummingbotClientConfig }
  | { type: "nofx"; config: NofxClientConfig }
  | { type: "telegram"; config: TelegramConfig };

/**
 * Client instance union
 */
export type Client = HummingbotClient | NofxClient | TelegramClient;

// ============================================================================
// Client Registry (Singleton Cache)
// ============================================================================

/**
 * Cache key format: `type:baseUrl` or `type:identifier`
 */
function getCacheKey(type: ClientType, identifier: string): string {
  return `${type}:${identifier}`;
}

/**
 * Client cache - stores initialized client instances
 */
const clientCache = new Map<string, Client>();

// ============================================================================
// Factory Functions
// ============================================================================

// Default URLs for backends
const DEFAULT_HUMMINGBOT_URL = "http://localhost:8000";
const DEFAULT_NOFX_URL = "http://localhost:8080";

/**
 * Get or create a Hummingbot client
 */
export function getHummingbotClient(config?: Partial<HummingbotClientConfig>): HummingbotClient {
  const appConfig = loadConfig();
  const baseUrl = config?.baseUrl ?? appConfig.hummingbotUrl ?? DEFAULT_HUMMINGBOT_URL;
  const timeout = config?.timeout ?? 30000;

  const cacheKey = getCacheKey("hummingbot", baseUrl);

  let client = clientCache.get(cacheKey);
  if (!client) {
    client = new HummingbotClient({ baseUrl, timeout });
    clientCache.set(cacheKey, client);
  }

  return client as HummingbotClient;
}

/**
 * Get or create a nofx client
 */
export function getNofxClient(config?: Partial<NofxClientConfig>): NofxClient {
  const appConfig = loadConfig();
  const baseUrl = config?.baseUrl ?? appConfig.nofxApiUrl ?? DEFAULT_NOFX_URL;
  const timeout = config?.timeout ?? 30000;
  const authToken = config?.authToken ?? appConfig.nofxAuthToken;

  const cacheKey = getCacheKey("nofx", baseUrl);

  let client = clientCache.get(cacheKey);
  if (!client) {
    client = new NofxClient({ baseUrl, timeout, authToken });
    clientCache.set(cacheKey, client);
  }

  return client as NofxClient;
}

/**
 * Get or create a Telegram client
 */
export function getTelegramClient(config?: Partial<TelegramConfig>): TelegramClient | null {
  // Telegram config comes from env directly (not in TerminalConfig)
  const botToken = config?.botToken ?? process.env.TELEGRAM_BOT_TOKEN;
  const chatId = config?.chatId ?? process.env.TELEGRAM_CHAT_ID;

  // Telegram requires both token and chat ID
  if (!botToken || !chatId) {
    return null;
  }

  const cacheKey = getCacheKey("telegram", `${botToken.slice(-6)}:${chatId}`);

  let client = clientCache.get(cacheKey);
  if (!client) {
    client = new TelegramClient({ botToken, chatId });
    clientCache.set(cacheKey, client);
  }

  return client as TelegramClient;
}

// ============================================================================
// Generic Factory
// ============================================================================

/**
 * Generic factory function for creating clients by type
 */
export function createClient<T extends ClientType>(
  type: T,
  config?: T extends "hummingbot"
    ? Partial<HummingbotClientConfig>
    : T extends "nofx"
      ? Partial<NofxClientConfig>
      : Partial<TelegramConfig>
): T extends "hummingbot"
  ? HummingbotClient
  : T extends "nofx"
    ? NofxClient
    : TelegramClient | null {
  switch (type) {
    case "hummingbot":
      return getHummingbotClient(config as Partial<HummingbotClientConfig>) as ReturnType<typeof createClient<T>>;
    case "nofx":
      return getNofxClient(config as Partial<NofxClientConfig>) as ReturnType<typeof createClient<T>>;
    case "telegram":
      return getTelegramClient(config as Partial<TelegramConfig>) as ReturnType<typeof createClient<T>>;
    default:
      throw new Error(`Unknown client type: ${type}`);
  }
}

// ============================================================================
// Cache Management
// ============================================================================

/**
 * Clear all cached clients
 */
export function clearClientCache(): void {
  clientCache.clear();
}

/**
 * Clear a specific client from cache
 */
export function clearClient(type: ClientType, identifier: string): boolean {
  const cacheKey = getCacheKey(type, identifier);
  return clientCache.delete(cacheKey);
}

/**
 * Get number of cached clients
 */
export function getCacheSize(): number {
  return clientCache.size;
}

/**
 * Check if a client is cached
 */
export function isClientCached(type: ClientType, identifier: string): boolean {
  const cacheKey = getCacheKey(type, identifier);
  return clientCache.has(cacheKey);
}

// ============================================================================
// Health Check Utilities
// ============================================================================

/**
 * Health check result for a backend
 */
export interface BackendHealth {
  type: ClientType;
  available: boolean;
  latencyMs?: number;
  error?: string;
}

/**
 * Check health of a specific backend
 */
export async function checkBackendHealth(type: ClientType): Promise<BackendHealth> {
  const startTime = Date.now();

  try {
    let client: Client | null;

    switch (type) {
      case "hummingbot":
        client = getHummingbotClient();
        break;
      case "nofx":
        client = getNofxClient();
        break;
      case "telegram":
        client = getTelegramClient();
        break;
      default:
        return { type, available: false, error: `Unknown client type: ${type}` };
    }

    if (!client) {
      return { type, available: false, error: "Client not configured" };
    }

    // Perform health check
    const isHealthy = await (client as HummingbotClient | NofxClient).healthCheck?.() ?? false;
    const latencyMs = Date.now() - startTime;

    return {
      type,
      available: isHealthy,
      latencyMs,
      error: isHealthy ? undefined : "Health check failed",
    };
  } catch (error) {
    return {
      type,
      available: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check health of all configured backends
 */
export async function checkAllBackendsHealth(): Promise<BackendHealth[]> {
  const types: ClientType[] = ["hummingbot", "nofx", "telegram"];
  const results = await Promise.all(types.map(checkBackendHealth));
  return results;
}

/**
 * Get the preferred available backend for backtesting
 */
export async function getPreferredBacktestBackend(): Promise<"hummingbot" | "nofx" | null> {
  // Check hummingbot first (preferred)
  const hbHealth = await checkBackendHealth("hummingbot");
  if (hbHealth.available) {
    return "hummingbot";
  }

  // Fall back to nofx
  const nofxHealth = await checkBackendHealth("nofx");
  if (nofxHealth.available) {
    return "nofx";
  }

  return null;
}
