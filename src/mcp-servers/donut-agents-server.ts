/**
 * Donut Agents MCP Server - Exposes AI trading agent tools to Claude Agent SDK
 *
 * Wraps the DonutAgentsClient HTTP client as MCP tools for:
 * - Trader lifecycle management (create, start, stop, pause)
 * - Position and trade tracking
 * - AI decision logs and analytics
 * - Arena rankings
 */

import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import {
  DonutAgentsClient,
  DonutAgentsClientConfig,
  CreateTraderRequest,
  UpdateTraderRequest,
  TraderAction,
} from "../integrations/donut-agents-client.js";

// Global client instance
let agentsClient: DonutAgentsClient | null = null;

/**
 * Initialize the Donut Agents client
 */
export function initializeDonutAgentsClient(config: DonutAgentsClientConfig): void {
  agentsClient = new DonutAgentsClient(config);
}

/**
 * Get the client, throwing if not initialized
 */
function getClient(): DonutAgentsClient {
  if (!agentsClient) {
    throw new Error("Donut Agents client not initialized. Call initializeDonutAgentsClient first.");
  }
  return agentsClient;
}

// ============================================================================
// Trader Management Tools
// ============================================================================

/**
 * List all AI trading agents
 */
export const agentsListTradersTool = tool(
  "agents_list_traders",
  "List all AI trading agents with their status, performance, and configuration.",
  {
    limit: z.number().int().positive().default(20).describe("Maximum number of traders to return"),
    offset: z.number().int().min(0).default(0).describe("Number of traders to skip"),
  },
  async (args) => {
    const client = getClient();
    const traders = await client.listTraders({ limit: args.limit, offset: args.offset });

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          count: traders.length,
          traders: traders.map((t) => ({
            id: t.id,
            name: t.name,
            status: t.status,
            strategy: t.strategy,
            totalPnl: t.totalPnl,
            winRate: t.winRate,
            totalTrades: t.totalTrades,
          })),
        }, null, 2),
      }],
    };
  }
);

/**
 * Get details of a specific trader
 */
export const agentsGetTraderTool = tool(
  "agents_get_trader",
  "Get detailed information about a specific AI trading agent.",
  {
    traderId: z.string().describe("The trader ID to retrieve"),
  },
  async (args) => {
    const client = getClient();
    const trader = await client.getTrader(args.traderId);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(trader, null, 2),
      }],
    };
  }
);

/**
 * Create a new AI trading agent
 */
export const agentsCreateTraderTool = tool(
  "agents_create_trader",
  "Create a new AI trading agent with the specified configuration.",
  {
    name: z.string().describe("Name for the trading agent"),
    strategy: z.string().describe("Trading strategy description or prompt"),
    maxPositionSize: z.number().positive().describe("Maximum position size in USD"),
    riskTolerance: z.number().min(0).max(1).default(0.5).describe("Risk tolerance (0=conservative, 1=aggressive)"),
    tradingPairs: z.array(z.string()).describe("Trading pairs to monitor (e.g., ['SOL/USDC', 'ETH/USDC'])"),
    autoExecute: z.boolean().default(false).describe("Whether to auto-execute trades without approval"),
    customPrompt: z.string().optional().describe("Custom LLM prompt for decision making"),
  },
  async (args) => {
    const client = getClient();
    const request: CreateTraderRequest = {
      name: args.name,
      strategy: args.strategy,
      maxPositionSize: args.maxPositionSize,
      riskTolerance: args.riskTolerance,
      tradingPairs: args.tradingPairs,
      autoExecute: args.autoExecute,
      customPrompt: args.customPrompt,
    };

    const trader = await client.createTrader(request);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          message: `Trader "${trader.name}" created with ID: ${trader.id}`,
          trader,
        }, null, 2),
      }],
    };
  }
);

/**
 * Control a trader (start, stop, pause, resume)
 */
export const agentsControlTraderTool = tool(
  "agents_control_trader",
  "Control an AI trading agent - start, stop, pause, or resume trading.",
  {
    traderId: z.string().describe("The trader ID to control"),
    action: z.enum(["start", "pause", "stop", "resume"]).describe("Action to perform"),
  },
  async (args) => {
    const client = getClient();
    const trader = await client.controlTrader(args.traderId, args.action as TraderAction);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          message: `Trader ${trader.name} ${args.action}ed`,
          status: trader.status,
        }, null, 2),
      }],
    };
  }
);

/**
 * Update trader configuration
 */
export const agentsUpdateTraderTool = tool(
  "agents_update_trader",
  "Update an AI trading agent's configuration.",
  {
    traderId: z.string().describe("The trader ID to update"),
    name: z.string().optional().describe("New name for the trader"),
    strategy: z.string().optional().describe("New trading strategy"),
    maxPositionSize: z.number().positive().optional().describe("New maximum position size"),
    riskTolerance: z.number().min(0).max(1).optional().describe("New risk tolerance"),
    autoExecute: z.boolean().optional().describe("Whether to auto-execute trades"),
  },
  async (args) => {
    const client = getClient();
    const updates: UpdateTraderRequest = {};

    if (args.name) updates.name = args.name;
    if (args.strategy) updates.strategy = args.strategy;
    if (args.maxPositionSize) updates.maxPositionSize = args.maxPositionSize;
    if (args.riskTolerance !== undefined) updates.riskTolerance = args.riskTolerance;
    if (args.autoExecute !== undefined) updates.autoExecute = args.autoExecute;

    const trader = await client.updateTrader(args.traderId, updates);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          message: `Trader ${trader.name} updated`,
          trader,
        }, null, 2),
      }],
    };
  }
);

// ============================================================================
// Position Tools
// ============================================================================

