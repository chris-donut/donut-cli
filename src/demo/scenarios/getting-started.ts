/**
 * Getting Started Tutorial Scenario
 *
 * Introduces new users to the Donut CLI basics.
 */

import chalk from "chalk";
import {
  Scenario,
  createInfoStep,
  createActionStep,
} from "../steps/base-step.js";
import {
  generateDemoStrategies,
  generateDemoBacktestResults,
} from "../../modes/demo-mode.js";
import { PRIMARY, SECONDARY, SUCCESS, MUTED, ICONS } from "../theme.js";

// ============================================================================
// Scenario Definition
// ============================================================================

export const gettingStartedScenario: Scenario = {
  id: "getting-started",
  name: "Getting Started",
  description: "Learn the basics of Donut CLI",
  duration: "5 min",
  difficulty: "beginner",
  steps: [
    // Step 1: Welcome
    createInfoStep(
      "welcome",
      "Welcome to Donut CLI!",
      `Donut CLI is an AI-powered trading terminal that helps you build, test, and execute trading strategies.

In this tutorial, you'll learn:`,
      {
        bulletPoints: [
          "What Donut CLI can do",
          "Key commands and modes",
          "How demo mode works",
          "Where to go next",
        ],
        tip: "Demo mode uses simulated data, so feel free to experiment!",
      }
    ),

    // Step 2: Main Commands
    createInfoStep(
      "main-commands",
      "Main Commands",
      `Donut CLI has several main commands you can use:`,
      {
        bulletPoints: [
          `${chalk.cyan("donut demo")} - Explore with demo data (you're here!)`,
          `${chalk.cyan("donut chat")} - Interactive AI chat mode`,
          `${chalk.cyan("donut strategy")} - Build trading strategies`,
          `${chalk.cyan("donut backtest")} - Test strategies on historical data`,
          `${chalk.cyan("donut paper")} - Paper trade with real-time data`,
        ],
        tip: "Use donut --help to see all available commands",
      }
    ),

    // Step 3: Demo Mode
    createInfoStep(
      "demo-mode",
      "Demo Mode",
      `Demo mode is a safe environment for learning. All data is simulated and clearly marked with [DEMO].

You can explore:`,
      {
        bulletPoints: [
          "Sample trading strategies",
          "Backtest results and metrics",
          "Trade history visualization",
          "Performance analysis",
        ],
      }
    ),

    // Step 4: View Strategies
    createActionStep(
      "view-strategies",
      "Sample Strategies",
      "Let's look at some demo strategies. These show different trading approaches you can build.",
      "donut demo strategies",
      () => {
        const strategies = generateDemoStrategies();
        let output = "";

        for (const strategy of strategies.slice(0, 2)) {
          output += `\n  ${PRIMARY(strategy.name)}\n`;
          output += `  ${MUTED(strategy.description?.slice(0, 70) + "...")}\n`;
          output += `  ${MUTED("Coins:")} ${strategy.coinSource.staticCoins?.join(", ") || strategy.coinSource.sourceType}\n`;
        }

        output += `\n  ${SUCCESS(ICONS.completed)} Loaded ${strategies.length} demo strategies`;
        return output;
      },
      500
    ),

    // Step 5: View Metrics
    createActionStep(
      "view-metrics",
      "Performance Metrics",
      "Backtest results show key metrics like return, drawdown, and win rate.",
      "donut demo backtest",
      () => {
        const metrics = generateDemoBacktestResults();
        return `
  ${chalk.bold("Backtest Results")}
  ${MUTED("─".repeat(30))}

  Total Return:    ${SUCCESS("+" + metrics.totalReturnPct.toFixed(1) + "%")}
  Max Drawdown:    ${chalk.red("-" + metrics.maxDrawdownPct.toFixed(1) + "%")}
  Sharpe Ratio:    ${SECONDARY(metrics.sharpeRatio.toFixed(2))}
  Win Rate:        ${metrics.winRate * 100}%
  Total Trades:    ${metrics.trades}

  ${SUCCESS(ICONS.completed)} These metrics help evaluate strategy performance`;
      },
      500
    ),

    // Step 6: Next Steps
    createInfoStep(
      "next-steps",
      "What's Next?",
      `You've learned the basics of Donut CLI.

Here's what you can do next:`,
      {
        bulletPoints: [
          "Try the Strategy Basics tutorial to learn about trading strategies",
          "Explore the Backtest Workflow to understand historical testing",
          `Run ${chalk.cyan("donut chat")} to interact with the AI assistant`,
          `Check ${chalk.cyan("donut --help")} for all available options`,
        ],
        tip: "Return to this tutorial anytime with 'donut demo tour'",
      }
    ),
  ],
};
