/**
 * Client Factory - Centralized creation of backend clients
 *
 * Provides a single point of control for creating and managing
 * backend client instances based on configuration.
 */

import { HummingbotClient, HummingbotClientConfig } from "./hummingbot-client.js";
import { NofxClient, NofxClientConfig } from "./nofx-client.js";
import { TelegramClientConfig } from "./telegram-client.js";
import { ConfigError } from "../core/errors.js";
import { TerminalConfig } from "../core/types.js";

// ============================================================================
// Client Types
// ============================================================================

export type BackendType = "hummingbot" | "nofx";
export type ClientType = "hummingbot" | "nofx" | "telegram";

// ============================================================================
// Client Registry (Singleton instances)
// ============================================================================

const clientRegistry: Map<string, unknown> = new Map();

/**
 * Generate a unique key for client caching
 */
function getClientKey(type: ClientType, baseUrl: string): string {
  return `${type}:${baseUrl}`;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create or retrieve a HummingbotClient instance
 */
export function getHummingbotClient(
  config: HummingbotClientConfig | TerminalConfig
): HummingbotClient {
  const baseUrl = "hummingbotUrl" in config
    ? config.hummingbotUrl
    : (config as HummingbotClientConfig).baseUrl;

  if (!baseUrl) {
    throw new ConfigError("Hummingbot URL not configured", {
      hint: "Set HUMMINGBOT_URL in your environment or .env file",
    });
  }

  const key = getClientKey("hummingbot", baseUrl);

  if (!clientRegistry.has(key)) {
    const clientConfig: HummingbotClientConfig = {
      baseUrl,
      timeout: "timeout" in config ? config.timeout : undefined,
    };
    clientRegistry.set(key, new HummingbotClient(clientConfig));
  }

  return clientRegistry.get(key) as HummingbotClient;
}

/**
 * Create or retrieve a NofxClient instance
 */
export function getNofxClient(
  config: NofxClientConfig | TerminalConfig
): NofxClient {
  const baseUrl = "nofxApiUrl" in config
    ? config.nofxApiUrl
    : (config as NofxClientConfig).baseUrl;

  if (!baseUrl) {
    throw new ConfigError("nofx API URL not configured", {
      hint: "Set NOFX_API_URL in your environment or .env file",
    });
  }

  const key = getClientKey("nofx", baseUrl);

  if (!clientRegistry.has(key)) {
    const clientConfig: NofxClientConfig = {
      baseUrl,
      timeout: "timeout" in config ? config.timeout : undefined,
      authToken: "authToken" in config ? config.authToken : undefined,
    };
    clientRegistry.set(key, new NofxClient(clientConfig));
  }

  return clientRegistry.get(key) as NofxClient;
}

/**
 * Get the appropriate backtest client based on configuration
 * Prefers Hummingbot if available, falls back to nofx
 */
export function getBacktestClient(
  config: TerminalConfig
): HummingbotClient | NofxClient {
  if (config.hummingbotUrl) {
    return getHummingbotClient(config);
  }

  if (config.nofxApiUrl) {
    return getNofxClient(config);
  }

  throw new ConfigError("No backtest backend configured", {
    hint: "Set HUMMINGBOT_URL or NOFX_API_URL in your environment",
  });
}

/**
 * Get a Telegram client configuration (not a persistent client)
 */
export function getTelegramConfig(
  botToken: string,
  chatId: string
): TelegramClientConfig {
  if (!botToken || !chatId) {
    throw new ConfigError("Telegram credentials not configured", {
      hint: "Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID",
    });
  }

  return { botToken, chatId };
}

// ============================================================================
// Registry Management
// ============================================================================

/**
 * Clear all cached client instances
 * Useful for testing or reconnection scenarios
 */
export function clearClientRegistry(): void {
  clientRegistry.clear();
}

/**
 * Remove a specific client from the registry
 */
export function removeClient(type: ClientType, baseUrl: string): boolean {
  const key = getClientKey(type, baseUrl);
  return clientRegistry.delete(key);
}

/**
 * Check if a client exists in the registry
 */
export function hasClient(type: ClientType, baseUrl: string): boolean {
  const key = getClientKey(type, baseUrl);
  return clientRegistry.has(key);
}

/**
 * Get the number of cached clients
 */
export function getClientCount(): number {
  return clientRegistry.size;
}

// ============================================================================
// Health Check Utilities
// ============================================================================

/**
 * Check health of all configured backends
 */
export async function checkAllBackends(config: TerminalConfig): Promise<{
  hummingbot: boolean | null;
  nofx: boolean | null;
}> {
  const results: { hummingbot: boolean | null; nofx: boolean | null } = {
    hummingbot: null,
    nofx: null,
  };

  if (config.hummingbotUrl) {
    try {
      const client = getHummingbotClient(config);
      results.hummingbot = await client.healthCheck();
    } catch {
      results.hummingbot = false;
    }
  }

  if (config.nofxApiUrl) {
    try {
      const client = getNofxClient(config);
      results.nofx = await client.healthCheck();
    } catch {
      results.nofx = false;
    }
  }

  return results;
}

/**
 * Get the first healthy backend
 */
export async function getHealthyBackend(
  config: TerminalConfig
): Promise<BackendType | null> {
  const health = await checkAllBackends(config);

  if (health.hummingbot === true) {
    return "hummingbot";
  }

  if (health.nofx === true) {
    return "nofx";
  }

  return null;
}
