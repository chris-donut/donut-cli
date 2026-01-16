/**
 * Strategy Commands - Strategy building and management
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { loadConfig, validateApiKeys } from "../../core/config.js";
import { SessionManager } from "../../core/session.js";
import { createStrategyBuilder } from "../../agents/strategy-builder.js";
import { logError } from "../../core/errors.js";
import { BANNER } from "../theme.js";

/**
 * Register strategy commands on the program
 */
export function registerStrategyCommands(program: Command): void {
  const strategyCmd = program
    .command("strategy")
    .description("Strategy management commands");

  strategyCmd
    .command("build")
    .description("Build a new trading strategy")
    .argument("[description]", "Strategy description or requirements")
    .action(async (description) => {
      console.log(BANNER);

      const spinner = ora("Initializing strategy builder...").start();

      try {
        const config = loadConfig();
        validateApiKeys(config);

        const sessionManager = new SessionManager(config.sessionDir);

        // Load most recent session or create new one
        const sessions = await sessionManager.listSessions();
        if (sessions.length > 0) {
          await sessionManager.loadSession(sessions[sessions.length - 1]);
        } else {
          await sessionManager.createSession();
        }

        spinner.succeed("Strategy builder ready");

        const agent = createStrategyBuilder({
          terminalConfig: config,
          sessionManager,
        });

        const prompt =
          description ||
          "Help me build a crypto trading strategy. Ask me about my goals and preferences.";

        console.log(chalk.gray("\nClaude is thinking...\n"));

        const result = await agent.buildStrategy(prompt);

        if (result.success) {
          console.log(chalk.green("\n\n✓ Strategy building complete"));
        } else {
          console.log(chalk.red(`\n\n✗ Failed: ${result.error}`));
        }
      } catch (error) {
        spinner.fail("Failed to build strategy");
        logError(error);
        process.exit(1);
      }
    });

  strategyCmd
    .command("list")
    .description("List available strategies")
    .action(async () => {
      try {
        const config = loadConfig();
        if (!config.hummingbotUrl) {
          console.log(
            chalk.yellow("\nStrategy listing requires Hummingbot Dashboard")
          );
          console.log(chalk.gray("Set HUMMINGBOT_URL in your .env file"));
          return;
        }
        console.log(chalk.gray("\nFetching strategies from Hummingbot..."));
        // TODO: Implement once Hummingbot client is ready
      } catch (error) {
        logError(error);
        process.exit(1);
      }
    });
}
