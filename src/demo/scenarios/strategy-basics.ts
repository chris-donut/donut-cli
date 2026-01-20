/**
 * Strategy Basics Tutorial Scenario
 *
 * Teaches users about trading strategy components.
 */

import chalk from "chalk";
import {
  Scenario,
  createInfoStep,
  createActionStep,
  createInteractiveStep,
} from "../steps/base-step.js";
import { generateDemoStrategy } from "../../modes/demo-mode.js";
import { PRIMARY, SECONDARY, SUCCESS, WARNING, MUTED, ICONS } from "../theme.js";

// ============================================================================
// Scenario Definition
// ============================================================================

export const strategyBasicsScenario: Scenario = {
  id: "strategy-basics",
  name: "Strategy Basics",
  description: "Learn how trading strategies are structured",
  duration: "8 min",
  difficulty: "beginner",
  steps: [
    // Step 1: Introduction
    createInfoStep(
      "intro",
      "What is a Trading Strategy?",
      `A trading strategy is a set of rules that determine:

- Which coins to trade
- When to enter positions
- When to exit positions
- How much risk to take

Donut CLI helps you build AI-powered strategies that adapt to market conditions.`
    ),

    // Step 2: Three Components
    createInfoStep(
      "components",
      "Strategy Components",
      `Every Donut CLI strategy has three main components:`,
      {
        bulletPoints: [
          `${SECONDARY("Coin Source")} - Which coins to trade`,
          `${SECONDARY("Indicators")} - Technical signals for decisions`,
          `${SECONDARY("Risk Control")} - Position sizing and limits`,
        ],
        tip: "The AI agent uses all three to make trading decisions",
      }
    ),

    // Step 3: Coin Source
    createInfoStep(
      "coin-source",
      "1. Coin Source",
      `The coin source defines your trading universe:`,
      {
        bulletPoints: [
          `${chalk.bold("Static List")} - Fixed coins like BTC, ETH, SOL`,
          `${chalk.bold("Coin Pool")} - Dynamic pool from screeners`,
          `${chalk.bold("OI Top")} - Top coins by open interest`,
        ],
        tip: "Start with a small static list while learning",
      }
    ),

    // Step 4: View Coin Source Example
    createActionStep(
      "coin-source-example",
      "Coin Source Example",
      "Here's a typical coin source configuration:",
      "strategy.coinSource",
      () => {
        const strategy = generateDemoStrategy();
        return `
  ${chalk.bold("Coin Source Configuration")}
  ${MUTED("─".repeat(35))}

  Source Type:    ${SECONDARY(strategy.coinSource.sourceType)}
  Static Coins:   ${strategy.coinSource.staticCoins?.join(", ")}
  Use Coin Pool:  ${strategy.coinSource.useCoinPool ? "Yes" : "No"}
  Pool Limit:     ${strategy.coinSource.coinPoolLimit}

  ${SUCCESS(ICONS.completed)} This strategy trades BTC, ETH, and SOL`;
      }
    ),

    // Step 5: Indicators
    createInfoStep(
      "indicators",
      "2. Technical Indicators",
      `Indicators provide signals for the AI to analyze:`,
      {
        bulletPoints: [
          `${chalk.bold("EMA")} - Exponential Moving Average (trend)`,
          `${chalk.bold("RSI")} - Relative Strength Index (momentum)`,
          `${chalk.bold("MACD")} - Moving Average Convergence/Divergence`,
          `${chalk.bold("ATR")} - Average True Range (volatility)`,
          `${chalk.bold("Volume")} - Trading volume analysis`,
          `${chalk.bold("Funding Rate")} - Perpetual futures funding`,
        ],
        tip: "The AI interprets these indicators contextually",
      }
    ),

    // Step 6: View Indicators Example
    createActionStep(
      "indicators-example",
      "Indicators Example",
      "Here's a sample indicator configuration:",
      "strategy.indicators",
      () => {
        const strategy = generateDemoStrategy();
        const ind = strategy.indicators;
        return `
  ${chalk.bold("Enabled Indicators")}
  ${MUTED("─".repeat(35))}

  EMA:           ${ind.enableEMA ? SUCCESS("ON") : MUTED("OFF")}  Periods: ${ind.emaPeriods?.join(", ")}
  MACD:          ${ind.enableMACD ? SUCCESS("ON") : MUTED("OFF")}
  RSI:           ${ind.enableRSI ? SUCCESS("ON") : MUTED("OFF")}  Periods: ${ind.rsiPeriods?.join(", ")}
  ATR:           ${ind.enableATR ? SUCCESS("ON") : MUTED("OFF")}  Periods: ${ind.atrPeriods?.join(", ")}
  Volume:        ${ind.enableVolume ? SUCCESS("ON") : MUTED("OFF")}
  Funding Rate:  ${ind.enableFundingRate ? SUCCESS("ON") : MUTED("OFF")}

  ${SUCCESS(ICONS.completed)} Multiple indicators provide comprehensive analysis`;
      }
    ),

    // Step 7: Risk Control
    createInfoStep(
      "risk-control",
      "3. Risk Control",
      `Risk control is crucial for long-term success:`,
      {
        bulletPoints: [
          `${chalk.bold("Max Positions")} - Limit concurrent trades`,
          `${chalk.bold("Leverage Limits")} - Separate for BTC/ETH vs alts`,
          `${chalk.bold("Position Sizing")} - Minimum trade size`,
          `${chalk.bold("Risk/Reward")} - Minimum acceptable ratio`,
          `${chalk.bold("Confidence")} - AI decision threshold`,
        ],
        tip: "Conservative risk settings help during learning",
      }
    ),

    // Step 8: Interactive - Choose Risk Level
    createInteractiveStep(
      "risk-interactive",
      "Choose Risk Level",
      `Let's explore different risk configurations.

Type a risk level to see recommended settings:`,
      "Choose risk level (conservative/moderate/aggressive):",
      (input) => {
        const level = input.toLowerCase();
        const configs: Record<string, any> = {
          conservative: {
            maxPositions: 2,
            leverage: "3x BTC/ETH, 2x alts",
            maxMargin: "50%",
            minRR: "3:1",
            confidence: "80%",
          },
          moderate: {
            maxPositions: 4,
            leverage: "5x BTC/ETH, 3x alts",
            maxMargin: "70%",
            minRR: "2.5:1",
            confidence: "70%",
          },
          aggressive: {
            maxPositions: 8,
            leverage: "10x BTC/ETH, 5x alts",
            maxMargin: "90%",
            minRR: "2:1",
            confidence: "60%",
          },
        };

        const config = configs[level] || configs.moderate;
        const levelName = level in configs ? level : "moderate";

        return `
  ${chalk.bold(`${levelName.toUpperCase()} Risk Settings`)}
  ${MUTED("─".repeat(35))}

  Max Positions:     ${SECONDARY(config.maxPositions)}
  Leverage:          ${config.leverage}
  Max Margin Usage:  ${config.maxMargin}
  Min Risk/Reward:   ${config.minRR}
  Min Confidence:    ${config.confidence}

  ${level === "aggressive" ? WARNING("⚠ Higher risk = higher potential losses") : SUCCESS(ICONS.completed + " Good choice for learning")}`;
      },
      {
        suggestedInput: "moderate",
      }
    ),

    // Step 9: Summary
    createInfoStep(
      "summary",
      "Strategy Summary",
      `You now understand the three pillars of a Donut CLI strategy:`,
      {
        bulletPoints: [
          `${SECONDARY("Coin Source")} - Defines what to trade`,
          `${SECONDARY("Indicators")} - Provides analysis signals`,
          `${SECONDARY("Risk Control")} - Manages exposure and sizing`,
        ],
        tip: "Next, try the Backtest Workflow to test strategies",
      }
    ),
  ],
};
