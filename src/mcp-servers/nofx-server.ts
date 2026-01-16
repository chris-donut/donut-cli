/**
 * nofx MCP Server - Exposes backtesting tools to Claude Agent SDK
 * Wraps the NofxClient HTTP client as MCP tools
 */

import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { NofxClient, NofxClientConfig } from "../integrations/nofx-client.js";
import {
  TimeframeSchema,
  SymbolSchema,
  SideSchema,
} from "../core/types.js";

// Global client instance (initialized when server is created)
let nofxClient: NofxClient | null = null;

/**
 * Initialize the nofx client
 */
export function initializeNofxClient(config: NofxClientConfig): void {
  nofxClient = new NofxClient(config);
}

/**
 * Get the nofx client, throwing if not initialized
 */
function getClient(): NofxClient {
  if (!nofxClient) {
    throw new Error("nofx client not initialized. Call initializeNofxClient first.");
  }
  return nofxClient;
}

// ============================================================================
// Tool Definitions
// ============================================================================

/**
 * Start a new backtest run
 */
export const backtestStartTool = tool(
  "backtest_start",
  "Start a new backtest run with the specified configuration. Returns the run status including run_id.",
  {
    symbols: z.array(SymbolSchema).min(1).describe("Trading symbols to backtest (e.g., ['BTCUSDT', 'ETHUSDT'])"),
    timeframes: z.array(TimeframeSchema).default(["3m", "15m", "4h"]).describe("Timeframes for analysis"),
    decisionTimeframe: TimeframeSchema.default("15m").describe("Primary timeframe for trading decisions"),
    decisionCadenceNBars: z.number().int().positive().default(20).describe("Number of bars between decisions"),
    startTs: z.number().int().positive().describe("Backtest start timestamp (Unix seconds)"),
    endTs: z.number().int().positive().describe("Backtest end timestamp (Unix seconds)"),
    initialBalance: z.number().positive().default(10000).describe("Starting balance in USD"),
    feeBps: z.number().min(0).max(100).default(4).describe("Trading fee in basis points"),
    slippageBps: z.number().min(0).max(100).default(5).describe("Slippage in basis points"),
    customPrompt: z.string().optional().describe("Custom strategy prompt for AI decision-making"),
    btcEthLeverage: z.number().int().min(1).max(125).default(10).describe("Max leverage for BTC/ETH"),
    altcoinLeverage: z.number().int().min(1).max(125).default(5).describe("Max leverage for altcoins"),
  },
  async (args) => {
    const client = getClient();

    const config = {
      symbols: args.symbols,
      timeframes: args.timeframes,
      decisionTimeframe: args.decisionTimeframe,
      decisionCadenceNBars: args.decisionCadenceNBars,
      startTs: args.startTs,
      endTs: args.endTs,
      initialBalance: args.initialBalance,
      feeBps: args.feeBps,
      slippageBps: args.slippageBps,
      customPrompt: args.customPrompt,
      leverage: {
        btcEthLeverage: args.btcEthLeverage,
        altcoinLeverage: args.altcoinLeverage,
      },
      cacheAi: true,
      replayOnly: false,
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
 * Get backtest run status
 */
export const backtestStatusTool = tool(
  "backtest_status",
  "Get the current status and progress of a backtest run.",
  {
    runId: z.string().describe("The backtest run ID"),
  },
  async (args) => {
    const client = getClient();
    const status = await client.getStatus(args.runId);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(status, null, 2),
      }],
    };
  }
);

/**
 * Pause a running backtest
 */
export const backtestPauseTool = tool(
  "backtest_pause",
  "Pause a running backtest. Can be resumed later.",
  {
    runId: z.string().describe("The backtest run ID to pause"),
  },
  async (args) => {
    const client = getClient();
    const status = await client.pauseBacktest(args.runId);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          message: `Backtest ${args.runId} paused`,
          status,
        }, null, 2),
      }],
    };
  }
);

/**
 * Resume a paused backtest
 */
export const backtestResumeTool = tool(
  "backtest_resume",
  "Resume a paused backtest.",
  {
    runId: z.string().describe("The backtest run ID to resume"),
  },
  async (args) => {
    const client = getClient();
    const status = await client.resumeBacktest(args.runId);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          message: `Backtest ${args.runId} resumed`,
          status,
        }, null, 2),
      }],
    };
  }
);

/**
 * Stop a running backtest
 */
