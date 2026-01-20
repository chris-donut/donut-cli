/**
 * Backtest Workflow Tutorial Scenario
 *
 * Teaches users how to run and interpret backtests.
 */

import chalk from "chalk";
import {
  Scenario,
  createInfoStep,
  createActionStep,
  createInteractiveStep,
} from "../steps/base-step.js";
import {
  generateDemoBacktestResults,
  generateDemoBacktestRuns,
  generateDemoEquityCurve,
} from "../../modes/demo-mode.js";
import { PRIMARY, SECONDARY, SUCCESS, ERROR, WARNING, MUTED, ICONS } from "../theme.js";

// ============================================================================
// Helper Functions
// ============================================================================

function formatMetric(label: string, value: string, width: number = 18): string {
  return `  ${label.padEnd(width)} ${value}`;
}

function miniChart(points: number[], width: number = 20): string {
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const chars = " ▁▂▃▄▅▆▇█";

  return points
    .slice(-width)
    .map((p) => {
      const normalized = (p - min) / range;
      const index = Math.floor(normalized * (chars.length - 1));
      return SUCCESS(chars[index]);
    })
    .join("");
}

// ============================================================================
// Scenario Definition
// ============================================================================

export const backtestWorkflowScenario: Scenario = {
  id: "backtest-workflow",
  name: "Backtest Workflow",
  description: "Learn to run and interpret backtests",
  duration: "10 min",
  difficulty: "intermediate",
  steps: [
    // Step 1: Introduction
    createInfoStep(
      "intro",
      "What is Backtesting?",
      `Backtesting simulates how your strategy would have performed on historical data.

It helps you:`,
      {
        bulletPoints: [
          "Validate strategy logic before risking real money",
          "Understand performance characteristics",
          "Identify potential weaknesses",
          "Optimize parameters",
        ],
        tip: "Past performance doesn't guarantee future results!",
      }
    ),

    // Step 2: Backtest Configuration
    createInfoStep(
      "config",
      "Backtest Configuration",
      `Before running a backtest, you configure:`,
      {
        bulletPoints: [
          `${chalk.bold("Time Period")} - Start and end dates`,
          `${chalk.bold("Initial Balance")} - Starting capital`,
          `${chalk.bold("Symbols")} - Which coins to test`,
          `${chalk.bold("Timeframe")} - Candle interval (1h, 4h, etc.)`,
          `${chalk.bold("Strategy")} - The strategy to test`,
        ],
      }
    ),

    // Step 3: Start Backtest
    createActionStep(
      "start-backtest",
      "Starting a Backtest",
      "Let's simulate starting a backtest run:",
      "donut backtest run --strategy 'Momentum Breakout'",
      () => {
        const progress = [10, 25, 45, 60, 80, 95, 100];
        let output = `
  ${chalk.bold("Starting Backtest")}
  ${MUTED("─".repeat(40))}

  Strategy:     [DEMO] Momentum Breakout Strategy
  Period:       2024-01-01 to 2024-03-01
  Balance:      $10,000
  Symbols:      BTCUSDT, ETHUSDT, SOLUSDT

`;
        output += `  ${SUCCESS("⏳")} Processing historical data...\n`;
        output += `  ${SUCCESS("█".repeat(20))} 100%\n\n`;
        output += `  ${SUCCESS(ICONS.completed)} Backtest completed in 47 seconds\n`;
        output += `  ${MUTED("Run ID:")} demo-abc12345`;

        return output;
      },
      1000
    ),

    // Step 4: Key Metrics
    createInfoStep(
      "key-metrics",
      "Understanding Key Metrics",
      `After a backtest completes, you'll see several important metrics:`,
      {
        bulletPoints: [
          `${chalk.bold("Total Return")} - Overall profit/loss percentage`,
          `${chalk.bold("Max Drawdown")} - Largest peak-to-trough decline`,
          `${chalk.bold("Sharpe Ratio")} - Risk-adjusted return (>1 is good)`,
          `${chalk.bold("Win Rate")} - Percentage of profitable trades`,
          `${chalk.bold("Profit Factor")} - Gross profit / gross loss`,
        ],
        tip: "Focus on Sharpe Ratio and Max Drawdown over raw returns",
      }
    ),

    // Step 5: View Results
    createActionStep(
      "view-results",
      "Viewing Backtest Results",
      "Here are the detailed results from our simulated backtest:",
      "donut backtest results demo-abc12345",
      () => {
        const metrics = generateDemoBacktestResults();
        const returnColor = metrics.totalReturnPct >= 0 ? SUCCESS : ERROR;

        return `
  ${chalk.bold("Backtest Results: demo-abc12345")}
  ${MUTED("─".repeat(45))}

  ${chalk.bold("Performance")}
${formatMetric("Total Return:", returnColor((metrics.totalReturnPct >= 0 ? "+" : "") + metrics.totalReturnPct.toFixed(1) + "%"))}
${formatMetric("Max Drawdown:", ERROR("-" + metrics.maxDrawdownPct.toFixed(1) + "%"))}
${formatMetric("Sharpe Ratio:", SECONDARY(metrics.sharpeRatio.toFixed(2)))}
${formatMetric("Profit Factor:", SUCCESS(metrics.profitFactor.toFixed(2)))}

  ${chalk.bold("Trade Statistics")}
${formatMetric("Total Trades:", String(metrics.trades))}
${formatMetric("Win Rate:", (metrics.winRate * 100).toFixed(0) + "%")}
${formatMetric("Avg Win:", SUCCESS("+" + metrics.avgWin.toFixed(1) + "%"))}
${formatMetric("Avg Loss:", ERROR(metrics.avgLoss.toFixed(1) + "%"))}

${formatMetric("Best Symbol:", SUCCESS(metrics.bestSymbol))}
${formatMetric("Worst Symbol:", WARNING(metrics.worstSymbol))}`;
      }
    ),

    // Step 6: Equity Curve
    createActionStep(
      "equity-curve",
      "Equity Curve",
      "The equity curve shows how your balance changed over time:",
      "donut backtest equity demo-abc12345",
      () => {
        const curve = generateDemoEquityCurve(10000, 30, 4);
        const equities = curve.map((p) => p.equity);
        const final = equities[equities.length - 1];
        const pnl = final - 10000;
        const pnlColor = pnl >= 0 ? SUCCESS : ERROR;

        return `
  ${chalk.bold("Equity Curve")}
  ${MUTED("─".repeat(40))}

  ${miniChart(equities, 40)}

  Start:    $10,000.00
  End:      ${pnlColor("$" + final.toFixed(2))}
  P&L:      ${pnlColor((pnl >= 0 ? "+" : "") + "$" + pnl.toFixed(2))}

  ${MUTED("▁▂▃▄▅▆▇█ = equity growth over time")}`;
      }
    ),

    // Step 7: Interpreting Results
    createInfoStep(
      "interpret-results",
      "Interpreting Results",
      `Here's how to evaluate backtest quality:`,
      {
        bulletPoints: [
          `${SUCCESS("Good")}: Sharpe > 1.5, Max DD < 15%, Profit Factor > 1.5`,
          `${WARNING("Okay")}: Sharpe 1.0-1.5, Max DD 15-25%, PF 1.2-1.5`,
          `${ERROR("Risky")}: Sharpe < 1.0, Max DD > 25%, PF < 1.2`,
        ],
        tip: "Be skeptical of results that seem too good - check for overfitting",
      }
    ),

    // Step 8: Interactive - Analyze
    createInteractiveStep(
      "analyze",
      "Analyze a Metric",
      `Type a metric name to learn more about it:`,
      "Enter metric (sharpe/drawdown/winrate/profitfactor):",
      (input) => {
        const metric = input.toLowerCase().replace(/[^a-z]/g, "");
        const explanations: Record<string, string> = {
          sharpe: `
  ${chalk.bold("Sharpe Ratio")}
  ${MUTED("─".repeat(30))}

  Measures risk-adjusted return by dividing excess
  return by standard deviation.

  Interpretation:
    < 0     ${ERROR("Losing money")}
    0-1     ${WARNING("Suboptimal")}
    1-2     ${SUCCESS("Good")}
    > 2     ${SUCCESS("Excellent")}

  ${MUTED("Higher is better - shows return per unit of risk")}`,

          drawdown: `
  ${chalk.bold("Maximum Drawdown")}
  ${MUTED("─".repeat(30))}

  The largest peak-to-trough decline in equity
  during the backtest period.

  Interpretation:
    < 10%   ${SUCCESS("Conservative")}
    10-20%  ${SUCCESS("Moderate")}
    20-30%  ${WARNING("Aggressive")}
    > 30%   ${ERROR("High risk")}

  ${MUTED("Lower is better - shows worst-case scenario")}`,

          winrate: `
  ${chalk.bold("Win Rate")}
  ${MUTED("─".repeat(30))}

  Percentage of trades that were profitable.

  Interpretation:
    High win rate + small wins = scalping style
    Low win rate + big wins = trend following

  ${WARNING("Win rate alone doesn't determine profitability!")}
  ${MUTED("Consider it together with avg win/loss ratio")}`,

          profitfactor: `
  ${chalk.bold("Profit Factor")}
  ${MUTED("─".repeat(30))}

  Gross profit divided by gross loss.

  Interpretation:
    < 1.0   ${ERROR("Net loser")}
    1.0-1.5 ${WARNING("Marginal")}
    1.5-2.0 ${SUCCESS("Good")}
    > 2.0   ${SUCCESS("Excellent")}

  ${MUTED("Must be > 1 to be profitable long-term")}`,
        };

        return explanations[metric] || `
  ${WARNING("Unknown metric: " + input)}

  Try one of: sharpe, drawdown, winrate, profitfactor`;
      },
      {
        suggestedInput: "sharpe",
      }
    ),

    // Step 9: Multiple Runs
    createActionStep(
      "multiple-runs",
      "Comparing Runs",
      "You can run multiple backtests and compare them:",
      "donut backtest runs --limit 5",
      () => {
        const runs = generateDemoBacktestRuns(5);
        let output = `
  ${chalk.bold("Recent Backtest Runs")}
  ${MUTED("─".repeat(65))}

`;
        for (const run of runs) {
          const date = new Date(run.startedAt).toLocaleDateString();
          const returnStr = (run.metrics.totalReturnPct >= 0 ? "+" : "") +
            run.metrics.totalReturnPct.toFixed(1) + "%";
          const returnColor = run.metrics.totalReturnPct >= 0 ? SUCCESS : ERROR;

          output += `  ${SECONDARY(run.runId.slice(0, 12))} `;
          output += `${MUTED(date)} `;
          output += `${returnColor(returnStr.padStart(8))} `;
          output += `SR: ${run.metrics.sharpeRatio.toFixed(2)} `;
          output += `${MUTED("Trades:")} ${run.metrics.trades}\n`;
        }

        output += `\n  ${MUTED("Compare runs to find the best performing configuration")}`;
        return output;
      }
    ),

    // Step 10: Best Practices
    createInfoStep(
      "best-practices",
      "Backtesting Best Practices",
      `Follow these guidelines for reliable backtest results:`,
      {
        bulletPoints: [
          "Use realistic fees and slippage assumptions",
          "Test on out-of-sample data (walk-forward)",
          "Avoid over-optimizing (curve fitting)",
          "Consider market regime changes",
          "Run multiple time periods",
        ],
        tip: "Paper trade before going live!",
      }
    ),

    // Step 11: Summary
    createInfoStep(
      "summary",
      "Workflow Summary",
      `You've learned the complete backtesting workflow:`,
      {
        bulletPoints: [
          "Configure backtest parameters",
          "Run the simulation",
          "Interpret key metrics (Sharpe, Drawdown, etc.)",
          "Analyze equity curves",
          "Compare multiple runs",
        ],
        tip: "Next, try the Trade Analysis tutorial to dive deeper",
      }
    ),
  ],
};
