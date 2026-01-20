/**
 * Backtest Commands - Running and analyzing backtests
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { createInterface } from "readline";
import { loadConfig, validateApiKeys } from "../../core/config.js";
import { SessionManager } from "../../core/session.js";
import { createBacktestAnalyst } from "../../agents/backtest-analyst.js";
import { logError } from "../../core/errors.js";
import { BANNER } from "../theme.js";

// ============================================================================
// Interactive Wizard Helpers
// ============================================================================

interface BacktestWizardResult {
  symbols: string[];
  startTs?: number;
  endTs?: number;
  initialBalance: number;
  confirmed: boolean;
}

/**
 * Prompt for user input
 */
async function wizardPrompt(question: string, defaultValue?: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const defaultText = defaultValue ? chalk.gray(` (${defaultValue})`) : "";

  return new Promise((resolve) => {
    rl.question(`${question}${defaultText}: `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue || "");
    });
  });
}

/**
 * Prompt for yes/no
 */
async function wizardConfirm(question: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? chalk.gray("[Y/n]") : chalk.gray("[y/N]");
  const answer = await wizardPrompt(`${question} ${hint}`, defaultYes ? "y" : "n");
  return answer.toLowerCase().startsWith("y");
}

/**
 * Interactive backtest wizard
 * Guides users through: Symbols → Time Range → Balance
 */
async function runBacktestWizard(): Promise<BacktestWizardResult> {
  console.log(chalk.cyan("\n╔══════════════════════════════════════════════════╗"));
  console.log(chalk.cyan("║          Backtest Configuration Wizard            ║"));
  console.log(chalk.cyan("╚══════════════════════════════════════════════════╝\n"));

  // Step 1: Symbols
  console.log(chalk.bold("Step 1: Trading Pairs\n"));
  console.log(chalk.gray("  Enter symbols separated by commas."));
  console.log(chalk.gray("  Popular choices: BTCUSDT, ETHUSDT, SOLUSDT\n"));

  const symbolsInput = await wizardPrompt("  Symbols", "BTCUSDT,ETHUSDT");
  const symbols = symbolsInput.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);

  // Step 2: Time Range
  console.log(chalk.bold("\nStep 2: Time Range\n"));
  console.log(chalk.gray("  Enter Unix timestamps or leave blank for defaults."));
  console.log(chalk.gray("  Default: Last 30 days\n"));

  const now = Math.floor(Date.now() / 1000);
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60;

  const startInput = await wizardPrompt("  Start timestamp", thirtyDaysAgo.toString());
  const endInput = await wizardPrompt("  End timestamp", now.toString());

  const startTs = parseInt(startInput, 10);
  const endTs = parseInt(endInput, 10);

  // Display human-readable dates
  const startDate = new Date(startTs * 1000).toLocaleDateString();
  const endDate = new Date(endTs * 1000).toLocaleDateString();
  console.log(chalk.gray(`\n  Period: ${startDate} to ${endDate}`));

  // Step 3: Initial Balance
  console.log(chalk.bold("\nStep 3: Initial Balance\n"));
  const balanceInput = await wizardPrompt("  Initial balance (USD)", "10000");
  const initialBalance = parseFloat(balanceInput);

  // Summary
  console.log(chalk.bold("\n" + "─".repeat(50)));
  console.log(chalk.bold("\nBacktest Summary:\n"));
  console.log(`  ${chalk.gray("Symbols:")}        ${chalk.cyan(symbols.join(", "))}`);
  console.log(`  ${chalk.gray("Period:")}         ${startDate} → ${endDate}`);
  console.log(`  ${chalk.gray("Initial Balance:")} ${chalk.green("$" + initialBalance.toLocaleString())}`);
  console.log();

  // Confirm
  const confirmed = await wizardConfirm("Run this backtest?", true);

  return {
    symbols,
    startTs,
    endTs,
    initialBalance,
    confirmed,
  };
}

/**
 * Check if any backtest-specific flags were provided
 */
function hasBacktestFlags(options: Record<string, unknown>): boolean {
  return !!(options.symbols || options.start || options.end);
}

/**
 * Register backtest commands on the program
 */
