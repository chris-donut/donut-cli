/**
 * Hummingbot MCP Server - Exposes Hummingbot Dashboard tools to Claude Agent SDK
 * Wraps the HummingbotClient HTTP client as MCP tools
 */

import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { HummingbotClient, HummingbotClientConfig } from "../integrations/hummingbot-client.js";
import { TimeframeSchema } from "../core/types.js";

// Global client instance (initialized when server is created)
let hummingbotClient: HummingbotClient | null = null;

/**
 * Initialize the Hummingbot client
 */
export function initializeHummingbotClient(config: HummingbotClientConfig): void {
  hummingbotClient = new HummingbotClient(config);
}

/**
 * Get the Hummingbot client, throwing if not initialized
 */
function getClient(): HummingbotClient {
  if (!hummingbotClient) {
    throw new Error("Hummingbot client not initialized. Call initializeHummingbotClient first.");
  }
  return hummingbotClient;
}

// ============================================================================
// Backtest Tools
// ============================================================================

/**
 * Start a new backtest run
 */
export const hbBacktestStartTool = tool(
  "hb_backtest_start",
  "Start a new backtest run on Hummingbot with the specified configuration.",
  {
    tradingPair: z.string().describe("Trading pair (e.g., 'BTC-USDT', 'ETH-USDT')"),
    startTs: z.number().int().positive().describe("Backtest start timestamp (Unix seconds)"),
    endTs: z.number().int().positive().describe("Backtest end timestamp (Unix seconds)"),
    initialBalance: z.number().positive().default(10000).describe("Starting balance in USD"),
    leverage: z.number().int().min(1).max(125).default(10).describe("Max leverage to use"),
    timeframes: z.array(TimeframeSchema).default(["1m", "5m", "15m"]).describe("Timeframes for analysis"),
  },
  async (args) => {
    const client = getClient();

    const config = {
      symbols: [args.tradingPair],
      startTs: args.startTs,
      endTs: args.endTs,
      initialBalance: args.initialBalance,
      leverage: { btcEthLeverage: args.leverage, altcoinLeverage: args.leverage },
      timeframes: args.timeframes,
    };

    const status = await client.startBacktest(config);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          message: `Backtest started with run_id: ${status.runId}`,
          status,
        }, null, 2),
      }],
    };
  }
);

/**
 * Get backtest status
 */
export const hbBacktestStatusTool = tool(
  "hb_backtest_status",
  "Get the current status and progress of a Hummingbot backtest run.",
  {
    runId: z.string().describe("The backtest run ID"),
  },
  async (args) => {
    const client = getClient();
    const status = await client.getBacktestStatus(args.runId);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(status, null, 2),
      }],
    };
  }
);

/**
 * Stop a running backtest
 */
export const hbBacktestStopTool = tool(
  "hb_backtest_stop",
  "Stop a running Hummingbot backtest.",
  {
    runId: z.string().describe("The backtest run ID to stop"),
  },
  async (args) => {
    const client = getClient();
    const status = await client.stopBacktest(args.runId);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          message: `Backtest ${args.runId} stopped`,
          status,
        }, null, 2),
      }],
    };
  }
);

/**
 * Get backtest metrics
 */
export const hbBacktestMetricsTool = tool(
  "hb_backtest_metrics",
  "Get performance metrics for a Hummingbot backtest including Sharpe ratio, win rate, drawdown, etc.",
  {
    runId: z.string().describe("The backtest run ID"),
  },
  async (args) => {
    const client = getClient();
    const metrics = await client.getBacktestMetrics(args.runId);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(metrics, null, 2),
      }],
    };
  }
);

/**
 * Get equity curve
 */
export const hbBacktestEquityTool = tool(
  "hb_backtest_equity",
  "Get the equity curve data showing portfolio value over time.",
  {
    runId: z.string().describe("The backtest run ID"),
  },
  async (args) => {
    const client = getClient();
    const equity = await client.getEquityCurve(args.runId);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          count: equity.length,
          points: equity,
        }, null, 2),
      }],
    };
  }
);

/**
 * Get backtest trades
 */
export const hbBacktestTradesTool = tool(
  "hb_backtest_trades",
  "Get the trade history from a Hummingbot backtest.",
  {
    runId: z.string().describe("The backtest run ID"),
  },
  async (args) => {
    const client = getClient();
    const trades = await client.getBacktestTrades(args.runId);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          count: trades.length,
          trades,
        }, null, 2),
      }],
    };
  }
);

/**
 * List backtests
 */
export const hbBacktestListTool = tool(
  "hb_backtest_list",
  "List all Hummingbot backtest runs.",
  {
    limit: z.number().int().positive().default(20).describe("Maximum number of runs to return"),
  },
  async (args) => {
    const client = getClient();
    const runs = await client.listBacktests(args.limit);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          count: runs.length,
          runs,
        }, null, 2),
      }],
    };
  }
);

// ============================================================================
// Strategy Tools
// ============================================================================

/**
 * List strategies
 */
export const hbStrategyListTool = tool(
  "hb_strategy_list",
  "List all available trading strategies in Hummingbot.",
  {},
  async () => {
    const client = getClient();
    const strategies = await client.listStrategies();

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          count: strategies.length,
          strategies,
        }, null, 2),
      }],
    };
  }
);

/**
 * Get strategy details
 */
export const hbStrategyGetTool = tool(
  "hb_strategy_get",
  "Get details of a specific trading strategy.",
  {
    strategyId: z.string().describe("The strategy ID"),
  },
  async (args) => {
    const client = getClient();
    const strategy = await client.getStrategy(args.strategyId);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(strategy, null, 2),
      }],
    };
  }
);

