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
  .description("Start interactive chat mode")
  .action(async () => {
    console.log(BANNER);
    console.log(chalk.gray("Interactive mode coming soon..."));
    console.log(chalk.gray("For now, use individual commands like:"));
    console.log(`  ${chalk.cyan("donut strategy build")} "Build a momentum strategy for BTC"`);
    console.log(`  ${chalk.cyan("donut backtest run")} --symbols BTCUSDT,ETHUSDT`);
  });

// ============================================================================
// Parse and Execute
// ============================================================================

program.parse();
