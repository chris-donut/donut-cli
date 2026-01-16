/**
 * Configuration loading and validation
 */

import { config as dotenvConfig } from "dotenv";
import { z } from "zod";
import { TerminalConfig, TerminalConfigSchema } from "./types.js";

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
