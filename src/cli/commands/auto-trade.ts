/**
 * Auto Trade Commands - Automated trading management
 *
 * Commands for starting, stopping, and monitoring automated trading:
 * - Start automated trading with a strategy
 * - Monitor execution status
 * - Emergency stop
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { Pool } from "pg";
import { loadConfig, validateApiKeys } from "../../core/config.js";
import { SessionManager } from "../../core/session.js";
import {
  createExecutionAgent,
  ExecutionAgent,
  TradingMode,
} from "../../agents/execution-agent.js";
import {
  StrategyStorage,
  initializeStrategyStorage,
} from "../../storage/strategy-storage.js";
import { logError } from "../../core/errors.js";
import { BANNER } from "../theme.js";

// Global execution agent instance
let executionAgent: ExecutionAgent | null = null;

/**
 * Get strategy storage
 */
async function getStrategyStorage(): Promise<StrategyStorage | null> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return null;
  }

  try {
    const pool = new Pool({ connectionString: databaseUrl });
    const storage = initializeStrategyStorage(pool);
    await storage.ensureTables();
    return storage;
  } catch (error) {
    console.error(chalk.yellow("Database connection failed:"), error);
    return null;
  }
}

/**
 * Register auto-trade commands on the program
 */
export function registerAutoTradeCommands(program: Command): void {
  const autoCmd = program
    .command("auto")
    .description("Automated trading commands");

  autoCmd
    .command("start")
    .description("Start automated trading with a strategy")
    .requiredOption("-s, --strategy <name>", "Strategy name to use")
    .option("-m, --mode <mode>", "Trading mode: paper or live", "paper")
    .option("-i, --interval <seconds>", "Evaluation interval in seconds", "60")
    .action(async (options) => {
      console.log(BANNER);

      const spinner = ora("Initializing execution agent...").start();

      try {
        const config = loadConfig();
        validateApiKeys(config);

        // Validate mode
        const mode = options.mode as TradingMode;
        if (mode !== "paper" && mode !== "live") {
          spinner.fail("Invalid mode. Use 'paper' or 'live'");
          return;
        }

        // Load strategy
        const storage = await getStrategyStorage();
        if (!storage) {
          spinner.fail("Strategy storage requires DATABASE_URL");
          return;
        }

        const strategy = await storage.load(options.strategy);
        if (!strategy) {
          spinner.fail(`Strategy "${options.strategy}" not found`);
          return;
        }

        // Create session manager
        const sessionManager = new SessionManager(config.sessionDir);
        await sessionManager.createSession();

        // Create execution agent
        executionAgent = createExecutionAgent({
          terminalConfig: config,
          sessionManager,
        });

        spinner.text = "Starting automated trading...";

        const intervalMs = parseInt(options.interval) * 1000;
        const result = await executionAgent.startAutomated(
          strategy.config,
          mode,
          intervalMs
        );

        if (result.success) {
          spinner.succeed("Automated trading started");
          console.log();
          console.log(chalk.cyan(`  Strategy: ${strategy.name}`));
          console.log(chalk.cyan(`  Mode: ${mode.toUpperCase()}`));
          console.log(chalk.cyan(`  Interval: ${options.interval}s`));
          console.log();

          if (mode === "live") {
            console.log(chalk.yellow("  ⚠️  LIVE MODE - Real money at risk"));
          } else {
            console.log(chalk.gray("  📊 Paper mode - No real trades"));
          }

          console.log();
          console.log(chalk.gray("Use 'donut auto status' to check progress"));
          console.log(chalk.gray("Use 'donut auto stop' to stop trading"));
        } else {
          spinner.fail(`Failed to start: ${result.error}`);
        }
      } catch (error) {
        spinner.fail("Failed to start automated trading");
        logError(error);
        process.exit(1);
      }
    });

  autoCmd
    .command("stop")
    .description("Stop automated trading")
    .option("--emergency", "Emergency stop - close all positions immediately")
    .action(async (options) => {
      if (!executionAgent) {
        console.log(chalk.yellow("\nNo automated trading running"));
        return;
      }

      const spinner = ora("Stopping automated trading...").start();

      try {
        if (options.emergency) {
          await executionAgent.emergencyStop();
          spinner.succeed("Emergency stop complete - all positions closed");
        } else {
          await executionAgent.stopAutomated();
          spinner.succeed("Automated trading stopped");
        }

        const status = executionAgent.getStatus();
        console.log();
        console.log(chalk.gray(`  Cycles completed: ${status.cycleCount}`));
        console.log(chalk.gray(`  Trades executed: ${status.tradesExecuted}`));
        console.log(
          chalk.gray(
            `  Total PnL: ${status.totalPnl >= 0 ? chalk.green : chalk.red}($${status.totalPnl.toFixed(2)})`
          )
        );

        executionAgent = null;
      } catch (error) {
        spinner.fail("Failed to stop");
        logError(error);
      }
    });

  autoCmd
    .command("status")
    .description("Show automated trading status")
    .action(async () => {
      if (!executionAgent) {
        console.log(chalk.yellow("\nNo automated trading running"));
        console.log(chalk.gray("Use 'donut auto start' to begin"));
        return;
      }

      const status = executionAgent.getStatus();

      console.log(chalk.bold("\n🤖 Execution Agent Status:\n"));

      // Running status
      if (status.running) {
        console.log(chalk.green("  Status: RUNNING"));
      } else {
        console.log(chalk.red("  Status: STOPPED"));
      }

      // Mode
      console.log(
        status.mode === "live"
          ? chalk.yellow(`  Mode: LIVE`)
          : chalk.gray(`  Mode: PAPER`)
      );

      // Strategy
      console.log(chalk.white(`  Strategy: ${status.strategyName}`));

      // Timing
      if (status.startedAt) {
        console.log(
          chalk.gray(`  Started: ${status.startedAt.toLocaleString()}`)
        );
      }
      if (status.lastCycleAt) {
        console.log(
          chalk.gray(`  Last cycle: ${status.lastCycleAt.toLocaleString()}`)
        );
      }

      // Metrics
      console.log(chalk.white("\n  Metrics:"));
      console.log(chalk.gray(`    Cycles: ${status.cycleCount}`));
      console.log(chalk.gray(`    Trades: ${status.tradesExecuted}`));
      console.log(
        chalk.gray(
          `    PnL: ${status.totalPnl >= 0 ? "+" : ""}$${status.totalPnl.toFixed(2)}`
        )
      );

      // Error
      if (status.lastError) {
        console.log(chalk.red(`\n  Last Error: ${status.lastError}`));
      }
    });

  autoCmd
    .command("evaluate")
    .description("Run a single evaluation for a symbol")
    .argument("<symbol>", "Symbol to evaluate (e.g., BTCUSDT)")
    .option("-c, --context <text>", "Additional context for evaluation")
    .action(async (symbol, options) => {
      if (!executionAgent) {
        console.log(
          chalk.yellow("\nStart automated trading first with 'donut auto start'")
        );
        return;
      }

      const spinner = ora(`Evaluating ${symbol}...`).start();

      try {
        const result = await executionAgent.evaluateAndExecute(
          symbol,
          options.context
        );

        if (result.success) {
          spinner.succeed("Evaluation complete");
          console.log(chalk.gray("\n" + result.result));
        } else {
          spinner.fail(`Evaluation failed: ${result.error}`);
        }
      } catch (error) {
        spinner.fail("Evaluation error");
        logError(error);
      }
    });

  autoCmd
    .command("history")
    .description("Show recent automated trading activity")
    .action(async () => {
      console.log(
        chalk.gray("\nHistory viewing requires decision_log from database.")
      );
      console.log(
        chalk.gray("Use 'donut backtest list' to see recent backtest runs.")
      );
      // TODO: Query decision_log from postgres
    });
}
