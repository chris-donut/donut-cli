/**
 * Integrations - Export all integration modules
 */

// Base client
export { BaseClient, BaseClientConfig, HttpRequestOptions } from "./base-client.js";

// Client factory
export {
  getHummingbotClient,
  getNofxClient,
  getBacktestClient,
  getTelegramConfig,
  clearClientRegistry,
  removeClient,
  hasClient,
  getClientCount,
  checkAllBackends,
  getHealthyBackend,
  BackendType,
  ClientType,
} from "./client-factory.js";

// Individual clients
export {
  HummingbotClient,
  HummingbotClientConfig,
  HummingbotStrategy,
  HummingbotBot,
  MarketData,
  CandleData,
} from "./hummingbot-client.js";

export {
  NofxClient,
  NofxClientConfig,
  BacktestDecision,
  BacktestRunMetadata,
} from "./nofx-client.js";

export {
  TelegramClientConfig,
  validateCredentials,
  sendMessage,
  formatNotification,
  loadTelegramConfig,
  sendTradeApproval,
  editMessage,
  startWebhookServer,
  stopWebhookServer,
  waitForApproval,
  requestApprovalAndWait,
} from "./telegram-client.js";
