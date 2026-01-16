#!/usr/bin/env node
/**
 * Donut CLI - Unified Trading Terminal with Claude Agent SDK
 *
 * A powerful CLI for trading strategy development, backtesting,
 * and execution powered by Claude AI agents.
 *
 * Supports multiple backends:
 * - Hummingbot Dashboard (default)
 * - nofx Go engine (optional)
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { config as dotenvConfig } from "dotenv";

import { loadConfig, validateApiKeys } from "./core/config.js";
import { SessionManager } from "./core/session.js";
import { createStrategyBuilder } from "./agents/strategy-builder.js";
import { createBacktestAnalyst } from "./agents/backtest-analyst.js";
import { registerSessionCommands, registerPaperTradingCommands, BANNER, DEMO_BANNER, DEMO_INDICATOR } from "./cli/index.js";
import {
  createPaperSession,
  getPaperSession,
  listPaperSessions,
  stopPaperSession,
  calculatePaperMetrics,
} from "./modes/paper-trading.js";
import { HummingbotClient } from "./integrations/hummingbot-client.js";
import {
  TelegramClientConfig,
  validateCredentials,
  sendMessage,
} from "./integrations/telegram-client.js";
import {
  DEMO_PREFIX,
  generateDemoStrategies,
  generateDemoBacktestResults,
  generateDemoTrades,
  generateDemoBacktestRuns,
  generateDemoEquityCurve,
} from "./modes/demo-mode.js";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

// Load environment variables
dotenvConfig();

const program = new Command();

program
  .name("donut")
  .description("Unified trading terminal with Claude Agent SDK")
  .version("0.1.0");

// ============================================================================
// Session Commands (modularized)
// ============================================================================
registerSessionCommands(program);

// ============================================================================
// Strategy Commands
// ============================================================================

const strategyCmd = program
  .command("strategy")
  .description("Strategy management commands");

strategyCmd
  .command("build")
  .description("Build a new trading strategy")
  .argument("[description]", "Strategy description or requirements")
  .action(async (description) => {
    console.log(BANNER);

    const spinner = ora("Initializing strategy builder...").start();

    try {
      const config = loadConfig();
      validateApiKeys(config);

      const sessionManager = new SessionManager(config.sessionDir);

      // Load most recent session or create new one
      const sessions = await sessionManager.listSessions();
      if (sessions.length > 0) {
        await sessionManager.loadSession(sessions[sessions.length - 1]);
      } else {
        await sessionManager.createSession();
      }

      spinner.succeed("Strategy builder ready");

      const agent = createStrategyBuilder({
        terminalConfig: config,
        sessionManager,
      });

      const prompt = description || "Help me build a crypto trading strategy. Ask me about my goals and preferences.";

      console.log(chalk.gray("\nClaude is thinking...\n"));

      const result = await agent.buildStrategy(prompt);

      if (result.success) {
        console.log(chalk.green("\n\n✓ Strategy building complete"));
      } else {
        console.log(chalk.red(`\n\n✗ Failed: ${result.error}`));
      }
    } catch (error) {
      spinner.fail(chalk.red(`Failed: ${error instanceof Error ? error.message : error}`));
      process.exit(1);
    }
  });

strategyCmd
  .command("list")
  .description("List available strategies")
  .action(async () => {
    const config = loadConfig();
    if (!config.hummingbotUrl) {
      console.log(chalk.yellow("\nStrategy listing requires Hummingbot Dashboard"));
      console.log(chalk.gray("Set HUMMINGBOT_URL in your .env file"));
      return;
    }
    console.log(chalk.gray("\nFetching strategies from Hummingbot..."));
    // TODO: Implement once Hummingbot client is ready
  });

// ============================================================================
// Backtest Commands
// ============================================================================

const backtestCmd = program
  .command("backtest")
  .description("Backtesting commands");

backtestCmd
  .command("run")
  .description("Run a new backtest")
  .option("-s, --symbols <symbols>", "Comma-separated symbols (e.g., BTCUSDT,ETHUSDT)")
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
        backtestConfig.symbols = options.symbols.split(",").map((s: string) => s.trim().toUpperCase());
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
      spinner.fail(chalk.red(`Failed: ${error instanceof Error ? error.message : error}`));
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
      spinner.fail(chalk.red(`Failed: ${error instanceof Error ? error.message : error}`));
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
      spinner.fail(chalk.red(`Failed: ${error instanceof Error ? error.message : error}`));
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
      spinner.fail(chalk.red(`Failed: ${error instanceof Error ? error.message : error}`));
      process.exit(1);
    }
  });

// ============================================================================
// Paper Trading Commands (modularized)
// ============================================================================
registerPaperTradingCommands(program);

// ============================================================================
// Notification Commands
// ============================================================================

const NOTIFICATIONS_DIR = path.join(os.homedir(), ".donut");
const NOTIFICATIONS_FILE = path.join(NOTIFICATIONS_DIR, "notifications.json");

interface NotificationsConfig {
  telegram?: {
    botToken: string;
    chatId: string;
    enabled: boolean;
  };
  discord?: {
    webhookUrl: string;
    enabled: boolean;
  };
  webhook?: {
    url: string;
    enabled: boolean;
  };
}

async function loadNotificationsConfig(): Promise<NotificationsConfig> {
  try {
    const data = await fs.readFile(NOTIFICATIONS_FILE, "utf-8");
    return JSON.parse(data) as NotificationsConfig;
  } catch {
    return {};
  }
}

async function saveNotificationsConfig(config: NotificationsConfig): Promise<void> {
  await fs.mkdir(NOTIFICATIONS_DIR, { recursive: true });
  await fs.writeFile(NOTIFICATIONS_FILE, JSON.stringify(config, null, 2));
}

const notify = program.command("notify").description("Notification configuration and testing");

notify
  .command("setup")
  .description("Set up a notification channel")
  .argument("<channel>", "Notification channel (telegram, discord, webhook)")
  .option("-t, --token <token>", "Bot token (for Telegram)")
  .option("-c, --chat <chatId>", "Chat ID (for Telegram)")
  .option("-w, --webhook <url>", "Webhook URL (for Discord or custom webhook)")
  .action(async (channel: string, options) => {
    const spinner = ora(`Setting up ${channel} notifications...`).start();

    try {
      const config = await loadNotificationsConfig();

      if (channel === "telegram") {
        if (!options.token || !options.chat) {
          spinner.fail("Telegram requires --token and --chat options");
          console.log(chalk.gray("\nExample:"));
          console.log(chalk.gray("  donut notify setup telegram --token YOUR_BOT_TOKEN --chat YOUR_CHAT_ID"));
          console.log(chalk.gray("\nTo get these values:"));
          console.log(chalk.gray("  1. Create a bot via @BotFather on Telegram"));
          console.log(chalk.gray("  2. Get your chat ID by messaging @userinfobot"));
          return;
        }

        // Validate credentials by sending test message
        const telegramConfig: TelegramClientConfig = {
          botToken: options.token,
          chatId: options.chat,
        };

        spinner.text = "Validating Telegram credentials...";
        const validation = await validateCredentials(telegramConfig);

        if (!validation.valid) {
          spinner.fail(`Telegram validation failed: ${validation.error}`);
          return;
        }

        config.telegram = {
          botToken: options.token,
          chatId: options.chat,
          enabled: true,
        };

        await saveNotificationsConfig(config);
        spinner.succeed("Telegram notifications configured successfully");
        console.log(chalk.green("✓ Test message sent to your Telegram chat"));

      } else if (channel === "discord") {
        if (!options.webhook) {
          spinner.fail("Discord requires --webhook option");
          console.log(chalk.gray("\nExample:"));
          console.log(chalk.gray("  donut notify setup discord --webhook https://discord.com/api/webhooks/..."));
          return;
        }

        config.discord = {
          webhookUrl: options.webhook,
          enabled: true,
        };

        await saveNotificationsConfig(config);
        spinner.succeed("Discord webhook configured");
        console.log(chalk.yellow("⚠ Discord notification sending not yet implemented"));

      } else if (channel === "webhook") {
        if (!options.webhook) {
          spinner.fail("Webhook requires --webhook option");
          return;
        }

        config.webhook = {
          url: options.webhook,
          enabled: true,
        };

        await saveNotificationsConfig(config);
        spinner.succeed("Custom webhook configured");

      } else {
        spinner.fail(`Unknown channel: ${channel}`);
        console.log(chalk.gray("Available channels: telegram, discord, webhook"));
      }
    } catch (error) {
      spinner.fail(chalk.red(`Failed: ${error instanceof Error ? error.message : error}`));
      process.exit(1);
    }
  });

notify
  .command("test")
  .description("Send a test notification to all configured channels")
  .action(async () => {
    const spinner = ora("Sending test notifications...").start();

    try {
      const config = await loadNotificationsConfig();
      const results: Array<{ channel: string; success: boolean; error?: string }> = [];

      // Test Telegram
      if (config.telegram?.enabled) {
        spinner.text = "Sending test to Telegram...";
        const telegramConfig: TelegramClientConfig = {
          botToken: config.telegram.botToken,
          chatId: config.telegram.chatId,
        };

        const result = await sendMessage(
          telegramConfig,
          "🧪 <b>Test Notification</b>\n\nThis is a test message from Donut CLI."
        );

        results.push({
          channel: "telegram",
          success: result.success,
          error: result.error,
        });
      }

      // Test Discord (placeholder)
      if (config.discord?.enabled) {
        results.push({
          channel: "discord",
          success: false,
          error: "Discord sending not yet implemented",
        });
      }

      // Test Webhook (placeholder)
      if (config.webhook?.enabled) {
        results.push({
          channel: "webhook",
          success: false,
          error: "Webhook sending not yet implemented",
        });
      }

      if (results.length === 0) {
        spinner.fail("No notification channels configured");
        console.log(chalk.gray("\nSet up a channel with: donut notify setup telegram --token <token> --chat <chatId>"));
        return;
      }

      spinner.succeed("Test notifications sent");
      console.log(chalk.gray("─".repeat(50)));

      for (const result of results) {
        if (result.success) {
          console.log(`${chalk.green("✓")} ${result.channel}: ${chalk.green("sent successfully")}`);
        } else {
          console.log(`${chalk.red("✗")} ${result.channel}: ${chalk.red(result.error || "failed")}`);
        }
      }
    } catch (error) {
      spinner.fail(chalk.red(`Failed: ${error instanceof Error ? error.message : error}`));
      process.exit(1);
    }
  });

notify
  .command("status")
  .description("Show configured notification channels")
  .action(async () => {
    const spinner = ora("Loading notification config...").start();

    try {
      const config = await loadNotificationsConfig();
      spinner.succeed("Configuration loaded");

      console.log(chalk.bold("\nNotification Channels"));
      console.log(chalk.gray("─".repeat(50)));

      if (Object.keys(config).length === 0) {
        console.log(chalk.yellow("No notification channels configured"));
        console.log(chalk.gray("\nSet up a channel with:"));
        console.log(chalk.gray("  donut notify setup telegram --token <token> --chat <chatId>"));
        return;
      }

      if (config.telegram) {
        const status = config.telegram.enabled ? chalk.green("enabled") : chalk.yellow("disabled");
        console.log(`${chalk.cyan("Telegram")}:`);
        console.log(`  Status:   ${status}`);
        console.log(`  Chat ID:  ${chalk.gray(config.telegram.chatId)}`);
        console.log(`  Token:    ${chalk.gray(config.telegram.botToken.slice(0, 10) + "...")}`);
      }

      if (config.discord) {
        const status = config.discord.enabled ? chalk.green("enabled") : chalk.yellow("disabled");
        console.log(`${chalk.cyan("Discord")}:`);
        console.log(`  Status:   ${status}`);
        console.log(`  Webhook:  ${chalk.gray(config.discord.webhookUrl.slice(0, 40) + "...")}`);
      }

      if (config.webhook) {
        const status = config.webhook.enabled ? chalk.green("enabled") : chalk.yellow("disabled");
        console.log(`${chalk.cyan("Webhook")}:`);
        console.log(`  Status:   ${status}`);
        console.log(`  URL:      ${chalk.gray(config.webhook.url)}`);
      }

      console.log(chalk.gray("\n─".repeat(50)));
      console.log(chalk.gray("Config stored at: " + NOTIFICATIONS_FILE));
    } catch (error) {
      spinner.fail(chalk.red(`Failed: ${error instanceof Error ? error.message : error}`));
      process.exit(1);
    }
  });

// ============================================================================
// Demo Mode Commands
// ============================================================================

const demo = program.command("demo").description("Demo mode for learning the CLI without backends");

demo
  .command("tour", { isDefault: true })
  .description("Run an interactive demo tour")
  .action(async () => {
    console.log(DEMO_BANNER);

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    console.log(chalk.bold(`\n${DEMO_INDICATOR} Welcome to the Donut CLI Demo Tour!\n`));
    console.log(chalk.gray("This tour will show you the main features using simulated data.\n"));

    // Step 1: Show strategies
    console.log(chalk.yellow("─".repeat(60)));
    console.log(chalk.bold(`\n📋 Step 1: Available Strategies\n`));
    await sleep(500);

    const strategies = generateDemoStrategies();
    for (const strategy of strategies) {
      console.log(`  ${chalk.cyan(strategy.name)}`);
      console.log(`  ${chalk.gray(strategy.description?.slice(0, 60) + "...")}`);
      console.log();
    }

    // Step 2: Show backtest results
    console.log(chalk.yellow("─".repeat(60)));
    console.log(chalk.bold(`\n📊 Step 2: Sample Backtest Results\n`));
    await sleep(500);

    const metrics = generateDemoBacktestResults();
    console.log(`  Total Return:    ${chalk.green(metrics.totalReturnPct.toFixed(1) + "%")}`);
    console.log(`  Max Drawdown:    ${chalk.red("-" + metrics.maxDrawdownPct.toFixed(1) + "%")}`);
    console.log(`  Sharpe Ratio:    ${chalk.cyan(metrics.sharpeRatio.toFixed(2))}`);
    console.log(`  Win Rate:        ${chalk.white((metrics.winRate * 100).toFixed(0) + "%")}`);
    console.log(`  Total Trades:    ${chalk.white(metrics.trades.toString())}`);
    console.log(`  Profit Factor:   ${chalk.green(metrics.profitFactor.toFixed(2))}`);
    console.log();

    // Step 3: Show sample trades
    console.log(chalk.yellow("─".repeat(60)));
    console.log(chalk.bold(`\n💹 Step 3: Sample Trade History\n`));
    await sleep(500);

    const trades = generateDemoTrades(5);
    for (const trade of trades.slice(0, 6)) {
      const date = new Date(trade.timestamp).toLocaleString();
      const sideStr = trade.side === "long" ? chalk.green("LONG ") : chalk.red("SHORT");
      const actionStr = trade.action === "open" ? chalk.cyan("OPEN ") : chalk.yellow("CLOSE");
      const pnlStr = trade.realizedPnL !== undefined
        ? (trade.realizedPnL >= 0 ? chalk.green(`+$${trade.realizedPnL.toFixed(2)}`) : chalk.red(`$${trade.realizedPnL.toFixed(2)}`))
        : chalk.gray("--");

      console.log(`  ${chalk.gray(date.slice(0, 17))} ${actionStr} ${sideStr} ${trade.symbol.padEnd(10)} $${trade.price.toFixed(2).padStart(10)} PnL: ${pnlStr}`);
    }

    console.log(chalk.yellow("\n─".repeat(60)));
    console.log(chalk.bold(`\n✨ Demo Tour Complete!\n`));
    console.log(chalk.gray("Now try these commands to explore more:\n"));
    console.log(`  ${chalk.cyan("donut demo strategies")} - View all demo strategies`);
    console.log(`  ${chalk.cyan("donut demo backtest")} - See detailed backtest results`);
    console.log(`  ${chalk.cyan("donut demo trades")} - View more sample trades`);
    console.log(`  ${chalk.cyan("donut demo runs")} - List demo backtest runs`);
    console.log(chalk.gray("\nTo use real backends, run: donut start"));
  });

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
      console.log(`  ${chalk.gray("Coins:")} ${strategy.coinSource.staticCoins?.join(", ") || strategy.coinSource.sourceType}`);
      console.log(`  ${chalk.gray("Max Positions:")} ${strategy.riskControl.maxPositions}`);
      console.log(`  ${chalk.gray("BTC/ETH Leverage:")} ${strategy.riskControl.btcEthMaxLeverage}x`);
      console.log(`  ${chalk.gray("Min Confidence:")} ${strategy.riskControl.minConfidence}%`);
    }

    console.log(chalk.gray("\n─".repeat(70)));
    console.log(chalk.gray("\nThese are demo strategies. To create your own: donut strategy build"));
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
    console.log(`  Total Return:    ${chalk.green(metrics.totalReturnPct.toFixed(2) + "%")}`);
    console.log(`  Max Drawdown:    ${chalk.red("-" + metrics.maxDrawdownPct.toFixed(2) + "%")}`);
    console.log(`  Sharpe Ratio:    ${chalk.cyan(metrics.sharpeRatio.toFixed(2))}`);
    console.log(`  Profit Factor:   ${chalk.green(metrics.profitFactor.toFixed(2))}`);

    console.log(chalk.bold("\nTrade Statistics"));
    console.log(`  Total Trades:    ${metrics.trades}`);
    console.log(`  Win Rate:        ${(metrics.winRate * 100).toFixed(0)}%`);
    console.log(`  Avg Win:         ${chalk.green(metrics.avgWin.toFixed(2) + "%")}`);
    console.log(`  Avg Loss:        ${chalk.red(metrics.avgLoss.toFixed(2) + "%")}`);

    console.log(chalk.bold("\nSymbol Performance"));
    console.log(`  Best Symbol:     ${chalk.green(metrics.bestSymbol)}`);
    console.log(`  Worst Symbol:    ${chalk.red(metrics.worstSymbol)}`);
    console.log(`  Liquidated:      ${metrics.liquidated ? chalk.red("Yes") : chalk.green("No")}`);

    if (metrics.symbolStats) {
      console.log(chalk.bold("\nPer-Symbol Stats"));
      for (const [symbol, stats] of Object.entries(metrics.symbolStats)) {
        const pnlColor = stats.totalPnL >= 0 ? chalk.green : chalk.red;
        console.log(`  ${symbol.padEnd(10)} ${stats.trades} trades, ${(stats.winRate * 100).toFixed(0)}% win, ${pnlColor("$" + stats.totalPnL.toFixed(2))}`);
      }
    }

    console.log(chalk.gray("\n─".repeat(50)));
    console.log(chalk.gray("\nThis is demo data. To run a real backtest: donut backtest run"));
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
      const sideStr = trade.side === "long" ? chalk.green("LONG ") : chalk.red("SHORT");
      const actionStr = trade.action === "open" ? chalk.cyan("OPEN ") : chalk.yellow("CLOSE");
      const pnlStr = trade.realizedPnL !== undefined
        ? (trade.realizedPnL >= 0 ? chalk.green(`+$${trade.realizedPnL.toFixed(2)}`) : chalk.red(`$${trade.realizedPnL.toFixed(2)}`))
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
    console.log(chalk.gray(`\nShowing ${trades.length} demo trades. This is simulated data.`));
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
      const returnColor = run.metrics.totalReturnPct >= 0 ? chalk.green : chalk.red;
      const returnStr = (run.metrics.totalReturnPct >= 0 ? "+" : "") + run.metrics.totalReturnPct.toFixed(1) + "%";

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
    console.log(chalk.gray("\nThese are demo runs. To run a real backtest: donut backtest run"));
  });

// ============================================================================
// Interactive Mode
// ============================================================================

program
  .command("chat")
  .description("Start interactive chat mode")
  .action(async () => {
    console.log(BANNER);
    console.log(chalk.gray("Interactive mode coming soon..."));
    console.log(chalk.gray("For now, use individual commands like:"));
    console.log(`  ${chalk.cyan("donut strategy build")} "Build a momentum strategy for BTC"`);
    console.log(`  ${chalk.cyan("donut backtest run")} --symbols BTCUSDT,ETHUSDT`);
  });

// ============================================================================
// Parse and Execute
// ============================================================================

program.parse();
