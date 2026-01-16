/**
 * Session Commands - Start, resume, and status management
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { loadConfig, validateApiKeys } from "../../core/config.js";
import { SessionManager } from "../../core/session.js";
import { logError } from "../../core/errors.js";
import { BANNER, DEMO_BANNER, DEMO_INDICATOR } from "../theme.js";

/**
 * Register session commands on the program
 */
export function registerSessionCommands(program: Command): void {
  program
    .command("start")
    .description("Start a new trading session")
    .option("-g, --goal <goal>", "Your trading goal or strategy idea")
    .option("-d, --demo", "Run in demo mode (no backend required)")
    .action(async (options) => {
      // Demo mode uses simulated data
      if (options.demo) {
        console.log(DEMO_BANNER);
        console.log(
          chalk.yellow(
            `${DEMO_INDICATOR} Starting in demo mode - all data is simulated\n`
          )
        );
        console.log(chalk.gray("Demo mode commands:"));
        console.log(`  ${chalk.cyan("donut demo")} - Run interactive demo tour`);
        console.log(
          `  ${chalk.cyan("donut demo strategies")} - View demo strategies`
        );
        console.log(
          `  ${chalk.cyan("donut demo backtest")} - See demo backtest results`
        );
        console.log(`  ${chalk.cyan("donut demo trades")} - View sample trades`);
        return;
      }

      console.log(BANNER);

      let config;
      try {
        config = loadConfig();
        validateApiKeys(config);
      } catch (error) {
        logError(error);
        console.log(
          chalk.gray(
            "\nTip: Set ANTHROPIC_API_KEY in your environment or .env file"
          )
        );
        console.log(
          chalk.gray(
            "     Run in demo mode with: donut start --demo"
          )
        );
        process.exit(1);
      }

      const sessionManager = new SessionManager(config.sessionDir);

      // Create new session
      const spinner = ora("Creating new session...").start();

      try {
        const sessionId = await sessionManager.createSession();
        const state = sessionManager.getState();
        spinner.succeed(`Session created: ${chalk.cyan(sessionId)}`);

        console.log();
        console.log(
          chalk.gray("Current stage:"),
          chalk.yellow(state?.currentStage || "DISCOVERY")
        );

        if (options.goal) {
          console.log(chalk.gray("Goal:"), options.goal);
          // Could trigger Strategy Builder here with the goal
        }

        console.log();
        console.log(chalk.gray("Next steps:"));
        console.log(
          `  ${chalk.cyan("donut strategy build")} - Build a trading strategy`
        );
        console.log(`  ${chalk.cyan("donut chat")} - Start interactive mode`);
      } catch (error) {
        spinner.fail("Failed to create session");
        logError(error);
        process.exit(1);
      }
    });

  program
    .command("resume <sessionId>")
    .description("Resume a previous session")
    .action(async (sessionId: string) => {
      console.log(BANNER);

      let config;
      try {
        config = loadConfig();
        validateApiKeys(config);
      } catch (error) {
        logError(error);
        process.exit(1);
      }

      const sessionManager = new SessionManager(config.sessionDir);

      const spinner = ora(`Loading session ${sessionId}...`).start();

      try {
        await sessionManager.loadSession(sessionId);
        const state = sessionManager.getState();
        spinner.succeed(`Session resumed: ${chalk.cyan(sessionId)}`);

        console.log();
        console.log(
          chalk.gray("Current stage:"),
          chalk.yellow(state?.currentStage || "Unknown")
        );

        if (state?.activeStrategy) {
          console.log(
            chalk.gray("Active strategy:"),
            chalk.green(state.activeStrategy.name)
          );
        }
      } catch (error) {
        spinner.fail(`Failed to resume session: ${sessionId}`);
        logError(error);
        process.exit(1);
      }
    });

  program
    .command("status")
    .description("Show current session status")
    .option("-v, --verbose", "Show detailed status")
    .action(async (options) => {
      let config;
      try {
        config = loadConfig();
      } catch (error) {
        logError(error);
        process.exit(1);
      }

      const sessionManager = new SessionManager(config.sessionDir);

      // List all sessions
      const sessions = await sessionManager.listSessions();

      if (sessions.length === 0) {
        console.log(chalk.yellow("No sessions found."));
        console.log(chalk.gray("Start a new session with: donut start"));
        return;
      }

      console.log(chalk.bold("\nSessions:\n"));

      for (const sessionId of sessions.slice(-5)) {
        try {
          await sessionManager.loadSession(sessionId);
          const state = sessionManager.getState();

          if (!state) {
            throw new Error("Failed to load session state");
          }

          const isRecent =
            Date.now() - state.updatedAt.getTime() < 24 * 60 * 60 * 1000;

          console.log(
            `  ${isRecent ? chalk.green("●") : chalk.gray("○")} ${chalk.cyan(
              sessionId.slice(0, 8)
            )}... - ${chalk.yellow(state.currentStage)}`
          );

          if (options.verbose) {
            console.log(
              chalk.gray(`    Created: ${state.createdAt.toISOString()}`)
            );
            console.log(
              chalk.gray(`    Updated: ${state.updatedAt.toISOString()}`)
            );
            if (state.activeStrategy) {
              console.log(
                chalk.gray(`    Strategy: ${state.activeStrategy.name}`)
              );
            }
          }
        } catch {
          console.log(
            `  ${chalk.red("✗")} ${chalk.gray(sessionId.slice(0, 8))}... - ${chalk.red("corrupted")}`
          );
        }
      }

      if (sessions.length > 5) {
        console.log(chalk.gray(`\n  ... and ${sessions.length - 5} more`));
      }
    });
}
