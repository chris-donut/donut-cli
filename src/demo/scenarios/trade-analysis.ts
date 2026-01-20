/**
 * Trade Analysis Tutorial Scenario
 *
 * Teaches users how to interpret trade data.
 */

import chalk from "chalk";
import {
  Scenario,
  createInfoStep,
  createActionStep,
  createInteractiveStep,
} from "../steps/base-step.js";
import {
  generateDemoTrades,
  generateDemoBacktestResults,
} from "../../modes/demo-mode.js";
import { PRIMARY, SECONDARY, SUCCESS, ERROR, WARNING, MUTED, ICONS } from "../theme.js";

// ============================================================================
// Scenario Definition
// ============================================================================

export const tradeAnalysisScenario: Scenario = {
  id: "trade-analysis",
  name: "Trade Analysis",
  description: "Learn to interpret trade history and PnL",
  duration: "7 min",
  difficulty: "intermediate",
  steps: [
    // Step 1: Introduction
    createInfoStep(
      "intro",
      "Understanding Trade Data",
      `Trade analysis helps you understand your strategy's behavior.

You'll learn to interpret:`,
      {
        bulletPoints: [
          "Trade events (entries and exits)",
          "Position sizing and leverage",
          "Profit and loss calculations",
          "Per-symbol performance",
        ],
      }
    ),

    // Step 2: Trade Events
    createInfoStep(
      "trade-events",
      "Trade Event Types",
      `Each trade consists of events:`,
      {
        bulletPoints: [
          `${chalk.bold("OPEN")} - Entry into a position`,
          `${chalk.bold("CLOSE")} - Exit from a position`,
          `${chalk.bold("LONG")} - Betting price goes up`,
          `${chalk.bold("SHORT")} - Betting price goes down`,
        ],
        tip: "A complete trade cycle = OPEN + CLOSE of same position",
      }
    ),

    // Step 3: View Trades
    createActionStep(
      "view-trades",
      "Sample Trade History",
      "Let's look at recent trade events:",
      "donut demo trades --limit 8",
      () => {
        const trades = generateDemoTrades(8);
        let output = `
  ${chalk.bold("Trade History")}
  ${MUTED("─".repeat(70))}
\n`;

        for (const trade of trades.slice(0, 8)) {
          const date = new Date(trade.timestamp).toLocaleString().slice(0, 17);
          const sideStr = trade.side === "long" ? SUCCESS("LONG ") : ERROR("SHORT");
          const actionStr = trade.action === "open" ? SECONDARY("OPEN ") : WARNING("CLOSE");
          const pnlStr = trade.realizedPnL !== undefined
            ? (trade.realizedPnL >= 0
                ? SUCCESS("+" + trade.realizedPnL.toFixed(2))
                : ERROR(trade.realizedPnL.toFixed(2)))
            : MUTED("--");

          output += `  ${MUTED(date)} ${actionStr} ${sideStr} `;
          output += `${trade.symbol.padEnd(10)} `;
          output += `$${trade.price.toFixed(2).padStart(10)} `;
          output += `${trade.leverage}x `;
          output += `PnL: ${pnlStr}\n`;
        }

        return output;
      }
    ),

    // Step 4: Reading Trade Details
    createInfoStep(
      "trade-details",
      "Trade Details Explained",
      `Each trade shows important details:`,
      {
        bulletPoints: [
          `${chalk.bold("Timestamp")} - When the trade occurred`,
          `${chalk.bold("Action")} - OPEN (entry) or CLOSE (exit)`,
          `${chalk.bold("Side")} - LONG or SHORT direction`,
          `${chalk.bold("Symbol")} - Trading pair (e.g., BTCUSDT)`,
          `${chalk.bold("Price")} - Execution price`,
          `${chalk.bold("Leverage")} - Position multiplier`,
          `${chalk.bold("PnL")} - Realized profit/loss on close`,
        ],
      }
    ),

    // Step 5: PnL Calculation
    createInfoStep(
      "pnl-calculation",
      "How PnL is Calculated",
      `Profit and Loss depends on position direction:`,
      {
        bulletPoints: [
          `${chalk.bold("LONG")}: (Exit Price - Entry Price) × Quantity × Leverage`,
          `${chalk.bold("SHORT")}: (Entry Price - Exit Price) × Quantity × Leverage`,
          `${chalk.bold("Fees")}: Subtracted from PnL (typically 0.04%)`,
          `${chalk.bold("Slippage")}: Execution price difference`,
        ],
        tip: "Leverage amplifies both gains AND losses",
      }
    ),

    // Step 6: Example Calculation
    createActionStep(
      "example-calc",
      "PnL Example",
      "Let's calculate PnL for a sample trade:",
      "calculate pnl",
      () => {
        return `
  ${chalk.bold("PnL Calculation Example")}
  ${MUTED("─".repeat(40))}

  ${SECONDARY("Trade Setup:")}
  Entry:      $95,000 (LONG BTCUSDT)
  Exit:       $97,000
  Quantity:   0.05 BTC
  Leverage:   5x

  ${SECONDARY("Calculation:")}
  Price Move: $97,000 - $95,000 = $2,000
  Per Unit:   $2,000 × 0.05 = $100
  Leveraged:  $100 × 5 = ${SUCCESS("$500")}
  Fees:       -$3.84 (0.04% × 2 trades)

  ${chalk.bold("Net PnL:")} ${SUCCESS("+$496.16")}

  ${MUTED("Same trade at 10x leverage = $996.16 profit")}
  ${WARNING("But 2% move against you = liquidation risk!")}`;
      }
    ),

    // Step 7: Per-Symbol Stats
    createActionStep(
      "symbol-stats",
      "Per-Symbol Performance",
      "Analyze which symbols performed best:",
      "donut backtest symbols demo-abc12345",
      () => {
        const metrics = generateDemoBacktestResults();
        let output = `
  ${chalk.bold("Symbol Performance")}
  ${MUTED("─".repeat(45))}
\n`;

        if (metrics.symbolStats) {
          for (const [symbol, stats] of Object.entries(metrics.symbolStats)) {
            const pnlColor = stats.totalPnL >= 0 ? SUCCESS : ERROR;
            const winRateColor = stats.winRate >= 0.5 ? SUCCESS : WARNING;

            output += `  ${SECONDARY(symbol.padEnd(10))} `;
            output += `${String(stats.trades).padStart(3)} trades  `;
            output += `Win: ${winRateColor((stats.winRate * 100).toFixed(0) + "%")}  `;
            output += `PnL: ${pnlColor((stats.totalPnL >= 0 ? "+" : "") + "$" + stats.totalPnL.toFixed(2))}\n`;
          }
        }

        output += `\n  Best:  ${SUCCESS(metrics.bestSymbol)}`;
        output += `\n  Worst: ${WARNING(metrics.worstSymbol)}`;
        output += `\n\n  ${MUTED("Consider removing consistently losing symbols")}`;

        return output;
      }
    ),

    // Step 8: Interactive - Analyze Trade
    createInteractiveStep(
      "analyze-trade",
      "Analyze a Trade",
      `Let's analyze a hypothetical trade.

Enter a price change percentage to see the leveraged outcome:`,
      "Enter price change (e.g., 2.5, -1.5):",
      (input) => {
        const change = parseFloat(input);
        if (isNaN(change)) {
          return `\n  ${ERROR("Invalid number. Try something like 2.5 or -1.5")}`;
        }

        const entry = 95000;
        const exit = entry * (1 + change / 100);
        const quantity = 0.1;
        const leverage = 5;

        const basePnL = (exit - entry) * quantity;
        const leveragedPnL = basePnL * leverage;
        const pnlColor = leveragedPnL >= 0 ? SUCCESS : ERROR;

        return `
  ${chalk.bold("Trade Analysis")}
  ${MUTED("─".repeat(35))}

  Entry:       $${entry.toFixed(2)}
  Exit:        $${exit.toFixed(2)} (${change >= 0 ? "+" : ""}${change}%)
  Position:    ${quantity} BTC × 5x

  ${SECONDARY("Without Leverage:")}
  PnL: ${basePnL >= 0 ? "+" : ""}$${basePnL.toFixed(2)}

  ${SECONDARY("With 5x Leverage:")}
  PnL: ${pnlColor((leveragedPnL >= 0 ? "+" : "") + "$" + leveragedPnL.toFixed(2))}

  ${change < 0 && Math.abs(change) > 20 ? ERROR("⚠ This could trigger liquidation!") : ""}
  ${change > 0 ? SUCCESS(ICONS.completed + " Profitable trade") : WARNING("Loss - part of trading")}`;
      },
      {
        suggestedInput: "2.5",
      }
    ),

    // Step 9: Summary
    createInfoStep(
      "summary",
      "Analysis Summary",
      `You can now interpret trade data effectively:`,
      {
        bulletPoints: [
          "Read trade events and understand their meaning",
          "Calculate PnL with leverage",
          "Analyze per-symbol performance",
          "Identify winning and losing patterns",
        ],
        tip: "Use trade analysis to refine your strategies",
      }
    ),
  ],
};
