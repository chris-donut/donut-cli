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
import {
  createPaperSession,
  getPaperSession,
  listPaperSessions,
  stopPaperSession,
} from "./modes/paper-trading.js";

// Load environment variables
dotenvConfig();

const BANNER = `
${chalk.hex("#FF6B35")("╔═══════════════════════════════════════════════════════════════╗")}
${chalk.hex("#FF6B35")("║")}                                                               ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("║")}   ${chalk.bold.white("🍩 Donut CLI")} - ${chalk.gray("Unified Trading Terminal")}                    ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("║")}                                                               ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("║")}   ${chalk.cyan("Strategy Building")} · ${chalk.green("Backtesting")} · ${chalk.yellow("AI Analysis")} · ${chalk.magenta("Execution")}   ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("║")}                                                               ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("╚═══════════════════════════════════════════════════════════════╝")}
`;

const program = new Command();

program
  .name("donut")
  .description("Unified trading terminal with Claude Agent SDK")
  .version("0.1.0");

// ============================================================================
// Session Commands
// ============================================================================

program
  .command("start")
  .description("Start a new trading session")
  .option("-g, --goal <goal>", "Your trading goal or strategy idea")
  .action(async (options) => {
    console.log(BANNER);

    const spinner = ora("Initializing...").start();

    try {
      const config = loadConfig();
      validateApiKeys(config);

      const sessionManager = new SessionManager(config.sessionDir);
      const sessionId = await sessionManager.createSession();

      spinner.succeed(`Session created: ${chalk.cyan(sessionId)}`);

      // Show backend status
      if (config.hummingbotUrl) {
        console.log(chalk.gray(`Backend: Hummingbot Dashboard (${config.hummingbotUrl})`));
      } else if (config.nofxApiUrl) {
        console.log(chalk.gray(`Backend: nofx (${config.nofxApiUrl})`));
      } else {
        console.log(chalk.yellow(`No backend configured - running in offline mode`));
        console.log(chalk.gray(`Set HUMMINGBOT_URL or NOFX_API_URL for full functionality`));
      }

      if (options.goal) {
        console.log(chalk.gray("\nStarting discovery with your goal...\n"));

        const agent = createStrategyBuilder({
          terminalConfig: config,
          sessionManager,
        });

        const result = await agent.discover(options.goal);

        if (result.success) {
          console.log(chalk.green("\n✓ Discovery complete"));
        } else {
          console.log(chalk.red(`\n✗ Discovery failed: ${result.error}`));
        }
      } else {
        console.log(chalk.gray("\nSession ready. Use commands to interact:\n"));
        console.log(`  ${chalk.cyan("donut strategy build")} - Build a new strategy`);
        console.log(`  ${chalk.cyan("donut backtest run")} - Run a backtest`);
        console.log(`  ${chalk.cyan("donut status")} - Check session status`);
      }
    } catch (error) {
      spinner.fail(chalk.red(`Failed: ${error instanceof Error ? error.message : error}`));
      process.exit(1);
    }
  });

program
  .command("resume <sessionId>")
  .description("Resume an existing session")
  .action(async (sessionId) => {
    const spinner = ora("Loading session...").start();

    try {
      const config = loadConfig();
      const sessionManager = new SessionManager(config.sessionDir);
      await sessionManager.loadSession(sessionId);

      const state = sessionManager.getState();
      spinner.succeed(`Session loaded: ${chalk.cyan(sessionId)}`);

      console.log(chalk.gray(`\nCurrent stage: ${chalk.yellow(state.currentStage)}`));
      console.log(chalk.gray(`Active strategy: ${state.activeStrategy?.name || "None"}`));
      console.log(chalk.gray(`Active backtest: ${state.activeBacktestRunId || "None"}`));
    } catch (error) {
      spinner.fail(chalk.red(`Failed: ${error instanceof Error ? error.message : error}`));
      process.exit(1);
    }
  });

program
  .command("status")
  .description("Show current session status")
  .option("-s, --session <id>", "Session ID (uses most recent if not specified)")
  .action(async (options) => {
    try {
      const config = loadConfig();
      const sessionManager = new SessionManager(config.sessionDir);

      // List sessions if no specific one requested
      const sessions = await sessionManager.listSessions();

      if (sessions.length === 0) {
        console.log(chalk.yellow("No sessions found. Start one with: donut start"));
        return;
      }

      const sessionId = options.session || sessions[sessions.length - 1];
      await sessionManager.loadSession(sessionId);

      const state = sessionManager.getState();

      console.log(chalk.bold("\nSession Status"));
      console.log(chalk.gray("─".repeat(40)));
      console.log(`Session ID:     ${chalk.cyan(state.sessionId)}`);
      console.log(`Current Stage:  ${chalk.yellow(state.currentStage)}`);
      console.log(`Created:        ${state.createdAt.toISOString()}`);
      console.log(`Updated:        ${state.updatedAt.toISOString()}`);

      if (state.activeStrategy) {
        console.log(chalk.bold("\nActive Strategy"));
        console.log(chalk.gray("─".repeat(40)));
        console.log(`Name:           ${chalk.green(state.activeStrategy.name)}`);
        console.log(`Description:    ${state.activeStrategy.description || "N/A"}`);
      }

      if (state.activeBacktestRunId) {
        console.log(chalk.bold("\nActive Backtest"));
        console.log(chalk.gray("─".repeat(40)));
        console.log(`Run ID:         ${chalk.magenta(state.activeBacktestRunId)}`);
      }

      if (state.pendingTrades.length > 0) {
        console.log(chalk.bold("\nPending Trades"));
        console.log(chalk.gray("─".repeat(40)));
        console.log(`Count:          ${chalk.red(state.pendingTrades.length)}`);
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : error}`));
      process.exit(1);
    }
  });

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
// Paper Trading Commands
// ============================================================================

const paper = program.command("paper").description("Paper trading simulation");

paper
  .command("start")
  .description("Start a new paper trading session")
  .requiredOption("-s, --strategy <name>", "Strategy name or ID")
  .option("-b, --balance <amount>", "Initial balance in USD", "10000")
  .action(async (options) => {
    const spinner = ora("Creating paper trading session...").start();

    try {
      const initialBalance = parseFloat(options.balance);
      if (isNaN(initialBalance) || initialBalance <= 0) {
        throw new Error("Invalid balance amount");
      }

      const session = await createPaperSession(options.strategy, initialBalance);

      spinner.succeed(`Paper trading session created`);
      console.log(chalk.gray("─".repeat(50)));
      console.log(`Session ID:   ${chalk.cyan(session.id)}`);
      console.log(`Strategy:     ${chalk.yellow(session.strategyId)}`);
      console.log(`Balance:      ${chalk.green("$" + session.balance.toLocaleString())}`);
      console.log(`Status:       ${chalk.green(session.status)}`);
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

        console.log(
          `${chalk.gray(date)} ${sideStr} ${chalk.white(trade.symbol.padEnd(10))} ` +
          `${chalk.gray("qty:")} ${trade.size.toFixed(4).padStart(10)} ` +
          `${chalk.gray("@")} $${trade.entryPrice.toFixed(2).padStart(10)} ` +
          `${chalk.gray("PnL:")} ${pnlStr}`
        );
      }
    } catch (error) {
      spinner.fail(chalk.red(`Failed: ${error instanceof Error ? error.message : error}`));
      process.exit(1);
    }
  });

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
