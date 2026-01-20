/**
 * Integrations Module - Barrel Exports
 *
 * Re-exports all integration clients, factories, and utilities.
 */

// ============================================================================
// Clients
// ============================================================================

// Donut Agents Backend client (AI trading agents)
export {
  DonutAgentsClient,
  DonutAgentsClientConfig,
} from "./donut-agents-client.js";

// Donut Backend client (Solana DeFi)
export {
  DonutBackendClient,
  DonutBackendClientConfig,
} from "./donut-backend-client.js";

// Hummingbot Dashboard client (multi-exchange trading)
export {
  HummingbotClient,
  HummingbotClientConfig,
  HummingbotStrategy,
  HummingbotBot,
  MarketData,
  CandleData,
} from "./hummingbot-client.js";

// Telegram notification functions
export {
  TelegramClientConfig,
  loadTelegramConfig,
  sendMessage,
  sendTradeApproval,
  editMessage,
  validateCredentials,
  startWebhookServer,
  stopWebhookServer,
  waitForApproval,
  formatNotification,
} from "./telegram-client.js";

// ============================================================================
// Factory
// ============================================================================

export {
  // Wrapper class
  TelegramClient,
  TelegramConfig,
  // Types
  ClientType,
  ClientConfig,
  Client,
  BackendHealth,
  // Factory functions
  getDonutAgentsClient,
  getDonutBackendClient,
  getHummingbotClient,
  getTelegramClient,
  createClient,
  // Cache management
  clearClientCache,
  clearClient,
  getCacheSize,
  isClientCached,
  // Health checks
  checkBackendHealth,
  checkAllBackendsHealth,
  getPreferredAgentBackend,
  getPreferredSolanaBackend,
  getPreferredTradingBackend,
} from "./client-factory.js";

// ============================================================================
// Base Client (for extension)
// ============================================================================

export {
  BaseHttpClient,
  AuthenticatedHttpClient,
  BaseClientConfig,
  AuthenticatedClientConfig,
  HttpMethod,
  RequestOptions,
} from "./base-client.js";
