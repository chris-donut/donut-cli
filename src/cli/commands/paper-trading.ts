/**
 * Paper Trading Commands Module
 *
 * Handles paper trading simulation: start, status, trades, stop, list, compare
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";

import { loadConfig } from "../../core/config.js";
import { createLogger } from "../../core/logger.js";

// Structured logger for paper trading operations
const logger = createLogger("paper-trading");
import {
  createPaperSession,
  listPaperSessions,
  stopPaperSession,
  calculatePaperMetrics,
} from "../../modes/paper-trading.js";
import { HummingbotClient } from "../../integrations/hummingbot-client.js";

/**
 * Register paper trading commands on the Commander program
 */
export function registerPaperTradingCommands(program: Command): void {
  const paper = program.command("paper").description("Paper trading simulation");

  // Start command
  paper
    .command("start")
    .description("Start a new paper trading session")
    .requiredOption("-s, --strategy <name>", "Strategy name or ID")
    .option("-b, --balance <amount>", "Initial balance in USD", "10000")
    .option("-l, --live", "Enable live price updates from Hummingbot")
    .action(async (options) => {
      const spinner = ora("Creating paper trading session...").start();

      try {
        const initialBalance = parseFloat(options.balance);
        if (isNaN(initialBalance) || initialBalance <= 0) {
          throw new Error("Invalid balance amount");
        }

        const liveMode = options.live === true;

        // If live mode is enabled, verify Hummingbot is configured
        if (liveMode) {
          const config = loadConfig();
          if (!config.hummingbotUrl) {
            spinner.fail(chalk.red("Live mode requires Hummingbot Dashboard"));
            console.log(chalk.gray("\nSet HUMMINGBOT_URL in your .env file to enable live prices."));
            console.log(chalk.gray("Example: HUMMINGBOT_URL=http://localhost:8000"));
            process.exit(1);
          }

          // Test connection to Hummingbot
          spinner.text = "Verifying Hummingbot connection...";
          const client = new HummingbotClient({ baseUrl: config.hummingbotUrl });
          const healthy = await client.healthCheck();
          if (!healthy) {
            spinner.fail(chalk.red("Cannot connect to Hummingbot Dashboard"));
            console.log(chalk.gray(`\nMake sure Hummingbot Dashboard is running at ${config.hummingbotUrl}`));
            process.exit(1);
          }
          spinner.text = "Creating paper trading session...";
        }

        const session = await createPaperSession(options.strategy, initialBalance, liveMode);

        logger.info("Paper trading session created", {
          sessionId: session.id,
          strategy: options.strategy,
          balance: initialBalance,
          liveMode,
        });

        spinner.succeed(`Paper trading session created`);
        console.log(chalk.gray("─".repeat(50)));
        console.log(`Session ID:   ${chalk.cyan(session.id)}`);
        console.log(`Strategy:     ${chalk.yellow(session.strategyId)}`);
        console.log(`Balance:      ${chalk.green("$" + session.balance.toLocaleString())}`);
        console.log(`Status:       ${chalk.green(session.status)}`);
        console.log(`Price Mode:   ${liveMode ? chalk.cyan("LIVE (from Hummingbot)") : chalk.gray("Manual")}`);
        console.log(chalk.gray("─".repeat(50)));
        console.log(chalk.gray("\nUse these commands to manage your session:"));
        console.log(`  ${chalk.cyan("donut paper status")} ${session.id.slice(0, 8)}...`);
        console.log(`  ${chalk.cyan("donut paper trades")} ${session.id.slice(0, 8)}...`);
        console.log(`  ${chalk.cyan("donut paper stop")} ${session.id.slice(0, 8)}...`);
      } catch (error) {
        spinner.fail(chalk.red(`Failed: ${error instanceof Error ? error.message : error}`));
        process.exit(1);
      }
    });

  // Status command
  paper
    .command("status [sessionId]")
    .description("Show paper trading session status")
    .action(async (sessionId) => {
      const spinner = ora("Loading session...").start();

      try {
        let session;

        if (sessionId) {
          // Try to find session by ID or partial ID
          const sessions = await listPaperSessions();
          session = sessions.find((s) => s.id === sessionId || s.id.startsWith(sessionId));
          if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
          }
        } else {
          // Get most recent session
          const sessions = await listPaperSessions();
          if (sessions.length === 0) {
            spinner.fail("No paper trading sessions found");
            console.log(chalk.gray("\nStart one with: donut paper start --strategy <name>"));
            return;
          }
          session = sessions[0];
        }

        spinner.succeed("Session loaded");

        // Calculate metrics
        const totalPnl = session.trades
          .filter((t) => t.pnl !== undefined)
          .reduce((sum, t) => sum + (t.pnl || 0), 0);
        const returnPct = ((session.balance - session.initialBalance) / session.initialBalance) * 100;

        console.log(chalk.bold("\nPaper Trading Session"));
        console.log(chalk.gray("─".repeat(50)));
        console.log(`Session ID:     ${chalk.cyan(session.id)}`);
        console.log(`Strategy:       ${chalk.yellow(session.strategyId)}`);
        console.log(`Status:         ${session.status === "running" ? chalk.green(session.status) : chalk.yellow(session.status)}`);
        console.log(`Price Mode:     ${session.liveMode ? chalk.cyan("LIVE") : chalk.gray("Manual")}`);
        console.log(`Initial:        ${chalk.gray("$" + session.initialBalance.toLocaleString())}`);
        console.log(`Current:        ${chalk.bold("$" + session.balance.toLocaleString())}`);
        console.log(`Return:         ${returnPct >= 0 ? chalk.green(returnPct.toFixed(2) + "%") : chalk.red(returnPct.toFixed(2) + "%")}`);
        console.log(`Realized PnL:   ${totalPnl >= 0 ? chalk.green("$" + totalPnl.toFixed(2)) : chalk.red("$" + totalPnl.toFixed(2))}`);
        console.log(`Trades:         ${chalk.white(session.trades.length.toString())}`);
        console.log(`Open Positions: ${chalk.white(session.positions.length.toString())}`);

        if (session.positions.length > 0) {
          console.log(chalk.bold("\nOpen Positions"));
          console.log(chalk.gray("─".repeat(50)));
          for (const pos of session.positions) {
            const pnlColor = pos.unrealizedPnl >= 0 ? chalk.green : chalk.red;
            console.log(
              `  ${pos.side === "long" ? chalk.green("LONG") : chalk.red("SHORT")} ` +
              `${chalk.white(pos.symbol)} ` +
              `${chalk.gray("size:")} ${pos.size.toFixed(4)} ` +
              `${chalk.gray("entry:")} $${pos.entryPrice.toFixed(2)} ` +
              `${chalk.gray("uPnL:")} ${pnlColor("$" + pos.unrealizedPnl.toFixed(2))}`
            );
          }
        }
      } catch (error) {
        spinner.fail(chalk.red(`Failed: ${error instanceof Error ? error.message : error}`));
        process.exit(1);
      }
    });

  // Trades command
  paper
    .command("trades [sessionId]")
    .description("List trades for a paper trading session")
    .option("-l, --limit <number>", "Number of trades to show", "20")
    .action(async (sessionId, options) => {
      const spinner = ora("Loading trades...").start();

      try {
        let session;

        if (sessionId) {
          const sessions = await listPaperSessions();
          session = sessions.find((s) => s.id === sessionId || s.id.startsWith(sessionId));
          if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
          }
        } else {
          const sessions = await listPaperSessions();
          if (sessions.length === 0) {
            spinner.fail("No paper trading sessions found");
            return;
          }
          session = sessions[0];
        }

        spinner.succeed(`Found ${session.trades.length} trades`);

        if (session.trades.length === 0) {
          console.log(chalk.yellow("\nNo trades yet in this session"));
          return;
        }

        console.log(chalk.bold("\nTrade History"));
        console.log(chalk.gray("─".repeat(70)));

        const limit = parseInt(options.limit, 10);
        const trades = session.trades.slice(-limit);

        for (const trade of trades) {
          const date = new Date(trade.timestamp).toLocaleString();
          const sideStr = trade.side === "long" ? chalk.green("LONG ") : chalk.red("SHORT");
          const pnlStr = trade.pnl !== undefined
            ? (trade.pnl >= 0 ? chalk.green(`+$${trade.pnl.toFixed(2)}`) : chalk.red(`-$${Math.abs(trade.pnl).toFixed(2)}`))
            : chalk.gray("open");
          const sourceStr = trade.priceSource === "live" ? chalk.cyan("[L]") : chalk.gray("[M]");

          console.log(
            `${chalk.gray(date)} ${sideStr} ${chalk.white(trade.symbol.padEnd(10))} ` +
            `${chalk.gray("qty:")} ${trade.size.toFixed(4).padStart(10)} ` +
            `${chalk.gray("@")} $${trade.entryPrice.toFixed(2).padStart(10)} ${sourceStr} ` +
            `${chalk.gray("PnL:")} ${pnlStr}`
          );
        }
      } catch (error) {
        spinner.fail(chalk.red(`Failed: ${error instanceof Error ? error.message : error}`));
        process.exit(1);
      }
    });

  // Stop command
  paper
    .command("stop <sessionId>")
    .description("Stop a paper trading session")
    .action(async (sessionId) => {
      const spinner = ora("Stopping session...").start();

      try {
        // Find by full or partial ID
        const sessions = await listPaperSessions();
        const session = sessions.find((s) => s.id === sessionId || s.id.startsWith(sessionId));

        if (!session) {
          throw new Error(`Session not found: ${sessionId}`);
        }

        const stopped = await stopPaperSession(session.id);

        if (stopped) {
          const returnPct = ((stopped.balance - stopped.initialBalance) / stopped.initialBalance) * 100;

          logger.info("Paper trading session stopped", {
            sessionId: session.id,
            finalBalance: stopped.balance,
            initialBalance: stopped.initialBalance,
            returnPct,
            tradeCount: stopped.trades.length,
          });

          spinner.succeed("Paper trading session stopped");
          console.log(chalk.gray("─".repeat(50)));
          console.log(`Final Balance:  ${chalk.bold("$" + stopped.balance.toLocaleString())}`);
          console.log(`Total Return:   ${returnPct >= 0 ? chalk.green(returnPct.toFixed(2) + "%") : chalk.red(returnPct.toFixed(2) + "%")}`);
          console.log(`Total Trades:   ${stopped.trades.length}`);
        } else {
          spinner.fail("Failed to stop session");
        }
      } catch (error) {
        spinner.fail(chalk.red(`Failed: ${error instanceof Error ? error.message : error}`));
        process.exit(1);
      }
    });

  // List command
  paper
    .command("list")
    .description("List all paper trading sessions")
    .action(async () => {
      const spinner = ora("Loading sessions...").start();

      try {
        const sessions = await listPaperSessions();

        if (sessions.length === 0) {
          spinner.succeed("No paper trading sessions found");
          console.log(chalk.gray("\nStart one with: donut paper start --strategy <name>"));
          return;
        }

        spinner.succeed(`Found ${sessions.length} paper trading sessions`);
        console.log(chalk.gray("─".repeat(80)));

        for (const session of sessions) {
          const returnPct = ((session.balance - session.initialBalance) / session.initialBalance) * 100;
          const date = new Date(session.startedAt).toLocaleDateString();
          const statusColor = session.status === "running" ? chalk.green : chalk.yellow;

          console.log(
            `${chalk.cyan(session.id.slice(0, 8))}... ` +
            `${statusColor(session.status.padEnd(8))} ` +
            `${chalk.gray(date)} ` +
            `${chalk.yellow(session.strategyId.slice(0, 15).padEnd(15))} ` +
            `${chalk.gray("$")}${session.balance.toFixed(0).padStart(8)} ` +
            `${returnPct >= 0 ? chalk.green(("+" + returnPct.toFixed(1) + "%").padStart(8)) : chalk.red((returnPct.toFixed(1) + "%").padStart(8))}`
          );
        }
      } catch (error) {
        spinner.fail(chalk.red(`Failed: ${error instanceof Error ? error.message : error}`));
        process.exit(1);
      }
    });

  // Compare command
  paper
    .command("compare <sessionId> <backtestRunId>")
    .description("Compare paper trading results with backtest predictions")
    .action(async (sessionId: string, backtestRunId: string) => {
      const spinner = ora("Loading comparison data...").start();

      try {
        const config = loadConfig();

        // Require Hummingbot for backtest metrics
        if (!config.hummingbotUrl) {
          spinner.fail(chalk.red("Comparison requires Hummingbot Dashboard"));
          console.log(chalk.gray("\nSet HUMMINGBOT_URL in your .env file."));
          process.exit(1);
        }

        // Find paper session
        const sessions = await listPaperSessions();
        const session = sessions.find((s) => s.id === sessionId || s.id.startsWith(sessionId));
        if (!session) {
          spinner.fail(chalk.red(`Paper session not found: ${sessionId}`));
          process.exit(1);
        }

        // Fetch backtest metrics
        spinner.text = "Fetching backtest metrics...";
        const hbClient = new HummingbotClient({ baseUrl: config.hummingbotUrl });
        const backtestMetrics = await hbClient.getBacktestMetrics(backtestRunId);

        // Calculate paper metrics
        const paperMetrics = calculatePaperMetrics(session);

        spinner.succeed("Comparison data loaded");

        // Helper function to calculate delta and format
        const formatDelta = (paper: number, backtest: number, _suffix: string = "", inverse: boolean = false): string => {
          if (backtest === 0) return chalk.gray("N/A");
          const delta = ((paper - backtest) / Math.abs(backtest)) * 100;
          const isSignificant = Math.abs(delta) > 20;
          const sign = delta >= 0 ? "+" : "";
          const formatted = `${sign}${delta.toFixed(1)}%`;
          // For metrics where lower is better (like drawdown), inverse the color logic
          if (inverse) {
            return isSignificant ? (delta > 0 ? chalk.red(formatted) : chalk.green(formatted)) : chalk.yellow(formatted);
          }
          return isSignificant ? (delta < 0 ? chalk.red(formatted) : chalk.green(formatted)) : chalk.yellow(formatted);
        };

        const formatValue = (value: number, suffix: string = "", decimals: number = 2): string => {
          return value.toFixed(decimals) + suffix;
        };

        // Display comparison table
        console.log(chalk.bold("\nPaper vs Backtest Comparison"));
        console.log(chalk.gray("─".repeat(70)));
        console.log(chalk.gray(`Paper Session: ${session.id.slice(0, 8)}...`));
        console.log(chalk.gray(`Backtest Run:  ${backtestRunId}`));
        console.log(chalk.gray("─".repeat(70)));

        // Table header
        console.log(
          chalk.bold("Metric".padEnd(20)) +
          chalk.cyan("Paper".padStart(15)) +
          chalk.magenta("Backtest".padStart(15)) +
          chalk.yellow("Delta".padStart(15))
        );
        console.log(chalk.gray("─".repeat(70)));

        // Total Return
        console.log(
          "Total Return".padEnd(20) +
          chalk.cyan(formatValue(paperMetrics.totalReturnPct, "%").padStart(15)) +
          chalk.magenta(formatValue(backtestMetrics.totalReturnPct, "%").padStart(15)) +
          formatDelta(paperMetrics.totalReturnPct, backtestMetrics.totalReturnPct).padStart(15)
        );

        // Win Rate
        console.log(
          "Win Rate".padEnd(20) +
          chalk.cyan(formatValue(paperMetrics.winRate * 100, "%", 1).padStart(15)) +
          chalk.magenta(formatValue(backtestMetrics.winRate * 100, "%", 1).padStart(15)) +
          formatDelta(paperMetrics.winRate * 100, backtestMetrics.winRate * 100).padStart(15)
        );

        // Max Drawdown (inverse - lower is better)
        console.log(
          "Max Drawdown".padEnd(20) +
          chalk.cyan(formatValue(-paperMetrics.maxDrawdownPct, "%").padStart(15)) +
          chalk.magenta(formatValue(-backtestMetrics.maxDrawdownPct, "%").padStart(15)) +
          formatDelta(paperMetrics.maxDrawdownPct, backtestMetrics.maxDrawdownPct, "%", true).padStart(15)
        );

        // Sharpe Ratio
        console.log(
          "Sharpe Ratio".padEnd(20) +
          chalk.cyan(formatValue(paperMetrics.sharpeRatio, "").padStart(15)) +
          chalk.magenta(formatValue(backtestMetrics.sharpeRatio, "").padStart(15)) +
          formatDelta(paperMetrics.sharpeRatio, backtestMetrics.sharpeRatio).padStart(15)
        );

        // Profit Factor
        console.log(
          "Profit Factor".padEnd(20) +
          chalk.cyan(formatValue(paperMetrics.profitFactor, "").padStart(15)) +
          chalk.magenta(formatValue(backtestMetrics.profitFactor, "").padStart(15)) +
          formatDelta(paperMetrics.profitFactor, backtestMetrics.profitFactor).padStart(15)
        );

        // Trade Count
        console.log(
          "Trades".padEnd(20) +
          chalk.cyan(paperMetrics.trades.toString().padStart(15)) +
          chalk.magenta(backtestMetrics.trades.toString().padStart(15)) +
          formatDelta(paperMetrics.trades, backtestMetrics.trades).padStart(15)
        );

        // Average Win
        console.log(
          "Avg Win".padEnd(20) +
          chalk.cyan(formatValue(paperMetrics.avgWin, "%").padStart(15)) +
          chalk.magenta(formatValue(backtestMetrics.avgWin, "%").padStart(15)) +
          formatDelta(paperMetrics.avgWin, backtestMetrics.avgWin).padStart(15)
        );

        // Average Loss
        console.log(
          "Avg Loss".padEnd(20) +
          chalk.cyan(formatValue(-paperMetrics.avgLoss, "%").padStart(15)) +
          chalk.magenta(formatValue(-backtestMetrics.avgLoss, "%").padStart(15)) +
          formatDelta(paperMetrics.avgLoss, backtestMetrics.avgLoss, "%", true).padStart(15)
        );

        console.log(chalk.gray("─".repeat(70)));
        console.log(chalk.gray("\nLegend: Delta > 20% highlighted (") +
          chalk.green("green") + chalk.gray(" = paper outperformed, ") +
          chalk.red("red") + chalk.gray(" = paper underperformed)"));

      } catch (error) {
        spinner.fail(chalk.red(`Failed: ${error instanceof Error ? error.message : error}`));
        process.exit(1);
      }
    });
}
