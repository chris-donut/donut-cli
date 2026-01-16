/**
 * Configuration loading and validation
 */

import { config as dotenvConfig } from "dotenv";
import { z } from "zod";
import {
  TerminalConfig,
  TerminalConfigSchema,
  SentimentApiConfig,
  RiskConfig,
  RiskConfigSchema,
  SentimentApiConfigSchema,
} from "./types.js";

// Load environment variables
dotenvConfig();

/**
 * Load configuration from environment variables
 */
export function loadConfig(): TerminalConfig {
  const rawConfig = {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.CLAUDE_MODEL || "sonnet",
    maxTurns: parseInt(process.env.MAX_TURNS || "50", 10),
    maxBudgetUsd: parseFloat(process.env.MAX_BUDGET_USD || "5.0"),
    // Backend URLs - Hummingbot is preferred, nofx as fallback
    hummingbotUrl: process.env.HUMMINGBOT_URL,
    nofxApiUrl: process.env.NOFX_API_URL,
    nofxAuthToken: process.env.NOFX_AUTH_TOKEN,
    harnessWorkingDir: process.env.HARNESS_WORKING_DIR,
    pythonPath: process.env.PYTHON_PATH || "python3",
    donutBrowserUrl: process.env.DONUT_BROWSER_URL,
    sessionDir: process.env.SESSION_DIR || ".sessions",
    logLevel: process.env.LOG_LEVEL || "info",
  };

  try {
    return TerminalConfigSchema.parse(rawConfig);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
      throw new Error(`Invalid configuration:\n${issues.join("\n")}`);
    }
    throw error;
  }
}

/**
 * Validate that required API keys are present
 */
export function validateApiKeys(config: TerminalConfig): void {
  if (!config.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is required. Set it in your .env file.");
  }
}

/**
 * Get default configuration for testing
 */
export function getDefaultConfig(): Partial<TerminalConfig> {
  return {
    model: "sonnet",
    maxTurns: 50,
    maxBudgetUsd: 5.0,
    nofxApiUrl: "http://localhost:8080",
    pythonPath: "python3",
    sessionDir: ".sessions",
    logLevel: "info",
  };
}

// ============================================================================
// Sentiment API Configuration (Phase 2: Multi-Agent Foundation)
// ============================================================================

/**
 * Load sentiment API configuration from environment variables
 *
 * Environment variables:
 * - TWITTER_BEARER_TOKEN: Twitter API v2 bearer token
 * - TWITTER_API_KEY: Twitter API key (optional)
 * - TWITTER_API_SECRET: Twitter API secret (optional)
 * - DISCORD_BOT_TOKEN: Discord bot token for guild monitoring
 * - DISCORD_GUILD_IDS: Comma-separated list of guild IDs to monitor
 * - TELEGRAM_BOT_TOKEN: Telegram bot token
 * - TELEGRAM_CHANNEL_IDS: Comma-separated list of channel IDs to monitor
 */
export function loadSentimentConfig(): SentimentApiConfig {
  const rawConfig: Partial<SentimentApiConfig> = {
    useMockData: true, // Default to mock until credentials provided
  };

  // Twitter configuration
  if (process.env.TWITTER_BEARER_TOKEN) {
    rawConfig.twitter = {
      bearerToken: process.env.TWITTER_BEARER_TOKEN,
      apiKey: process.env.TWITTER_API_KEY,
      apiSecret: process.env.TWITTER_API_SECRET,
    };
    rawConfig.useMockData = false;
  }

  // Discord configuration
  if (process.env.DISCORD_BOT_TOKEN) {
    rawConfig.discord = {
      botToken: process.env.DISCORD_BOT_TOKEN,
      guildIds: process.env.DISCORD_GUILD_IDS?.split(",").map((s) => s.trim()),
    };
    rawConfig.useMockData = false;
  }

  // Telegram configuration
  if (process.env.TELEGRAM_BOT_TOKEN) {
    rawConfig.telegram = {
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      channelIds: process.env.TELEGRAM_CHANNEL_IDS?.split(",").map((s) => s.trim()),
    };
    rawConfig.useMockData = false;
  }

  // Validate with schema
  const parsed = SentimentApiConfigSchema.safeParse(rawConfig);
  if (parsed.success) {
    return parsed.data;
  }

  console.warn("Invalid sentiment config, using mock data:", parsed.error.format());
  return { useMockData: true };
}

// ============================================================================
// Risk Management Configuration (Phase 2: Multi-Agent Foundation)
// ============================================================================

/**
 * Load risk management configuration from environment variables
 *
 * Environment variables:
 * - MAX_POSITION_SIZE_USD: Maximum position size in USD (default: 10000)
 * - MAX_DAILY_LOSS_USD: Maximum daily loss limit in USD (default: 1000)
 * - MAX_OPEN_POSITIONS: Maximum number of concurrent positions (default: 5)
 * - REQUIRE_TRADE_CONFIRMATION: Whether trades require manual confirmation (default: true)
 * - BLACKLISTED_SYMBOLS: Comma-separated list of symbols to block
 */
export function loadRiskConfig(): RiskConfig {
  const rawConfig = {
    maxPositionSizeUsd: parseFloat(process.env.MAX_POSITION_SIZE_USD || "10000"),
    maxDailyLossUsd: parseFloat(process.env.MAX_DAILY_LOSS_USD || "1000"),
    maxOpenPositions: parseInt(process.env.MAX_OPEN_POSITIONS || "5", 10),
    requireConfirmation: process.env.REQUIRE_TRADE_CONFIRMATION !== "false",
    blacklistedSymbols: process.env.BLACKLISTED_SYMBOLS
      ? process.env.BLACKLISTED_SYMBOLS.split(",").map((s) => s.trim().toUpperCase())
      : [],
  };

  const parsed = RiskConfigSchema.safeParse(rawConfig);
  if (parsed.success) {
    return parsed.data;
  }

  console.warn("Invalid risk config, using defaults:", parsed.error.format());
  return {
    maxPositionSizeUsd: 10000,
    maxDailyLossUsd: 1000,
    maxOpenPositions: 5,
    requireConfirmation: true,
    blacklistedSymbols: [],
  };
}
