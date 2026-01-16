/**
 * Backtest Commands - Running and analyzing backtests
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { loadConfig, validateApiKeys } from "../../core/config.js";
import { SessionManager } from "../../core/session.js";
import { createBacktestAnalyst } from "../../agents/backtest-analyst.js";
import { logError } from "../../core/errors.js";
import { BANNER } from "../theme.js";

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

      const spinner = ora("Initializing backtest analyst...").start();

      try {
        const config = loadConfig();

        // Check if backend is configured
        if (!config.hummingbotUrl && !config.nofxApiUrl) {
          spinner.fail(chalk.red("No backend configured for backtesting"));
          console.log(chalk.gray("\nConfigure one of:"));
          console.log(chalk.gray("  HUMMINGBOT_URL=http://localhost:8000"));
          console.log(chalk.gray("  NOFX_API_URL=http://localhost:8080"));
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
