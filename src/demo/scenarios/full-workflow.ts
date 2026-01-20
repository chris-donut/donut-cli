/**
 * Full Workflow Tutorial Scenario
 *
 * Advanced end-to-end workflow for experienced users.
 */

import chalk from "chalk";
import {
  Scenario,
  createInfoStep,
  createActionStep,
  createInteractiveStep,
} from "../steps/base-step.js";
import {
  generateDemoStrategy,
  generateDemoBacktestResults,
  generateDemoTrades,
  generateDemoEquityCurve,
} from "../../modes/demo-mode.js";
import { PRIMARY, SECONDARY, SUCCESS, ERROR, WARNING, MUTED, ICONS } from "../theme.js";

// ============================================================================
// Scenario Definition
// ============================================================================

export const fullWorkflowScenario: Scenario = {
  id: "full-workflow",
  name: "Full Workflow",
  description: "Complete end-to-end trading workflow",
  duration: "15 min",
  difficulty: "advanced",
  steps: [
    // Step 1: Overview
    createInfoStep(
      "overview",
      "End-to-End Workflow",
      `This tutorial covers the complete trading workflow:`,
      {
        bulletPoints: [
          "1. Define strategy requirements",
          "2. Build strategy with AI assistance",
          "3. Backtest and optimize",
          "4. Paper trade for validation",
          "5. Deploy to live trading",
        ],
        tip: "This simulates a realistic development process",
      }
    ),

    // Step 2: Requirements
    createInfoStep(
      "requirements",
      "Step 1: Define Requirements",
      `Before building, clarify your trading goals:`,
      {
        bulletPoints: [
          `${chalk.bold("Market")} - Crypto perpetuals, spot, or both?`,
          `${chalk.bold("Style")} - Trend following, mean reversion, or arbitrage?`,
          `${chalk.bold("Risk")} - Max drawdown you can tolerate?`,
          `${chalk.bold("Capital")} - Starting balance and position limits?`,
          `${chalk.bold("Timeframe")} - Day trading or swing trading?`,
        ],
      }
    ),

    // Step 3: Interactive - Define Style
    createInteractiveStep(
      "define-style",
      "Choose Trading Style",
      `Select a trading style for our demo strategy:`,
      "Enter style (momentum/meanreversion/arbitrage):",
      (input) => {
        const style = input.toLowerCase().replace(/[^a-z]/g, "");
        const styles: Record<string, any> = {
          momentum: {
            name: "Momentum/Trend Following",
            description: "Follows established price trends",
            indicators: "EMA crossovers, MACD, breakout patterns",
            winRate: "35-45%",
            avgWin: "Large (3-5x avg loss)",
            holdTime: "Hours to days",
          },
          meanreversion: {
            name: "Mean Reversion",
            description: "Bets on price returning to average",
            indicators: "RSI extremes, Bollinger Bands, support/resistance",
            winRate: "55-65%",
            avgWin: "Smaller (1-2x avg loss)",
            holdTime: "Minutes to hours",
          },
          arbitrage: {
            name: "Arbitrage/Funding",
            description: "Exploits price or funding rate differences",
            indicators: "Funding rates, price spreads, OI analysis",
            winRate: "70-80%",
            avgWin: "Small but consistent",
            holdTime: "8-hour funding cycles",
          },
        };

        const selected = styles[style] || styles.momentum;
        const styleName = style in styles ? style : "momentum";

        return `
  ${chalk.bold(selected.name)}
  ${MUTED("─".repeat(40))}

  ${selected.description}

  Key Indicators:  ${SECONDARY(selected.indicators)}
  Typical Win Rate: ${selected.winRate}
  Avg Win Size:     ${selected.avgWin}
  Hold Time:        ${selected.holdTime}

  ${SUCCESS(ICONS.completed)} Building a ${styleName} strategy...`;
      },
      {
        suggestedInput: "momentum",
      }
    ),

    // Step 4: Build with AI
    createActionStep(
      "build-strategy",
      "Step 2: Build with AI",
      "The AI agent helps configure your strategy:",
      "donut strategy build",
      () => {
        const strategy = generateDemoStrategy();
        return `
  ${chalk.bold("AI Strategy Builder")}
  ${MUTED("─".repeat(45))}

  ${ICONS.robot} Analyzing your requirements...

  ${chalk.bold("Generated Configuration:")}

  ${SECONDARY("Coin Source:")}
    Type: ${strategy.coinSource.sourceType}
    Coins: ${strategy.coinSource.staticCoins?.join(", ")}

  ${SECONDARY("Indicators:")}
    EMA: [${strategy.indicators.emaPeriods?.join(", ")}]
    RSI: [${strategy.indicators.rsiPeriods?.join(", ")}]
    MACD: ${strategy.indicators.enableMACD ? SUCCESS("ON") : "OFF"}

  ${SECONDARY("Risk Control:")}
    Max Positions: ${strategy.riskControl.maxPositions}
    Leverage: ${strategy.riskControl.btcEthMaxLeverage}x BTC/ETH
    Min Confidence: ${strategy.riskControl.minConfidence}%

  ${SUCCESS(ICONS.completed)} Strategy created: ${PRIMARY(strategy.name)}`;
      },
      500
    ),

    // Step 5: Run Backtest
    createActionStep(
      "run-backtest",
      "Step 3: Backtest Strategy",
      "Test the strategy on historical data:",
      "donut backtest run --period 90d",
      () => {
        const metrics = generateDemoBacktestResults();
        const curve = generateDemoEquityCurve(10000, 30, 4);
        const equities = curve.map((p) => p.equity);
        const final = equities[equities.length - 1];

        return `
  ${chalk.bold("Backtest Complete")}
  ${MUTED("─".repeat(45))}

  Period:   90 days (2024-01-01 to 2024-03-31)
  Balance:  $10,000 → $${final.toFixed(2)}

  ${chalk.bold("Key Metrics:")}
  Total Return:  ${SUCCESS("+" + metrics.totalReturnPct.toFixed(1) + "%")}
  Max Drawdown:  ${metrics.maxDrawdownPct < 15 ? SUCCESS("-" + metrics.maxDrawdownPct.toFixed(1) + "%") : WARNING("-" + metrics.maxDrawdownPct.toFixed(1) + "%")}
  Sharpe Ratio:  ${metrics.sharpeRatio >= 1.5 ? SUCCESS(metrics.sharpeRatio.toFixed(2)) : SECONDARY(metrics.sharpeRatio.toFixed(2))}
  Win Rate:      ${(metrics.winRate * 100).toFixed(0)}%
  Total Trades:  ${metrics.trades}

  ${metrics.sharpeRatio >= 1.5 ? SUCCESS("✓ Strategy looks promising!") : WARNING("Consider optimizing parameters")}`;
      },
      1000
    ),

    // Step 6: Optimization
    createInfoStep(
      "optimization",
      "Optimizing Parameters",
      `Based on backtest results, consider adjusting:`,
      {
        bulletPoints: [
          "Indicator periods (try different EMA/RSI values)",
          "Entry/exit thresholds",
          "Position sizing and leverage",
          "Stop-loss and take-profit levels",
          "Coin selection (remove poor performers)",
        ],
        tip: "Avoid over-optimization (curve fitting)",
      }
    ),

    // Step 7: Paper Trading
    createActionStep(
      "paper-trading",
      "Step 4: Paper Trading",
      "Validate with real-time simulated trading:",
      "donut paper start",
      () => {
        const trades = generateDemoTrades(5);
        const recentTrades = trades.filter((t) => t.action === "close").slice(0, 3);

        let output = `
  ${chalk.bold("Paper Trading Active")}
  ${MUTED("─".repeat(45))}

  ${SUCCESS("●")} Strategy running in paper mode
  ${MUTED("Starting balance: $10,000")}

  ${chalk.bold("Recent Paper Trades:")}
`;

        for (const trade of recentTrades) {
          const pnl = trade.realizedPnL || 0;
          const pnlColor = pnl >= 0 ? SUCCESS : ERROR;
          output += `  ${trade.symbol.padEnd(10)} ${pnlColor((pnl >= 0 ? "+" : "") + "$" + pnl.toFixed(2))}\n`;
        }

        output += `
  ${MUTED("Paper trading uses real market data with simulated execution")}
  ${SUCCESS(ICONS.completed)} Monitor for 1-2 weeks before going live`;

        return output;
      },
      500
    ),

    // Step 8: Go-Live Checklist
    createInfoStep(
      "go-live-checklist",
      "Step 5: Pre-Live Checklist",
      `Before deploying to live trading, verify:`,
      {
        bulletPoints: [
          "✓ Consistent paper trading results (2+ weeks)",
          "✓ Risk parameters appropriate for real capital",
          "✓ API keys configured and tested",
          "✓ Monitoring and alerts set up",
          "✓ Emergency stop procedures documented",
          "✓ Started with small capital (10-20% of planned)",
        ],
        tip: "Never risk more than you can afford to lose",
      }
    ),

    // Step 9: Deploy
    createActionStep(
      "deploy",
      "Deploy to Live Trading",
      "Deploy with careful monitoring:",
      "donut live start --capital 2000",
      () => {
        return `
  ${chalk.bold("Live Deployment")}
  ${MUTED("─".repeat(45))}

  ${WARNING("⚠ LIVE TRADING SIMULATION")}

  ${chalk.bold("Deployment Config:")}
  Capital:      $2,000 (20% of paper trading capital)
  Max Risk:     $200 per trade (10% of capital)
  Strategy:     [DEMO] Momentum Breakout Strategy

  ${chalk.bold("Safety Features:")}
  ${SUCCESS("✓")} Daily loss limit: $400 (20%)
  ${SUCCESS("✓")} Position limit: 3 concurrent
  ${SUCCESS("✓")} Leverage capped: 5x
  ${SUCCESS("✓")} Emergency stop hotkey: Ctrl+X

  ${SUCCESS(ICONS.rocket + " Strategy deployed!")}

  ${MUTED("Monitor closely for the first 24-48 hours")}
  ${MUTED("Scale up gradually as confidence builds")}`;
      },
      500
    ),

    // Step 10: Summary
    createInfoStep(
      "summary",
      "Workflow Complete",
      `You've completed the full trading workflow:`,
      {
        bulletPoints: [
          "1. Defined requirements and trading style",
          "2. Built strategy with AI assistance",
          "3. Backtested and analyzed results",
          "4. Validated with paper trading",
          "5. Deployed with safety measures",
        ],
        tip: "Continuous improvement: monitor, analyze, iterate",
      }
    ),

    // Step 11: Final Tips
    createInfoStep(
      "final-tips",
      "Pro Tips",
      `Final advice for successful trading:`,
      {
        bulletPoints: [
          "Keep a trading journal to track decisions",
          "Review and update strategies quarterly",
          "Don't chase losses - stick to your plan",
          "Diversify across uncorrelated strategies",
          "Stay informed about market conditions",
        ],
        tip: "Consistency and discipline beat quick wins",
      }
    ),
  ],
};
