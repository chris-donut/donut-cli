#!/usr/bin/env node
/**
 * Donut CLI - Unified Trading Terminal with Claude Agent SDK
 *
 * A powerful CLI for trading strategy development, backtesting,
 * and execution powered by Claude AI agents.
 *
 * Supports multiple backends:
 * - Hummingbot Dashboard (default)
 * - nofx Go engine (optional)
 */

import { Command } from "commander";
import chalk from "chalk";
import { config as dotenvConfig } from "dotenv";

import {
  registerSessionCommands,
  registerPaperTradingCommands,
  registerNotificationCommands,
  registerDemoCommands,
  registerStrategyCommands,
  registerBacktestCommands,
  BANNER,
} from "./cli/index.js";
import { startInteractiveMode } from "./tui/index.js";

// Load environment variables
dotenvConfig();

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

// ============================================================================
// Interactive Mode
// ============================================================================

program
  .command("chat")
  .description("Start interactive chat mode with Claude AI")
  .action(async () => {
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
// Parse and Execute
// ============================================================================

program.parse();