/**
 * Get positions for a trader
 */
export const agentsGetPositionsTool = tool(
  "agents_get_positions",
  "Get all open positions for an AI trading agent.",
  {
    traderId: z.string().describe("The trader ID"),
  },
  async (args) => {
    const client = getClient();
    const positions = await client.getPositions(args.traderId);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          count: positions.length,
          positions,
        }, null, 2),
      }],
    };
  }
);

/**
 * Close a position
 */
export const agentsClosePositionTool = tool(
  "agents_close_position",
  "Close a specific position for an AI trading agent.",
  {
    traderId: z.string().describe("The trader ID"),
    positionId: z.string().describe("The position ID to close"),
  },
  async (args) => {
    const client = getClient();
    const trade = await client.closePosition(args.traderId, args.positionId);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          message: `Position ${args.positionId} closed`,
          trade,
        }, null, 2),
      }],
    };
  }
);

// ============================================================================
// Trade History Tools
// ============================================================================

/**
 * Get trade history
 */
export const agentsGetTradesTool = tool(
  "agents_get_trades",
  "Get trade history for an AI trading agent.",
  {
    traderId: z.string().describe("The trader ID"),
    limit: z.number().int().positive().default(20).describe("Maximum trades to return"),
    symbol: z.string().optional().describe("Filter by trading symbol"),
    side: z.enum(["long", "short"]).optional().describe("Filter by trade side"),
  },
  async (args) => {
    const client = getClient();
    const trades = await client.getTrades(args.traderId, {
      limit: args.limit,
      symbol: args.symbol,
      side: args.side,
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

// ============================================================================
// Decision Log Tools
// ============================================================================

/**
 * Get AI decision history
 */
export const agentsGetDecisionsTool = tool(
  "agents_get_decisions",
  "Get AI decision history showing trading decisions and reasoning.",
  {
    traderId: z.string().describe("The trader ID"),
    limit: z.number().int().positive().default(10).describe("Maximum decisions to return"),
    executed: z.boolean().optional().describe("Filter by whether decision was executed"),
  },
  async (args) => {
    const client = getClient();
    const decisions = await client.getDecisions(args.traderId, {
      limit: args.limit,
      executed: args.executed,
    });

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          count: decisions.length,
          decisions: decisions.map((d) => ({
            id: d.id,
            timestamp: d.timestamp,
            action: d.action,
            symbol: d.symbol,
            confidence: d.confidence,
            reasoning: d.reasoning,
            executed: d.executed,
          })),
        }, null, 2),
      }],
    };
  }
);

// ============================================================================
// Analytics Tools
// ============================================================================

/**
 * Get trader performance analytics
 */
export const agentsGetAnalyticsTool = tool(
  "agents_get_analytics",
  "Get detailed performance analytics for an AI trading agent.",
  {
    traderId: z.string().describe("The trader ID"),
    period: z.enum(["24h", "7d", "30d", "all"]).default("7d").describe("Analysis period"),
  },
  async (args) => {
    const client = getClient();
    const analytics = await client.getAnalytics(args.traderId, args.period);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(analytics, null, 2),
      }],
    };
  }
);

// ============================================================================
// Arena Rankings Tools
// ============================================================================

/**
 * Get arena rankings
 */
export const agentsGetRankingsTool = tool(
  "agents_get_rankings",
  "Get arena rankings (leaderboard) for AI trading agents.",
  {
    limit: z.number().int().positive().default(20).describe("Number of rankings to return"),
    period: z.enum(["24h", "7d", "30d", "all"]).default("7d").describe("Ranking period"),
  },
  async (args) => {
    const client = getClient();
    const rankings = await client.getArenaRankings({
      limit: args.limit,
      period: args.period,
    });

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          count: rankings.length,
          rankings,
        }, null, 2),
      }],
    };
  }
);

// ============================================================================
// MCP Server Creation
// ============================================================================

/**
 * Create the Donut Agents MCP server instance
 */
export function createDonutAgentsMcpServer(clientConfig: DonutAgentsClientConfig) {
  // Initialize the client
  initializeDonutAgentsClient(clientConfig);

  // Create and return the MCP server
  return createSdkMcpServer({
    name: "donut-agents",
    version: "0.1.0",
    tools: [
      // Trader management
      agentsListTradersTool,
      agentsGetTraderTool,
      agentsCreateTraderTool,
      agentsControlTraderTool,
      agentsUpdateTraderTool,
      // Positions
      agentsGetPositionsTool,
      agentsClosePositionTool,
      // Trades
      agentsGetTradesTool,
      // Decisions
      agentsGetDecisionsTool,
      // Analytics
      agentsGetAnalyticsTool,
      // Rankings
      agentsGetRankingsTool,
    ],
  });
}

/**
 * All Donut Agents tools
 */
export const DONUT_AGENTS_TOOLS = [
  "agents_list_traders",
  "agents_get_trader",
  "agents_create_trader",
  "agents_control_trader",
  "agents_update_trader",
  "agents_get_positions",
  "agents_close_position",
  "agents_get_trades",
  "agents_get_decisions",
  "agents_get_analytics",
  "agents_get_rankings",
] as const;

/**
 * Read-only Donut Agents tools
 */
export const DONUT_AGENTS_READ_TOOLS = [
  "agents_list_traders",
  "agents_get_trader",
  "agents_get_positions",
  "agents_get_trades",
  "agents_get_decisions",
  "agents_get_analytics",
  "agents_get_rankings",
] as const;

/**
 * Write Donut Agents tools (can modify state)
 */
export const DONUT_AGENTS_WRITE_TOOLS = [
  "agents_create_trader",
  "agents_control_trader",
  "agents_update_trader",
  "agents_close_position",
] as const;
