/**
 * CLI Module - Entry Point
 *
 * Composes all command modules into a unified CLI program.
 * Each command group is in its own module for maintainability.
 */

import { Command } from "commander";
import { registerSessionCommands } from "./commands/session.js";

// Re-export theme for use by other modules
export * from "./theme.js";

/**
 * Create and configure the CLI program
 */
export function createProgram(): Command {
  const program = new Command();

  program
    .name("donut")
    .description("Unified trading terminal with Claude Agent SDK")
    .version("0.1.0");

  // Register command modules
  registerSessionCommands(program);

  // TODO: These will be added as we extract them
  // registerStrategyCommands(program);
  // registerBacktestCommands(program);
  // registerPaperTradingCommands(program);
  // registerNotificationCommands(program);
  // registerDemoCommands(program);

  return program;
}

/**
 * Run the CLI
 */
export function runCLI(): void {
  const program = createProgram();
  program.parse();
}