export function registerBacktestCommands(program: Command): void {
  const backtestCmd = program
    .command("backtest")
    .description("Backtesting commands");

  backtestCmd
    .command("run")
    .description("Run a new backtest")
    .option(
      "-s, --symbols <symbols>",
      "Comma-separated symbols (e.g., BTCUSDT,ETHUSDT)"
    )
    .option("--start <timestamp>", "Start timestamp (Unix seconds)")
    .option("--end <timestamp>", "End timestamp (Unix seconds)")
    .option("-b, --balance <amount>", "Initial balance", "10000")
    .action(async (options) => {
      console.log(BANNER);

      // Check if no flags provided - run interactive wizard
      if (!hasBacktestFlags(options)) {
        const wizardResult = await runBacktestWizard();

        if (!wizardResult.confirmed) {
          console.log(chalk.gray("\nBacktest cancelled."));
          return;
        }

        // Use wizard results
        options.symbols = wizardResult.symbols.join(",");
        options.start = wizardResult.startTs?.toString();
        options.end = wizardResult.endTs?.toString();
        options.balance = wizardResult.initialBalance.toString();
      }

      const spinner = ora("Initializing backtest analyst...").start();

      try {
        const config = loadConfig();

        // Check if backend is configured
        if (!config.hummingbotUrl) {
          spinner.fail(chalk.red("No backend configured for backtesting"));
          console.log(chalk.gray("\nConfigure Hummingbot API:"));
          console.log(chalk.gray("  HUMMINGBOT_URL=http://localhost:8000"));
          console.log(chalk.gray("  HUMMINGBOT_USERNAME=admin"));
          console.log(chalk.gray("  HUMMINGBOT_PASSWORD=admin"));
          process.exit(1);
        }

        validateApiKeys(config);

        const sessionManager = new SessionManager(config.sessionDir);

        // Load most recent session or create new one
        const sessions = await sessionManager.listSessions();
        if (sessions.length > 0) {
          await sessionManager.loadSession(sessions[sessions.length - 1]);
        } else {
          await sessionManager.createSession();
        }

        spinner.succeed("Backtest analyst ready");

        const agent = createBacktestAnalyst({
          terminalConfig: config,
          sessionManager,
        });

        // Parse options
        const backtestConfig: Record<string, unknown> = {};

        if (options.symbols) {
          backtestConfig.symbols = options.symbols
            .split(",")
            .map((s: string) => s.trim().toUpperCase());
        }

        if (options.start) {
          backtestConfig.startTs = parseInt(options.start, 10);
        }

        if (options.end) {
          backtestConfig.endTs = parseInt(options.end, 10);
        }

        backtestConfig.initialBalance = parseFloat(options.balance);

        console.log(chalk.gray("\nStarting backtest...\n"));

        const result = await agent.runBacktest(backtestConfig);

        if (result.success) {
          console.log(chalk.green("\n\n✓ Backtest complete"));
        } else {
          console.log(chalk.red(`\n\n✗ Failed: ${result.error}`));
        }
      } catch (error) {
        spinner.fail("Failed to run backtest");
        logError(error);
        process.exit(1);
      }
    });

  backtestCmd
    .command("status <runId>")
    .description("Check backtest status")
    .action(async (runId) => {
      const spinner = ora("Checking backtest status...").start();

      try {
        const config = loadConfig();
        validateApiKeys(config);

        const sessionManager = new SessionManager(config.sessionDir);
        await sessionManager.createSession();

        spinner.succeed("Connected");

        const agent = createBacktestAnalyst({
          terminalConfig: config,
          sessionManager,
        });

        const result = await agent.checkStatus(runId);

        if (!result.success) {
          console.log(chalk.red(`\nError: ${result.error}`));
        }
      } catch (error) {
        spinner.fail("Failed to check status");
        logError(error);
        process.exit(1);
      }
    });

  backtestCmd
    .command("analyze <runId>")
    .description("Analyze backtest results")
    .action(async (runId) => {
      console.log(BANNER);

      const spinner = ora("Initializing analysis...").start();

      try {
        const config = loadConfig();
        validateApiKeys(config);

        const sessionManager = new SessionManager(config.sessionDir);
        await sessionManager.createSession();

        spinner.succeed("Analyst ready");

        const agent = createBacktestAnalyst({
          terminalConfig: config,
          sessionManager,
        });

        console.log(chalk.gray("\nAnalyzing backtest results...\n"));

        const result = await agent.analyzeResults(runId);

        if (result.success) {
          console.log(chalk.green("\n\n✓ Analysis complete"));
        } else {
          console.log(chalk.red(`\n\n✗ Failed: ${result.error}`));
        }
      } catch (error) {
        spinner.fail("Failed to analyze");
        logError(error);
        process.exit(1);
      }
    });

  backtestCmd
    .command("list")
    .description("List recent backtests")
    .option("-l, --limit <number>", "Number of results", "10")
    .action(async (options) => {
      const spinner = ora("Loading backtests...").start();

      try {
        const config = loadConfig();
        validateApiKeys(config);

        const sessionManager = new SessionManager(config.sessionDir);
        await sessionManager.createSession();

        spinner.succeed("Connected");

        const agent = createBacktestAnalyst({
          terminalConfig: config,
          sessionManager,
        });

        const result = await agent.listRecent(parseInt(options.limit, 10));

        if (!result.success) {
          console.log(chalk.red(`\nError: ${result.error}`));
        }
      } catch (error) {
        spinner.fail("Failed to list backtests");
        logError(error);
        process.exit(1);
      }
    });
}
