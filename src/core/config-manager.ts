/**
 * Centralized Configuration Manager
 *
 * Provides:
 * - Singleton pattern for consistent config access
 * - Layered config loading (defaults -> file -> env -> CLI)
 * - Type-safe config sections
 * - Validation with detailed errors
 * - Config caching and refresh
 */

import { config as dotenvConfig } from "dotenv";
import { z } from "zod";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import {
  TerminalConfig,
  TerminalConfigSchema,
  SentimentApiConfig,
  RiskConfig,
  RiskConfigSchema,
  SentimentApiConfigSchema,
} from "./types.js";
import { ConfigError } from "./errors.js";
import { DEFAULTS, DONUT_DIRS, PORTS, TIMEOUTS } from "./constants.js";

// ============================================================================
// Configuration Schemas
// ============================================================================

/**
 * Notification configuration schema
 */
export const NotificationConfigSchema = z.object({
  telegram: z.object({
    botToken: z.string().optional(),
    chatId: z.string().optional(),
    enabled: z.boolean().default(false),
  }).optional(),
  discord: z.object({
    webhookUrl: z.string().url().optional(),
    enabled: z.boolean().default(false),
  }).optional(),
  webhook: z.object({
    url: z.string().url().optional(),
    enabled: z.boolean().default(false),
  }).optional(),
});

export type NotificationConfig = z.infer<typeof NotificationConfigSchema>;

/**
 * Full application configuration schema
 */
