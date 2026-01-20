#!/usr/bin/env node
/**
 * Donut CLI - Unified Trading Terminal with Claude Agent SDK
 *
 * A powerful CLI for trading strategy development, backtesting,
 * and execution powered by Claude AI agents.
 *
 * Supports multiple backends:
 * - Donut Agents Backend (AI trading agents with LLM decisions)
 * - Donut Backend (Solana DeFi portfolio & transactions)
 * - Hummingbot API (multi-exchange trading & bot orchestration)
 */

import { Command } from "commander";
import chalk from "chalk";
import { config as dotenvConfig } from "dotenv";
import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createInterface } from "readline";

import {
  registerSessionCommands,
  registerPaperTradingCommands,
  registerNotificationCommands,
  registerDemoCommands,
  registerStrategyCommands,
  registerBacktestCommands,
  registerSetupCommands,
  BANNER,
  BANNER_WITH_HINTS,
  playDonutAnimation,
} from "./cli/index.js";
import { startInteractiveMode } from "./tui/index.js";
import { startInteractiveDemo } from "./demo/index.js";
import { registerShutdownHandler, onShutdown } from "./core/shutdown.js";
import { createLogger } from "./core/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, "..");

const logger = createLogger("cli");

// Load environment variables
dotenvConfig();

// ============================================================================
// Register Graceful Shutdown Handler
// ============================================================================

registerShutdownHandler({ timeout: 5000 });

// Register cleanup callback for logging
onShutdown("logger", () => {
  logger.info("CLI shutdown complete");
});

const program = new Command();

program
  .name("donut")
  .description("Unified trading terminal with Claude Agent SDK")
  .version("0.1.0");

// ============================================================================
// Register All Command Modules
// ============================================================================

registerSessionCommands(program);
registerStrategyCommands(program);
registerBacktestCommands(program);
registerPaperTradingCommands(program);
registerNotificationCommands(program);
registerDemoCommands(program);
registerSetupCommands(program);

// ============================================================================
// Interactive Mode
// ============================================================================

program
  .command("chat")
  .description("Start interactive chat mode with Claude AI")
  .action(async () => {
    // Play the spinning donut animation on startup
    await playDonutAnimation();
    console.log(BANNER);
    try {
      await startInteractiveMode();
    } catch (error) {
      if (error instanceof Error && error.message.includes("ANTHROPIC_API_KEY")) {
        console.error(chalk.red("\nError: ANTHROPIC_API_KEY not set"));
        console.log(chalk.gray("Set your API key: export ANTHROPIC_API_KEY=sk-ant-..."));
      } else {
        console.error(chalk.red("\nError starting interactive mode:"), error);
      }
      process.exit(1);
    }
  });

// ============================================================================
// First-Run Detection
// ============================================================================

/**
 * Check if this appears to be a first-run (no valid API key configured)
 */
function isFirstRun(): boolean {
  const envPath = join(PROJECT_ROOT, ".env");

  // No .env file means first run
  if (!existsSync(envPath)) {
    return true;
  }

  // Check if ANTHROPIC_API_KEY is configured with a valid value
  const envContent = readFileSync(envPath, "utf-8");
  const hasValidKey = /^ANTHROPIC_API_KEY=sk-ant-.+$/m.test(envContent);

  return !hasValidKey;
}

/**
 * Check if the command should skip the first-run welcome
 */
function shouldSkipFirstRunWelcome(): boolean {
  const args = process.argv.slice(2);

  // Skip for help flags
  if (args.includes("--help") || args.includes("-h") || args.includes("-V") || args.includes("--version")) {
    return true;
  }

  // Skip for specific commands that handle their own flow
  const skipCommands = ["demo", "setup", "help"];
  if (args.length > 0 && skipCommands.includes(args[0])) {
    return true;
  }

  return false;
}

/**
 * Show first-run welcome menu
 */
async function showFirstRunWelcome(): Promise<"demo" | "setup" | "skip"> {
  console.log(BANNER_WITH_HINTS);

  console.log(chalk.bold("\n👋 Welcome to Donut CLI!\n"));
  console.log(chalk.gray("It looks like this is your first time here. How would you like to get started?\n"));

  console.log(`  ${chalk.cyan("1)")} ${chalk.bold("Demo Tour")} - Interactive tutorial (no API key needed)`);
  console.log(`  ${chalk.cyan("2)")} ${chalk.bold("Setup")} - Configure your API key now`);
  console.log(`  ${chalk.cyan("3)")} ${chalk.bold("Skip")} - I'll explore on my own\n`);

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(chalk.gray("Enter your choice [1/2/3]: "), (answer) => {
      rl.close();
      const choice = answer.trim();

      if (choice === "1" || choice.toLowerCase() === "demo") {
        resolve("demo");
      } else if (choice === "2" || choice.toLowerCase() === "setup") {
        resolve("setup");
      } else {
        resolve("skip");
      }
    });
  });
}

// ============================================================================
// Parse and Execute
// ============================================================================

async function main(): Promise<void> {
  // Check for first-run experience
  if (isFirstRun() && !shouldSkipFirstRunWelcome() && process.argv.length <= 2) {
    const choice = await showFirstRunWelcome();

    if (choice === "demo") {
      await startInteractiveDemo({});
      return;
    } else if (choice === "setup") {
      // Dynamically import and run setup wizard
      const { runSetupWizard } = await import("./cli/commands/setup.js");
      await runSetupWizard();
      return;
    }
    // For "skip", continue to normal parsing
    console.log(chalk.gray("\nNo problem! Run 'donut --help' to see available commands.\n"));
  }

  program.parse();
}

main().catch((error) => {
  logger.error("CLI error:", error);
  process.exit(1);
});
