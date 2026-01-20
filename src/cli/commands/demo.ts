/**
 * Demo Mode Commands - Interactive demo for learning the CLI
 *
 * Features:
 * - Interactive tutorial system with multiple scenarios
 * - Progress tracking and resume capability
 * - Quick-access subcommands for specific demo features
 */

import { Command } from "commander";
import chalk from "chalk";
import {
  generateDemoStrategies,
  generateDemoBacktestResults,
  generateDemoTrades,
  generateDemoBacktestRuns,
} from "../../modes/demo-mode.js";
import { startInteractiveDemo, SCENARIOS } from "../../demo/index.js";
import { DEMO_BANNER, DEMO_INDICATOR } from "../theme.js";

/**
 * Register demo commands on the program
 */
export function registerDemoCommands(program: Command): void {
  const demo = program
    .command("demo")
    .description("Demo mode for learning the CLI without backends");

  // Main interactive tutorial (default)
  demo
    .command("tour", { isDefault: true })
    .description("Run the interactive tutorial system")
    .option("-s, --scenario <id>", "Jump to specific scenario")
    .option("-r, --reset", "Reset all tutorial progress")
    .option("--list", "List available scenarios")
    .action(async (options) => {
      // List scenarios
      if (options.list) {
        console.log(chalk.bold("\nAvailable Tutorial Scenarios:\n"));
        for (const scenario of SCENARIOS) {
          console.log(
            `  ${chalk.cyan(scenario.id.padEnd(20))} ${scenario.name} (${scenario.duration})`
          );
          console.log(`  ${chalk.gray(scenario.description)}`);
          console.log();
        }
        console.log(chalk.gray("Use --scenario <id> to jump to a specific tutorial\n"));
        return;
      }

      // Start interactive demo
      await startInteractiveDemo({
        scenario: options.scenario,
        reset: options.reset,
      });
    });

  // Quick-access subcommands (unchanged from original)
  demo
    .command("strategies")
    .description("List demo strategies")
    .action(async () => {
      console.log(DEMO_BANNER);
      console.log(chalk.bold(`\n${DEMO_INDICATOR} Available Demo Strategies\n`));

      const strategies = generateDemoStrategies();
      console.log(chalk.gray("─".repeat(70)));

      for (const strategy of strategies) {
        console.log(`\n${chalk.cyan(strategy.name)}`);
        console.log(`${chalk.gray(strategy.description || "")}`);
        console.log(
          `  ${chalk.gray("Coins:")} ${strategy.coinSource.staticCoins?.join(", ") || strategy.coinSource.sourceType}`
        );
        console.log(
          `  ${chalk.gray("Max Positions:")} ${strategy.riskControl.maxPositions}`
        );
        console.log(
          `  ${chalk.gray("BTC/ETH Leverage:")} ${strategy.riskControl.btcEthMaxLeverage}x`
        );
        console.log(
          `  ${chalk.gray("Min Confidence:")} ${strategy.riskControl.minConfidence}%`
        );
      }

      console.log(chalk.gray("\n─".repeat(70)));
      console.log(
        chalk.gray(
          "\nThese are demo strategies. To create your own: donut strategy build"
        )
      );
    });

  demo
    .command("backtest")
    .description("Show demo backtest results")
    .action(async () => {
      console.log(DEMO_BANNER);
      console.log(chalk.bold(`\n${DEMO_INDICATOR} Demo Backtest Results\n`));

      const metrics = generateDemoBacktestResults();
      console.log(chalk.gray("─".repeat(50)));

      console.log(chalk.bold("\nPerformance Metrics"));
      console.log(
        `  Total Return:    ${chalk.green(metrics.totalReturnPct.toFixed(2) + "%")}`
      );
      console.log(
        `  Max Drawdown:    ${chalk.red("-" + metrics.maxDrawdownPct.toFixed(2) + "%")}`
      );
      console.log(`  Sharpe Ratio:    ${chalk.cyan(metrics.sharpeRatio.toFixed(2))}`);
      console.log(
        `  Profit Factor:   ${chalk.green(metrics.profitFactor.toFixed(2))}`
      );

      console.log(chalk.bold("\nTrade Statistics"));
      console.log(`  Total Trades:    ${metrics.trades}`);
      console.log(`  Win Rate:        ${(metrics.winRate * 100).toFixed(0)}%`);
      console.log(`  Avg Win:         ${chalk.green(metrics.avgWin.toFixed(2) + "%")}`);
      console.log(`  Avg Loss:        ${chalk.red(metrics.avgLoss.toFixed(2) + "%")}`);

      console.log(chalk.bold("\nSymbol Performance"));
      console.log(`  Best Symbol:     ${chalk.green(metrics.bestSymbol)}`);
      console.log(`  Worst Symbol:    ${chalk.red(metrics.worstSymbol)}`);
      console.log(
        `  Liquidated:      ${metrics.liquidated ? chalk.red("Yes") : chalk.green("No")}`
      );

      if (metrics.symbolStats) {
        console.log(chalk.bold("\nPer-Symbol Stats"));
        for (const [symbol, stats] of Object.entries(metrics.symbolStats)) {
          const pnlColor = stats.totalPnL >= 0 ? chalk.green : chalk.red;
          console.log(
            `  ${symbol.padEnd(10)} ${stats.trades} trades, ${(stats.winRate * 100).toFixed(0)}% win, ${pnlColor("$" + stats.totalPnL.toFixed(2))}`
          );
        }
      }

      console.log(chalk.gray("\n─".repeat(50)));
      console.log(
        chalk.gray(
          "\nThis is demo data. To run a real backtest: donut backtest run"
        )
      );
    });

  demo
    .command("trades")
    .description("Show demo trade history")
    .option("-l, --limit <number>", "Number of trades to show", "15")
    .action(async (options) => {
      console.log(DEMO_BANNER);
      console.log(chalk.bold(`\n${DEMO_INDICATOR} Demo Trade History\n`));

      const limit = parseInt(options.limit, 10);
      const trades = generateDemoTrades(limit);

      console.log(chalk.gray("─".repeat(90)));

      for (const trade of trades) {
        const date = new Date(trade.timestamp).toLocaleString();
        const sideStr =
          trade.side === "long" ? chalk.green("LONG ") : chalk.red("SHORT");
        const actionStr =
          trade.action === "open" ? chalk.cyan("OPEN ") : chalk.yellow("CLOSE");
        const pnlStr =
          trade.realizedPnL !== undefined
            ? trade.realizedPnL >= 0
              ? chalk.green(`+$${trade.realizedPnL.toFixed(2)}`)
              : chalk.red(`$${trade.realizedPnL.toFixed(2)}`)
            : chalk.gray("--");

        console.log(
          `${chalk.gray(date)} ${actionStr} ${sideStr} ` +
            `${chalk.white(trade.symbol.padEnd(10))} ` +
            `${chalk.gray("qty:")} ${trade.quantity.toFixed(4).padStart(8)} ` +
            `${chalk.gray("@")} $${trade.price.toFixed(2).padStart(10)} ` +
            `${chalk.gray("lev:")} ${trade.leverage}x ` +
            `${chalk.gray("PnL:")} ${pnlStr}`
        );
      }

      console.log(chalk.gray("\n─".repeat(90)));
      console.log(
        chalk.gray(`\nShowing ${trades.length} demo trades. This is simulated data.`)
      );
    });

  demo
    .command("runs")
    .description("List demo backtest runs")
    .action(async () => {
      console.log(DEMO_BANNER);
      console.log(chalk.bold(`\n${DEMO_INDICATOR} Demo Backtest Runs\n`));

      const runs = generateDemoBacktestRuns(5);
      console.log(chalk.gray("─".repeat(90)));

      for (const run of runs) {
        const date = new Date(run.startedAt).toLocaleDateString();
        const returnColor =
          run.metrics.totalReturnPct >= 0 ? chalk.green : chalk.red;
        const returnStr =
          (run.metrics.totalReturnPct >= 0 ? "+" : "") +
          run.metrics.totalReturnPct.toFixed(1) +
          "%";

        console.log(
          `${chalk.cyan(run.runId)} ` +
            `${chalk.gray(date)} ` +
            `${chalk.yellow(run.strategyName.slice(0, 25).padEnd(25))} ` +
            `${returnColor(returnStr.padStart(8))} ` +
            `${chalk.gray("Sharpe:")} ${run.metrics.sharpeRatio.toFixed(2)} ` +
            `${chalk.gray("Trades:")} ${run.metrics.trades}`
        );
      }

      console.log(chalk.gray("\n─".repeat(90)));
      console.log(
        chalk.gray(
          "\nThese are demo runs. To run a real backtest: donut backtest run"
        )
      );
    });
}
