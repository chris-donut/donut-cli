/**
 * Client Factory - Singleton Factory for Backend Clients
 *
 * Provides centralized creation and caching of API client instances.
 * Prevents duplicate connections and enables consistent configuration.
 *
 * Supported backends:
 * - donutAgents: AI trading agents with LLM decisions (port 8080)
 * - donutBackend: Solana DeFi portfolio & transactions (port 3000)
 * - hummingbot: Multi-exchange trading & bot orchestration (port 8000)
 * - telegram: Notification delivery
 */

import { HummingbotClient, HummingbotClientConfig } from "./hummingbot-client.js";
import { DonutAgentsClient, DonutAgentsClientConfig } from "./donut-agents-client.js";
import { DonutBackendClient, DonutBackendClientConfig } from "./donut-backend-client.js";
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
export type ClientType = "donutAgents" | "donutBackend" | "hummingbot" | "telegram";

/**
 * Configuration union for all client types
 */
export type ClientConfig =
  | { type: "donutAgents"; config: DonutAgentsClientConfig }
  | { type: "donutBackend"; config: DonutBackendClientConfig }
  | { type: "hummingbot"; config: HummingbotClientConfig }
  | { type: "telegram"; config: TelegramConfig };

/**
 * Client instance union
 */
export type Client = DonutAgentsClient | DonutBackendClient | HummingbotClient | TelegramClient;

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
// Default URLs
// ============================================================================

const DEFAULT_DONUT_AGENTS_URL = "http://localhost:8080";
const DEFAULT_DONUT_BACKEND_URL = "http://localhost:3000";
const DEFAULT_HUMMINGBOT_URL = "http://localhost:8000";

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Get or create a Donut Agents client
 */
export function getDonutAgentsClient(config?: Partial<DonutAgentsClientConfig>): DonutAgentsClient {
  const appConfig = loadConfig();
  const baseUrl = config?.baseUrl ?? appConfig.donutAgentsUrl ?? DEFAULT_DONUT_AGENTS_URL;
  const timeout = config?.timeout ?? 30000;
  const authToken = config?.authToken ?? appConfig.donutAgentsAuthToken;

  const cacheKey = getCacheKey("donutAgents", baseUrl);

  let client = clientCache.get(cacheKey);
  if (!client) {
    client = new DonutAgentsClient({ baseUrl, timeout, authToken });
    clientCache.set(cacheKey, client);
  }

  return client as DonutAgentsClient;
}

/**
 * Get or create a Donut Backend client
 */
export function getDonutBackendClient(config?: Partial<DonutBackendClientConfig>): DonutBackendClient {
  const appConfig = loadConfig();
  const baseUrl = config?.baseUrl ?? appConfig.donutBackendUrl ?? DEFAULT_DONUT_BACKEND_URL;
  const timeout = config?.timeout ?? 30000;
  const authToken = config?.authToken ?? appConfig.donutBackendAuthToken;

  const cacheKey = getCacheKey("donutBackend", baseUrl);

  let client = clientCache.get(cacheKey);
  if (!client) {
    client = new DonutBackendClient({ baseUrl, timeout, authToken });
    clientCache.set(cacheKey, client);
  }

  return client as DonutBackendClient;
}

/**
 * Get or create a Hummingbot client
 */
export function getHummingbotClient(config?: Partial<HummingbotClientConfig>): HummingbotClient {
  const appConfig = loadConfig();
  const baseUrl = config?.baseUrl ?? appConfig.hummingbotUrl ?? DEFAULT_HUMMINGBOT_URL;
  const timeout = config?.timeout ?? 30000;
  const username = config?.username ?? appConfig.hummingbotUsername;
  const password = config?.password ?? appConfig.hummingbotPassword;

  const cacheKey = getCacheKey("hummingbot", baseUrl);

  let client = clientCache.get(cacheKey);
  if (!client) {
    client = new HummingbotClient({ baseUrl, timeout, username, password });
    clientCache.set(cacheKey, client);
  }

  return client as HummingbotClient;
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
  config?: T extends "donutAgents"
    ? Partial<DonutAgentsClientConfig>
    : T extends "donutBackend"
      ? Partial<DonutBackendClientConfig>
      : T extends "hummingbot"
        ? Partial<HummingbotClientConfig>
        : Partial<TelegramConfig>
): T extends "donutAgents"
  ? DonutAgentsClient
  : T extends "donutBackend"
    ? DonutBackendClient
    : T extends "hummingbot"
      ? HummingbotClient
      : TelegramClient | null {
  switch (type) {
    case "donutAgents":
      return getDonutAgentsClient(config as Partial<DonutAgentsClientConfig>) as ReturnType<typeof createClient<T>>;
    case "donutBackend":
      return getDonutBackendClient(config as Partial<DonutBackendClientConfig>) as ReturnType<typeof createClient<T>>;
    case "hummingbot":
      return getHummingbotClient(config as Partial<HummingbotClientConfig>) as ReturnType<typeof createClient<T>>;
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
      case "donutAgents":
        client = getDonutAgentsClient();
        break;
      case "donutBackend":
        client = getDonutBackendClient();
        break;
      case "hummingbot":
        client = getHummingbotClient();
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
    const isHealthy = await (client as DonutAgentsClient | DonutBackendClient | HummingbotClient).healthCheck?.() ?? false;
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
  const types: ClientType[] = ["donutAgents", "donutBackend", "hummingbot", "telegram"];
  const results = await Promise.all(types.map(checkBackendHealth));
  return results;
}

/**
 * Get the preferred available backend for AI agent operations
 */
export async function getPreferredAgentBackend(): Promise<"donutAgents" | null> {
  const health = await checkBackendHealth("donutAgents");
  return health.available ? "donutAgents" : null;
}

/**
 * Get the preferred available backend for Solana DeFi operations
 */
export async function getPreferredSolanaBackend(): Promise<"donutBackend" | null> {
  const health = await checkBackendHealth("donutBackend");
  return health.available ? "donutBackend" : null;
}

/**
 * Get the preferred available backend for multi-exchange trading
 */
export async function getPreferredTradingBackend(): Promise<"hummingbot" | null> {
  const health = await checkBackendHealth("hummingbot");
  return health.available ? "hummingbot" : null;
}