/**
 * Create strategy
 */
export const hbStrategyCreateTool = tool(
  "hb_strategy_create",
  "Create a new trading strategy in Hummingbot.",
  {
    name: z.string().describe("Strategy name"),
    type: z.enum(["market_making", "directional", "dca", "grid"]).describe("Strategy type"),
    config: z.record(z.unknown()).describe("Strategy configuration parameters"),
  },
  async (args) => {
    const client = getClient();
    const strategy = await client.createStrategy({
      name: args.name,
      type: args.type,
      config: args.config,
    });

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          message: `Strategy created: ${strategy.name}`,
          strategy,
        }, null, 2),
      }],
    };
  }
);

// ============================================================================
// Bot Tools
// ============================================================================

/**
 * List bots
 */
export const hbBotListTool = tool(
  "hb_bot_list",
  "List all trading bots in Hummingbot.",
  {},
  async () => {
    const client = getClient();
    const bots = await client.listBots();

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          count: bots.length,
          bots,
        }, null, 2),
      }],
    };
  }
);

/**
 * Start bot
 */
export const hbBotStartTool = tool(
  "hb_bot_start",
  "Start a trading bot.",
  {
    botId: z.string().describe("The bot ID to start"),
  },
  async (args) => {
    const client = getClient();
    const bot = await client.startBot(args.botId);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          message: `Bot ${bot.name} started`,
          bot,
        }, null, 2),
      }],
    };
  }
);

/**
 * Stop bot
 */
export const hbBotStopTool = tool(
  "hb_bot_stop",
  "Stop a running trading bot.",
  {
    botId: z.string().describe("The bot ID to stop"),
  },
  async (args) => {
    const client = getClient();
    const bot = await client.stopBot(args.botId);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          message: `Bot ${bot.name} stopped`,
          bot,
        }, null, 2),
      }],
    };
  }
);

// ============================================================================
// Market Data Tools
// ============================================================================

/**
 * Get prices
 */
export const hbMarketPricesTool = tool(
  "hb_market_prices",
  "Get current market prices for trading pairs.",
  {
    pairs: z.array(z.string()).describe("List of trading pairs (e.g., ['BTC-USDT', 'ETH-USDT'])"),
  },
  async (args) => {
    const client = getClient();
    const prices = await client.getPrices(args.pairs);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(prices, null, 2),
      }],
    };
  }
);

/**
 * Get candles
 */
export const hbMarketCandlesTool = tool(
  "hb_market_candles",
  "Get historical candle data for a trading pair.",
  {
    pair: z.string().describe("Trading pair (e.g., 'BTC-USDT')"),
    interval: z.string().default("1m").describe("Candle interval (1m, 5m, 15m, 1h, 4h, 1d)"),
    limit: z.number().int().positive().default(100).describe("Number of candles to fetch"),
  },
  async (args) => {
    const client = getClient();
    const candles = await client.getCandles(args.pair, args.interval, args.limit);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          pair: args.pair,
          interval: args.interval,
          count: candles.length,
          candles,
        }, null, 2),
      }],
    };
  }
);

/**
 * Dashboard status
 */
export const hbStatusTool = tool(
  "hb_status",
  "Get Hummingbot Dashboard status including running bots and total PnL.",
  {},
  async () => {
    const client = getClient();
    const status = await client.getStatus();

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(status, null, 2),
      }],
    };
  }
);

// ============================================================================
// MCP Server Creation
// ============================================================================

/**
 * Create the Hummingbot MCP server instance
 */
export function createHummingbotMcpServer(clientConfig: HummingbotClientConfig) {
  // Initialize the client
  initializeHummingbotClient(clientConfig);

  // Create and return the MCP server
  return createSdkMcpServer({
    name: "hummingbot",
    version: "0.1.0",
    tools: [
      // Backtest tools
      hbBacktestStartTool,
      hbBacktestStatusTool,
      hbBacktestStopTool,
      hbBacktestMetricsTool,
      hbBacktestEquityTool,
      hbBacktestTradesTool,
      hbBacktestListTool,
      // Strategy tools
      hbStrategyListTool,
      hbStrategyGetTool,
      hbStrategyCreateTool,
      // Bot tools
      hbBotListTool,
      hbBotStartTool,
      hbBotStopTool,
      // Market data tools
      hbMarketPricesTool,
      hbMarketCandlesTool,
      hbStatusTool,
    ],
  });
}

/**
 * Get all Hummingbot backtest tool names
 */
export const HB_BACKTEST_TOOLS = [
  "hb_backtest_start",
  "hb_backtest_status",
  "hb_backtest_stop",
  "hb_backtest_metrics",
  "hb_backtest_equity",
  "hb_backtest_trades",
  "hb_backtest_list",
] as const;

/**
 * Read-only Hummingbot tools
 */
export const HB_READ_TOOLS = [
  "hb_backtest_status",
  "hb_backtest_metrics",
  "hb_backtest_equity",
  "hb_backtest_trades",
  "hb_backtest_list",
  "hb_strategy_list",
  "hb_strategy_get",
  "hb_bot_list",
  "hb_market_prices",
  "hb_market_candles",
  "hb_status",
] as const;

/**
 * Write Hummingbot tools
 */
export const HB_WRITE_TOOLS = [
  "hb_backtest_start",
  "hb_backtest_stop",
  "hb_strategy_create",
  "hb_bot_start",
  "hb_bot_stop",
] as const;
