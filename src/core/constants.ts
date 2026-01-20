/**
 * Centralized Constants - Application-wide configuration values
 *
 * Single source of truth for all magic numbers, default values,
 * and configuration constants throughout the application.
 */

import path from "path";
import os from "os";

// ============================================================================
// Directory Paths
// ============================================================================

export const DONUT_DIRS = {
  /** Base configuration directory */
  config: path.join(os.homedir(), ".donut"),

  /** Session storage directory */
  sessions: ".sessions",

  /** Paper trading sessions directory */
  paperSessions: path.join(os.homedir(), ".donut", "paper-sessions"),

  /** Notifications configuration file */
  notificationsConfig: path.join(os.homedir(), ".donut", "notifications.json"),
} as const;

// ============================================================================
// Default Values
// ============================================================================

export const DEFAULTS = {
  /** Default trading session directory */
  sessionDir: ".sessions",

  /** Default initial balance for paper trading */
  paperTradingBalance: 10000,

  /** Default backtest initial balance */
  backtestBalance: 10000,

  /** Default number of backtest results to list */
  backtestListLimit: 10,

  /** Default number of trades to show */
  tradeListLimit: 20,

  /** Default Claude model to use */
  claudeModel: "sonnet" as const,

  /** Default Claude model (alias for claudeModel) */
  model: "sonnet" as const,

  /** Default maximum agent turns */
  maxAgentTurns: 25,

  /** Default maximum turns (alias) */
  maxTurns: 25,

  /** Default maximum budget in USD */
  maxBudgetUsd: 100,

  /** Default Python path */
  pythonPath: "python3",

  /** Default log level */
  logLevel: "info" as const,

  /** Default max position size in USD */
  maxPositionSizeUsd: 10000,

  /** Default max daily loss in USD */
  maxDailyLossUsd: 1000,

  /** Default max open positions */
  maxOpenPositions: 10,
} as const;

// ============================================================================
// Backend Ports
// ============================================================================

export const PORTS = {
  /** Donut Agents Backend default port (AI trading agents) */
  donutAgents: 8080,

  /** Donut Backend default port (Solana DeFi) */
  donutBackend: 3000,

  /** Hummingbot API default port (multi-exchange trading) */
  hummingbot: 8000,

  /** PostgreSQL default port */
  postgres: 5432,
} as const;

// ============================================================================
// API Timeouts
// ============================================================================

export const TIMEOUTS = {
  /** Default HTTP request timeout (ms) */
  httpRequest: 30000,

  /** Health check timeout (ms) */
  healthCheck: 5000,

  /** Backtest polling interval (ms) */
  backtestPoll: 2000,

  /** Trade approval timeout (ms) */
  tradeApproval: 300000, // 5 minutes

  /** Session auto-save interval (ms) */
  sessionAutoSave: 60000, // 1 minute
} as const;

// ============================================================================
// Retry Configuration
// ============================================================================

export const RETRY = {
  /** Maximum retry attempts */
  maxAttempts: 3,

  /** Base delay between retries (ms) */
  baseDelay: 1000,

  /** Maximum delay between retries (ms) */
  maxDelay: 30000,

  /** Backoff multiplier */
  backoffMultiplier: 2,
} as const;

// ============================================================================
// Trading Limits
// ============================================================================

export const TRADING_LIMITS = {
  /** Maximum leverage for BTC/ETH */
  btcEthMaxLeverage: 20,

  /** Maximum leverage for altcoins */
  altcoinMaxLeverage: 10,

  /** Maximum positions per portfolio */
  maxPositions: 10,

  /** Minimum confidence score for signals */
  minConfidence: 0.7,

  /** Maximum daily loss percentage */
  maxDailyLoss: 0.05,

  /** Maximum single trade risk */
  maxTradeRisk: 0.02,
} as const;

// ============================================================================
// Demo Mode Constants
// ============================================================================

export const DEMO = {
  /** Prefix for demo IDs */
  idPrefix: "DEMO-",

  /** Number of demo strategies */
  strategyCount: 5,

  /** Number of demo backtest runs */
  backtestRunCount: 5,

  /** Number of demo trades per session */
  tradesPerSession: 50,
} as const;

// ============================================================================
// Supported Symbols
// ============================================================================

export const SYMBOLS = {
  /** Major trading pairs */
  majors: ["BTCUSDT", "ETHUSDT"],

  /** Common altcoins */
  alts: ["SOLUSDT", "DOGEUSDT", "AVAXUSDT", "LINKUSDT", "ADAUSDT"],

  /** All supported symbols */
  all: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "DOGEUSDT", "AVAXUSDT", "LINKUSDT", "ADAUSDT"],
} as const;

// ============================================================================
// Workflow Stages
// ============================================================================

export const STAGES = {
  DISCOVERY: "DISCOVERY",
  STRATEGY_BUILD: "STRATEGY_BUILD",
  BACKTEST: "BACKTEST",
  ANALYSIS: "ANALYSIS",
  PAPER_TRADING: "PAPER_TRADING",
  EXECUTION: "EXECUTION",
} as const;

// ============================================================================
// Agent Types
// ============================================================================

export const AGENT_TYPES = {
  STRATEGY_BUILDER: "STRATEGY_BUILDER",
  BACKTEST_ANALYST: "BACKTEST_ANALYST",
  CHART_ANALYST: "CHART_ANALYST",
  EXECUTION_ASSISTANT: "EXECUTION_ASSISTANT",
  ORCHESTRATOR: "ORCHESTRATOR",
  SENTIMENT_ANALYST: "SENTIMENT_ANALYST",
} as const;

// ============================================================================
// Environment Variable Names
// ============================================================================

export const ENV_VARS = {
  anthropicApiKey: "ANTHROPIC_API_KEY",
  claudeModel: "CLAUDE_MODEL",

  // Donut Agents Backend
  donutAgentsUrl: "DONUT_AGENTS_URL",
  donutAgentsAuthToken: "DONUT_AGENTS_AUTH_TOKEN",

  // Donut Backend
  donutBackendUrl: "DONUT_BACKEND_URL",
  donutBackendAuthToken: "DONUT_BACKEND_AUTH_TOKEN",

  // Hummingbot API
  hummingbotUrl: "HUMMINGBOT_URL",
  hummingbotUsername: "HUMMINGBOT_USERNAME",
  hummingbotPassword: "HUMMINGBOT_PASSWORD",

  // Session and logging
  sessionDir: "SESSION_DIR",
  logLevel: "LOG_LEVEL",

  // Notifications
  telegramBotToken: "TELEGRAM_BOT_TOKEN",
  telegramChatId: "TELEGRAM_CHAT_ID",
} as const;