export const AppConfigSchema = z.object({
  terminal: TerminalConfigSchema,
  risk: RiskConfigSchema,
  sentiment: SentimentApiConfigSchema,
  notifications: NotificationConfigSchema.optional(),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

// ============================================================================
// Config Sources
// ============================================================================

type ConfigSource = "defaults" | "file" | "env" | "cli";

interface ConfigLayer {
  source: ConfigSource;
  config: Partial<AppConfig>;
}

// ============================================================================
// Configuration Manager
// ============================================================================

/**
 * Singleton configuration manager
 */
export class ConfigManager {
  private static instance: ConfigManager | null = null;

  private layers: ConfigLayer[] = [];
  private cachedConfig: AppConfig | null = null;
  private configDir: string;
  private configFile: string;

  private constructor() {
    this.configDir = path.join(os.homedir(), DONUT_DIRS.config);
    this.configFile = path.join(this.configDir, "config.json");
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * Reset the singleton (for testing)
   */
  static reset(): void {
    ConfigManager.instance = null;
  }

  /**
   * Initialize configuration from all sources
   */
  async initialize(cliOverrides?: Partial<AppConfig>): Promise<void> {
    this.layers = [];
    this.cachedConfig = null;

    // Load dotenv
    dotenvConfig();

    // Layer 1: Defaults
    this.layers.push({
      source: "defaults",
      config: this.getDefaults(),
    });

    // Layer 2: Config file (if exists)
    const fileConfig = await this.loadConfigFile();
    if (fileConfig) {
      this.layers.push({
        source: "file",
        config: fileConfig,
      });
    }

    // Layer 3: Environment variables
    this.layers.push({
      source: "env",
      config: this.loadFromEnv(),
    });

    // Layer 4: CLI overrides
    if (cliOverrides) {
      this.layers.push({
        source: "cli",
        config: cliOverrides,
      });
    }
  }

  /**
   * Get the merged configuration
   */
  getConfig(): AppConfig {
    if (this.cachedConfig) {
      return this.cachedConfig;
    }

    // Merge all layers
    const merged = this.layers.reduce(
      (acc, layer) => this.deepMerge(acc, layer.config),
      {} as Partial<AppConfig>
    );

    // Validate and cache
    const result = AppConfigSchema.safeParse(merged);
    if (!result.success) {
      const issues = result.error.issues.map(
        (i) => `  - ${i.path.join(".")}: ${i.message}`
      );
      throw new ConfigError(`Invalid configuration:\n${issues.join("\n")}`, {
        hint: "Check your .env file or config.json",
      });
    }

    this.cachedConfig = result.data;
    return this.cachedConfig;
  }

  /**
   * Get terminal configuration section
   */
  getTerminalConfig(): TerminalConfig {
    return this.getConfig().terminal;
  }

  /**
   * Get risk configuration section
   */
  getRiskConfig(): RiskConfig {
    return this.getConfig().risk;
  }

  /**
   * Get sentiment configuration section
   */
  getSentimentConfig(): SentimentApiConfig {
    return this.getConfig().sentiment;
  }

  /**
   * Get notification configuration section
   */
  getNotificationConfig(): NotificationConfig | undefined {
    return this.getConfig().notifications;
  }

  /**
   * Validate that required API keys are present
   */
  validateRequired(): void {
    const config = this.getTerminalConfig();

    if (!config.anthropicApiKey) {
      throw new ConfigError("ANTHROPIC_API_KEY is required", {
        hint: "Set it in your .env file or config.json",
      });
    }

    // Check for at least one backend
    if (!config.hummingbotUrl && !config.donutAgentsUrl && !config.donutBackendUrl) {
      throw new ConfigError("No backend configured", {
        hint: "Set HUMMINGBOT_URL, DONUT_AGENTS_URL, or DONUT_BACKEND_URL in your .env file",
      });
    }
  }

  /**
   * Check if a backend is configured
   */
  hasBackend(type: "hummingbot" | "donutAgents" | "donutBackend"): boolean {
    const config = this.getTerminalConfig();
    switch (type) {
      case "hummingbot":
        return !!config.hummingbotUrl;
      case "donutAgents":
        return !!config.donutAgentsUrl;
      case "donutBackend":
        return !!config.donutBackendUrl;
      default:
        return false;
    }
  }

  /**
   * Get the primary backend type
   */
  getPrimaryBackend(): "hummingbot" | "donutAgents" | "donutBackend" | null {
    const config = this.getTerminalConfig();
    if (config.donutAgentsUrl) return "donutAgents";
    if (config.donutBackendUrl) return "donutBackend";
    if (config.hummingbotUrl) return "hummingbot";
    return null;
  }

  /**
   * Refresh configuration (reload from all sources)
   */
  async refresh(): Promise<void> {
    this.cachedConfig = null;
    await this.initialize();
  }

  /**
   * Save current configuration to file
   */
  async saveToFile(): Promise<void> {
    await fs.mkdir(this.configDir, { recursive: true });
    const config = this.getConfig();

    // Remove sensitive data before saving
    const safeConfig = {
      ...config,
      terminal: {
        ...config.terminal,
        anthropicApiKey: undefined,
        donutAgentsAuthToken: undefined,
        donutBackendAuthToken: undefined,
        hummingbotPassword: undefined,
      },
    };

    await fs.writeFile(
      this.configFile,
      JSON.stringify(safeConfig, null, 2)
    );
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Get default configuration values
   */
  private getDefaults(): Partial<AppConfig> {
    return {
      terminal: {
        model: DEFAULTS.model,
        maxTurns: DEFAULTS.maxTurns,
        maxBudgetUsd: DEFAULTS.maxBudgetUsd,
        pythonPath: DEFAULTS.pythonPath,
        sessionDir: DONUT_DIRS.sessions,
        logLevel: DEFAULTS.logLevel,
      } as TerminalConfig,
      risk: {
        maxPositionSizeUsd: DEFAULTS.maxPositionSizeUsd,
        maxDailyLossUsd: DEFAULTS.maxDailyLossUsd,
        maxOpenPositions: DEFAULTS.maxOpenPositions,
        requireConfirmation: true,
        blacklistedSymbols: [],
      },
      sentiment: {
        useMockData: true,
      },
    };
  }

  /**
   * Load configuration from file
   */
  private async loadConfigFile(): Promise<Partial<AppConfig> | null> {
    try {
      const content = await fs.readFile(this.configFile, "utf-8");
      return JSON.parse(content) as Partial<AppConfig>;
    } catch {
      // File doesn't exist or is invalid
      return null;
    }
  }

  /**
   * Load configuration from environment variables
   */
  private loadFromEnv(): Partial<AppConfig> {
    const terminal: Partial<TerminalConfig> = {};
    const risk: Partial<RiskConfig> = {};
    const sentiment: Partial<SentimentApiConfig> = {};

    // Terminal config
    if (process.env.ANTHROPIC_API_KEY) {
      terminal.anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    }
    if (process.env.CLAUDE_MODEL) {
      terminal.model = process.env.CLAUDE_MODEL as "sonnet" | "opus" | "haiku";
    }
    if (process.env.MAX_TURNS) {
      terminal.maxTurns = parseInt(process.env.MAX_TURNS, 10);
    }
    if (process.env.MAX_BUDGET_USD) {
      terminal.maxBudgetUsd = parseFloat(process.env.MAX_BUDGET_USD);
    }
    if (process.env.HUMMINGBOT_URL) {
      terminal.hummingbotUrl = process.env.HUMMINGBOT_URL;
    }
    // Donut Agents Backend
    if (process.env.DONUT_AGENTS_URL) {
      terminal.donutAgentsUrl = process.env.DONUT_AGENTS_URL;
    }
    if (process.env.DONUT_AGENTS_AUTH_TOKEN) {
      terminal.donutAgentsAuthToken = process.env.DONUT_AGENTS_AUTH_TOKEN;
    }

    // Donut Backend (Solana DeFi)
    if (process.env.DONUT_BACKEND_URL) {
      terminal.donutBackendUrl = process.env.DONUT_BACKEND_URL;
    }
    if (process.env.DONUT_BACKEND_AUTH_TOKEN) {
      terminal.donutBackendAuthToken = process.env.DONUT_BACKEND_AUTH_TOKEN;
    }

    // Hummingbot API credentials
    if (process.env.HUMMINGBOT_USERNAME) {
      terminal.hummingbotUsername = process.env.HUMMINGBOT_USERNAME;
    }
    if (process.env.HUMMINGBOT_PASSWORD) {
      terminal.hummingbotPassword = process.env.HUMMINGBOT_PASSWORD;
    }

    // Python harness
    if (process.env.HARNESS_WORKING_DIR) {
      terminal.harnessWorkingDir = process.env.HARNESS_WORKING_DIR;
    }
    if (process.env.PYTHON_PATH) {
      terminal.pythonPath = process.env.PYTHON_PATH;
    }
    if (process.env.DONUT_BROWSER_URL) {
      terminal.donutBrowserUrl = process.env.DONUT_BROWSER_URL;
    }
    if (process.env.SESSION_DIR) {
      terminal.sessionDir = process.env.SESSION_DIR;
    }
    if (process.env.LOG_LEVEL) {
      terminal.logLevel = process.env.LOG_LEVEL as "debug" | "info" | "warn" | "error";
    }

    // Risk config
    if (process.env.MAX_POSITION_SIZE_USD) {
      risk.maxPositionSizeUsd = parseFloat(process.env.MAX_POSITION_SIZE_USD);
    }
    if (process.env.MAX_DAILY_LOSS_USD) {
      risk.maxDailyLossUsd = parseFloat(process.env.MAX_DAILY_LOSS_USD);
    }
    if (process.env.MAX_OPEN_POSITIONS) {
      risk.maxOpenPositions = parseInt(process.env.MAX_OPEN_POSITIONS, 10);
    }
    if (process.env.REQUIRE_TRADE_CONFIRMATION) {
      risk.requireConfirmation = process.env.REQUIRE_TRADE_CONFIRMATION !== "false";
    }
    if (process.env.BLACKLISTED_SYMBOLS) {
      risk.blacklistedSymbols = process.env.BLACKLISTED_SYMBOLS
        .split(",")
        .map((s) => s.trim().toUpperCase());
    }

    // Sentiment config
    if (process.env.TWITTER_BEARER_TOKEN) {
      sentiment.twitter = {
        bearerToken: process.env.TWITTER_BEARER_TOKEN,
        apiKey: process.env.TWITTER_API_KEY,
        apiSecret: process.env.TWITTER_API_SECRET,
      };
      sentiment.useMockData = false;
    }
    if (process.env.DISCORD_BOT_TOKEN) {
      sentiment.discord = {
        botToken: process.env.DISCORD_BOT_TOKEN,
        guildIds: process.env.DISCORD_GUILD_IDS?.split(",").map((s) => s.trim()),
      };
      sentiment.useMockData = false;
    }
    if (process.env.TELEGRAM_BOT_TOKEN) {
      sentiment.telegram = {
        botToken: process.env.TELEGRAM_BOT_TOKEN,
        channelIds: process.env.TELEGRAM_CHANNEL_IDS?.split(",").map((s) => s.trim()),
      };
      sentiment.useMockData = false;
    }

    return {
      terminal: Object.keys(terminal).length > 0 ? terminal as TerminalConfig : undefined,
      risk: Object.keys(risk).length > 0 ? risk as RiskConfig : undefined,
      sentiment: Object.keys(sentiment).length > 0 ? sentiment as SentimentApiConfig : undefined,
    };
  }

  /**
   * Deep merge two objects
   */
  private deepMerge<T extends Record<string, unknown>>(
    target: T,
    source: Partial<T>
  ): T {
    const result = { ...target };

    for (const key in source) {
      const sourceValue = source[key];
      const targetValue = target[key];

      if (sourceValue === undefined) {
        continue;
      }

      if (
        sourceValue &&
        typeof sourceValue === "object" &&
        !Array.isArray(sourceValue) &&
        targetValue &&
        typeof targetValue === "object" &&
        !Array.isArray(targetValue)
      ) {
        result[key] = this.deepMerge(
          targetValue as Record<string, unknown>,
          sourceValue as Record<string, unknown>
        ) as T[typeof key];
      } else {
        result[key] = sourceValue as T[typeof key];
      }
    }

    return result;
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Get the global config manager instance
 */
export function getConfigManager(): ConfigManager {
  return ConfigManager.getInstance();
}

/**
 * Initialize and get terminal config (convenience function)
 */
export async function initializeConfig(
  cliOverrides?: Partial<AppConfig>
): Promise<TerminalConfig> {
  const manager = getConfigManager();
  await manager.initialize(cliOverrides);
  return manager.getTerminalConfig();
}

/**
 * Get terminal config (must call initializeConfig first)
 */
export function getTerminalConfig(): TerminalConfig {
  return getConfigManager().getTerminalConfig();
}

/**
 * Get risk config (must call initializeConfig first)
 */
export function getRiskConfig(): RiskConfig {
  return getConfigManager().getRiskConfig();
}
