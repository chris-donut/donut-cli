/**
 * Integrations Module - Barrel Exports
 *
 * Re-exports all integration clients, factories, and utilities.
 */

// ============================================================================
// Clients
// ============================================================================

// Hummingbot Dashboard client
export {
  HummingbotClient,
  HummingbotClientConfig,
  HummingbotStrategy,
  HummingbotBot,
  MarketData,
  CandleData,
} from "./hummingbot-client.js";

// nofx backtesting client
export {
  NofxClient,
  NofxClientConfig,
  BacktestDecision,
  BacktestRunMetadata,
} from "./nofx-client.js";

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
  getHummingbotClient,
  getNofxClient,
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
  getPreferredBacktestBackend,
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
