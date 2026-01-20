/**
 * Session Commands - Start, resume, and status management
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { createInterface } from "readline";
import { loadConfig, validateApiKeys } from "../../core/config.js";
import { SessionManager } from "../../core/session.js";
import { logError } from "../../core/errors.js";
import { BANNER, DEMO_BANNER, DEMO_INDICATOR } from "../theme.js";
import { startInteractiveMode } from "../../tui/index.js";
import { runSetupWizard } from "./setup.js";

/**
 * Prompt user with a yes/no question
 */
async function promptYesNo(question: string, defaultYes = true): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    const hint = defaultYes ? "(Y/n)" : "(y/N)";
    rl.question(`${question} ${chalk.gray(hint)} `, (answer) => {
      rl.close();
      const response = answer.trim().toLowerCase();
      if (response === "") {
        resolve(defaultYes);
      } else {
        resolve(response === "y" || response === "yes");
      }
    });
  });
}

/**
 * Prompt user to press Enter to continue
 */
async function promptContinue(message: string): Promise<void> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} `, () => {
      rl.close();
      resolve();
    });
  });
}

/**
 * Find the most recent session updated within the given time window
 */
async function findRecentSession(
  sessionManager: SessionManager,
  maxAgeMs: number
): Promise<{ sessionId: string; stage: string; ageMinutes: number } | null> {
  const sessions = await sessionManager.listSessions();
  if (sessions.length === 0) return null;

  // Check most recent session
  const lastSessionId = sessions[sessions.length - 1];
  try {
    await sessionManager.loadSession(lastSessionId);
    const state = sessionManager.getState();
    if (!state) return null;

    const ageMs = Date.now() - state.updatedAt.getTime();
    if (ageMs < maxAgeMs) {
      return {
        sessionId: lastSessionId,
        stage: state.currentStage || "DISCOVERY",
        ageMinutes: Math.round(ageMs / 60000),
      };
    }
  } catch {
    // Session corrupted, skip
  }
  return null;
}

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

      // OALF-004: Graceful API key error with recovery path
      let config;
      try {
        config = loadConfig();
        validateApiKeys(config);
      } catch (error) {
        console.log(chalk.red("\n⚠ ANTHROPIC_API_KEY not configured\n"));
        console.log(chalk.gray("An API key is required to use Claude AI features."));
        console.log();

        const runSetup = await promptYesNo("Run setup wizard now?", true);
        if (runSetup) {
          await runSetupWizard();
          return;
        }

        console.log();
        console.log(chalk.gray("To set up manually:"));
        console.log(chalk.gray("  1. Get your API key from: https://console.anthropic.com"));
        console.log(chalk.gray("  2. Run: export ANTHROPIC_API_KEY=sk-ant-..."));
        console.log(chalk.gray("  Or run: donut setup"));
        process.exit(1);
      }

      const sessionManager = new SessionManager(config.sessionDir);

      // OALF-003: Auto-resume recent session (within 1 hour)
      const ONE_HOUR_MS = 60 * 60 * 1000;
      const recentSession = await findRecentSession(sessionManager, ONE_HOUR_MS);

      if (recentSession) {
        console.log();
        console.log(
          chalk.yellow(`Found recent session from ${recentSession.ageMinutes} minutes ago`)
        );
        console.log(
          chalk.gray(`  Stage: ${recentSession.stage} | ID: ${recentSession.sessionId.slice(0, 12)}...`)
        );
        console.log();

        const shouldResume = await promptYesNo("Resume this session?", true);
        if (shouldResume) {
          await sessionManager.loadSession(recentSession.sessionId);
          console.log(chalk.green(`\n✓ Session resumed: ${recentSession.sessionId.slice(0, 12)}...\n`));

          // Auto-launch interactive mode
          await startInteractiveMode();
          return;
        }
        console.log(chalk.gray("\nCreating new session instead...\n"));
      }

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

        // OALF-002: Skip prompt when goal is provided
        if (options.goal) {
          console.log(chalk.gray("Goal:"), chalk.white(options.goal));
          console.log();
          console.log(chalk.green("Launching strategy builder with your goal...\n"));

          // Launch interactive mode - goal will be used as context
          // The TUI can pick up the goal from session state
          await startInteractiveMode();
          return;
        }

        // OALF-001: Auto-prompt after session creation
        console.log();
        await promptContinue(
          chalk.cyan("Press Enter to build your first strategy") +
            chalk.gray(" (or Ctrl+C to exit)")
        );

        // Launch interactive mode
        console.log();
        await startInteractiveMode();
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
