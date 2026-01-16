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
import { config as dotenvConfig } from "dotenv";

// Import command registration functions
import {
  registerSessionCommands,
  registerStrategyCommands,
  registerBacktestCommands,
  registerPaperTradingCommands,
  registerNotificationCommands,
  registerDemoCommands,
} from "./cli/commands/index.js";

// Import TUI for interactive mode
import { startInteractiveMode } from "./tui/index.js";

// Import theme for chat placeholder
import { BANNER } from "./cli/theme.js";
import chalk from "chalk";

// Load environment variables
dotenvConfig();

// ============================================================================
// Program Setup
// ============================================================================

const program = new Command();

program
  .name("donut")
  .description("Unified trading terminal with Claude Agent SDK")
  .version("0.1.0");

// ============================================================================
// Register All Command Groups
// ============================================================================

// Core workflow commands
registerSessionCommands(program);
registerStrategyCommands(program);
registerBacktestCommands(program);

// Trading simulation
registerPaperTradingCommands(program);

// Configuration & utilities
registerNotificationCommands(program);
registerDemoCommands(program);

// ============================================================================
// Interactive Mode
// ============================================================================

program
  .command("chat")
  .description("Start interactive chat mode")
  .action(async () => {
    try {
      await startInteractiveMode();
    } catch (error) {
      // Fallback if TUI fails to load
      console.log(BANNER);
      console.log(chalk.yellow("Interactive mode failed to start."));
      console.log(chalk.gray("\nUse individual commands instead:"));
      console.log(
        `  ${chalk.cyan("donut strategy build")} "Build a momentum strategy for BTC"`
      );
      console.log(
        `  ${chalk.cyan("donut backtest run")} --symbols BTCUSDT,ETHUSDT`
      );
      process.exit(1);
    }
  });

// ============================================================================
// Parse and Execute
// ============================================================================

program.parse();