export const backtestStopTool = tool(
  "backtest_stop",
  "Stop a running backtest. Cannot be resumed after stopping.",
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
 * Get backtest performance metrics
 */
export const backtestGetMetricsTool = tool(
  "backtest_get_metrics",
  "Get performance metrics for a completed or running backtest including Sharpe ratio, win rate, drawdown, etc.",
  {
    runId: z.string().describe("The backtest run ID"),
  },
  async (args) => {
    const client = getClient();
    const metrics = await client.getMetrics(args.runId);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(metrics, null, 2),
      }],
    };
  }
);

/**
 * Get equity curve data
 */
export const backtestGetEquityTool = tool(
  "backtest_get_equity",
  "Get the equity curve data points showing account value over time.",
  {
    runId: z.string().describe("The backtest run ID"),
    limit: z.number().int().positive().optional().describe("Maximum number of data points to return"),
    offset: z.number().int().min(0).optional().describe("Number of data points to skip"),
  },
  async (args) => {
    const client = getClient();
    const equityPoints = await client.getEquityCurve(args.runId, args.limit, args.offset);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          count: equityPoints.length,
          points: equityPoints,
        }, null, 2),
      }],
    };
  }
);

/**
 * Get trade history
 */
export const backtestGetTradesTool = tool(
  "backtest_get_trades",
  "Get the history of all trades executed during the backtest.",
  {
    runId: z.string().describe("The backtest run ID"),
    symbol: z.string().optional().describe("Filter by specific symbol"),
    side: SideSchema.optional().describe("Filter by trade side (long/short)"),
    limit: z.number().int().positive().optional().describe("Maximum number of trades to return"),
  },
  async (args) => {
    const client = getClient();
    const trades = await client.getTrades(args.runId, {
      symbol: args.symbol,
      side: args.side,
      limit: args.limit,
    });

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
 * Get AI decision history
 */
export const backtestGetDecisionsTool = tool(
  "backtest_get_decisions",
  "Get the AI decision history showing what trades were considered and why.",
  {
    runId: z.string().describe("The backtest run ID"),
    cycle: z.number().int().positive().optional().describe("Filter by specific decision cycle"),
    limit: z.number().int().positive().optional().describe("Maximum number of decisions to return"),
  },
  async (args) => {
    const client = getClient();
    const decisions = await client.getDecisions(args.runId, {
      cycle: args.cycle,
      limit: args.limit,
    });

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          count: decisions.length,
          decisions,
        }, null, 2),
      }],
    };
  }
);

/**
 * List all backtest runs
 */
export const backtestListRunsTool = tool(
  "backtest_list_runs",
  "List all backtest runs with optional filtering by state.",
  {
    state: z.enum(["created", "running", "paused", "completed", "failed", "stopped", "liquidated"]).optional()
      .describe("Filter by backtest state"),
    limit: z.number().int().positive().default(20).describe("Maximum number of runs to return"),
  },
  async (args) => {
    const client = getClient();
    const runs = await client.listRuns({
      state: args.state,
      limit: args.limit,
    });

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
// MCP Server Creation
// ============================================================================

/**
 * Create the nofx MCP server instance
 */
export function createNofxMcpServer(clientConfig: NofxClientConfig) {
  // Initialize the client
  initializeNofxClient(clientConfig);

  // Create and return the MCP server
  return createSdkMcpServer({
    name: "nofx-backtest",
    version: "0.1.0",
    tools: [
      backtestStartTool,
      backtestStatusTool,
      backtestPauseTool,
      backtestResumeTool,
      backtestStopTool,
      backtestGetMetricsTool,
      backtestGetEquityTool,
      backtestGetTradesTool,
      backtestGetDecisionsTool,
      backtestListRunsTool,
    ],
  });
}

/**
 * Get all backtest tool names for filtering
 */
export const BACKTEST_TOOLS = [
  "backtest_start",
  "backtest_status",
  "backtest_pause",
  "backtest_resume",
  "backtest_stop",
  "backtest_get_metrics",
  "backtest_get_equity",
  "backtest_get_trades",
  "backtest_get_decisions",
  "backtest_list_runs",
] as const;

/**
 * Read-only backtest tools (safe to use in any stage)
 */
export const BACKTEST_READ_TOOLS = [
  "backtest_status",
  "backtest_get_metrics",
  "backtest_get_equity",
  "backtest_get_trades",
  "backtest_get_decisions",
  "backtest_list_runs",
] as const;

/**
 * Write backtest tools (can modify state)
 */
export const BACKTEST_WRITE_TOOLS = [
  "backtest_start",
  "backtest_pause",
  "backtest_resume",
  "backtest_stop",
] as const;
