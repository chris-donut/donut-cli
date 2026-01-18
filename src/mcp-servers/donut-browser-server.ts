/**
 * Donut Browser MCP Server - Exchange execution tools
 *
 * Implements all donut_* tools for live trading via the Donut Browser service.
 * These tools enable wallet queries, position management, and trade execution.
 */

import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import {
  DonutBrowserClient,
  getDonutBrowserClient,
  isDonutBrowserConfigured,
} from "../integrations/donut-browser-client.js";
import { SideSchema, SymbolSchema, AgentType, WorkflowStage } from "../core/types.js";
import { getRiskManager } from "../hooks/risk-hook.js";

// ============================================================================
// Helper Functions
// ============================================================================

function getClient(): DonutBrowserClient {
  const client = getDonutBrowserClient();
  if (!client) {
    throw new Error(
      "Donut Browser not configured. Set DONUT_BROWSER_URL environment variable."
    );
  }
  return client;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

// ============================================================================
// Wallet Tools
// ============================================================================

/**
 * Get wallet overview
 */
export const donutGetWalletTool = tool(
  "donut_get_wallet",
  "Get wallet overview including total equity, available balance, margin usage, and unrealized P&L.",
  {},
  async () => {
    try {
      const client = getClient();
      const wallet = await client.getWallet();

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              wallet: {
                totalEquity: wallet.totalEquity,
                availableBalance: wallet.availableBalance,
                usedMargin: wallet.usedMargin,
                unrealizedPnl: wallet.unrealizedPnl,
                marginLevel: wallet.marginLevel,
                currency: wallet.currency,
              },
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: formatError(error),
            }),
          },
        ],
      };
    }
  }
);

/**
 * Get asset balances
 */
export const donutGetBalancesTool = tool(
  "donut_get_balances",
  "Get all asset balances showing free, locked, and total amounts.",
  {},
  async () => {
    try {
      const client = getClient();
      const balances = await client.getBalances();

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              balances: balances.map((b) => ({
                asset: b.asset,
                free: b.free,
                locked: b.locked,
                total: b.total,
              })),
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: formatError(error),
              balances: [],
            }),
          },
        ],
      };
    }
  }
);

// ============================================================================
// Position Tools
// ============================================================================

/**
 * Get all open positions
 */
export const donutGetPositionsTool = tool(
  "donut_get_positions",
  "Get all open positions with entry price, current price, P&L, leverage, and liquidation price.",
  {},
  async () => {
    try {
      const client = getClient();
      const positions = await client.getPositions();

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              positions: positions.map((p) => ({
                symbol: p.symbol,
                side: p.side,
                quantity: p.quantity,
                entryPrice: p.entryPrice,
                currentPrice: p.currentPrice,
                unrealizedPnl: p.unrealizedPnL,
                unrealizedPnlPct: p.unrealizedPnLPct,
                leverage: p.leverage,
                margin: p.margin,
                liquidationPrice: p.liquidationPrice,
              })),
              count: positions.length,
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: formatError(error),
              positions: [],
            }),
          },
        ],
      };
    }
  }
);

// ============================================================================
// Order Tools
// ============================================================================

/**
 * Preview a trade without execution
 */
export const donutPreviewTradeTool = tool(
  "donut_preview_trade",
  "Preview a trade to see estimated execution price, fees, margin required, and liquidation price without actually placing the order.",
  {
    symbol: SymbolSchema.describe("Trading symbol (e.g., BTCUSDT)"),
    side: SideSchema.describe("Trade side: long or short"),
    quantity: z.number().positive().describe("Quantity to trade"),
    leverage: z.number().int().min(1).max(125).describe("Leverage to use"),
    orderType: z.enum(["market", "limit"]).default("market").describe("Order type"),
    limitPrice: z.number().positive().optional().describe("Limit price (required for limit orders)"),
  },
  async (args) => {
    try {
      const client = getClient();
      const preview = await client.previewTrade({
        symbol: args.symbol,
        side: args.side,
        quantity: args.quantity,
        leverage: args.leverage,
        orderType: args.orderType,
        limitPrice: args.limitPrice,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              preview: {
                symbol: preview.symbol,
                side: preview.side,
                quantity: preview.quantity,
                estimatedPrice: preview.estimatedPrice,
                estimatedCost: preview.estimatedCost,
                estimatedFee: preview.estimatedFee,
                marginRequired: preview.margin,
                liquidationPrice: preview.liquidationPrice,
                leverage: preview.leverage,
                valid: preview.valid,
                warnings: preview.warnings,
              },
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: formatError(error),
            }),
          },
        ],
      };
    }
  }
);

/**
 * Execute a trade (HIGH RISK - requires approval)
 */
export const donutExecuteTradeTool = tool(
  "donut_execute_trade",
  "Execute a live trade. This is a HIGH-RISK operation that places a real order on the exchange. Use donut_preview_trade first to verify parameters.",
  {
    symbol: SymbolSchema.describe("Trading symbol (e.g., BTCUSDT)"),
    side: SideSchema.describe("Trade side: long or short"),
    quantity: z.number().positive().describe("Quantity to trade"),
    leverage: z.number().int().min(1).max(125).describe("Leverage to use"),
    orderType: z.enum(["market", "limit"]).default("market").describe("Order type"),
    limitPrice: z.number().positive().optional().describe("Limit price (required for limit orders)"),
    stopLoss: z.number().positive().optional().describe("Stop loss price"),
    takeProfit: z.number().positive().optional().describe("Take profit price"),
    confidence: z.number().int().min(0).max(100).describe("Confidence level for this trade (0-100)"),
    reasoning: z.string().describe("Reasoning for this trade"),
  },
  async (args) => {
    try {
      const client = getClient();
      const riskManager = getRiskManager();

      // Build execution context for risk check
      const context = {
        toolName: "donut_execute_trade",
        params: args as unknown as Record<string, unknown>,
        agentType: AgentType.EXECUTION_ASSISTANT,
        stage: WorkflowStage.EXECUTION,
        sessionId: "mcp-direct",
      };

      // Pre-execution risk check
      const riskResult = await riskManager.preToolUseHook(context);

      if (!riskResult.allowed) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: false,
                blocked: true,
                reason: riskResult.reason,
                warnings: riskResult.warnings,
              }),
            },
          ],
        };
      }

      // Generate unique client order ID
      const clientOrderId = `donut_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      const result = await client.executeTrade({
        symbol: args.symbol,
        side: args.side,
        quantity: args.quantity,
        leverage: args.leverage,
        orderType: args.orderType,
        limitPrice: args.limitPrice,
        stopLoss: args.stopLoss,
        takeProfit: args.takeProfit,
        clientOrderId,
      });

      // Post-execution risk tracking
      await riskManager.postToolUseHook(context, result);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: result.status === "filled" || result.status === "partial",
              trade: {
                orderId: result.orderId,
                clientOrderId: result.clientOrderId,
                symbol: result.symbol,
                side: result.side,
                quantity: result.quantity,
                executedPrice: result.executedPrice,
                fee: result.fee,
                status: result.status,
                timestamp: result.timestamp,
                stopLossOrderId: result.stopLossOrderId,
                takeProfitOrderId: result.takeProfitOrderId,
              },
              metadata: {
                confidence: args.confidence,
                reasoning: args.reasoning,
              },
              warnings: riskResult.warnings,
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: formatError(error),
            }),
          },
        ],
      };
    }
  }
);

/**
 * Modify an existing position
 */
export const donutModifyPositionTool = tool(
  "donut_modify_position",
  "Modify stop loss and/or take profit levels for an existing position. HIGH-RISK operation.",
  {
    symbol: SymbolSchema.describe("Symbol of the position to modify"),
    stopLoss: z.number().positive().optional().describe("New stop loss price"),
    takeProfit: z.number().positive().optional().describe("New take profit price"),
  },
  async (args) => {
    try {
      if (!args.stopLoss && !args.takeProfit) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: false,
                error: "Must specify at least one of stopLoss or takeProfit",
              }),
            },
          ],
        };
      }

      const client = getClient();
      const result = await client.modifyPosition(args.symbol, {
        action: "modify",
        stopLoss: args.stopLoss,
        takeProfit: args.takeProfit,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: result.success,
              symbol: result.symbol,
              stopLoss: result.stopLoss,
              takeProfit: result.takeProfit,
              message: result.message,
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: formatError(error),
            }),
          },
        ],
      };
    }
  }
);

/**
 * Close all positions (HIGH RISK)
 */
export const donutCloseAllPositionsTool = tool(
  "donut_close_all_positions",
  "Close all open positions immediately. This is a HIGH-RISK emergency operation.",
  {
    confirm: z.boolean().describe("Must be true to confirm closing all positions"),
  },
  async (args) => {
    if (!args.confirm) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: "Must set confirm=true to close all positions",
            }),
          },
        ],
      };
    }

    try {
      const client = getClient();
      const result = await client.closeAllPositions();

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              closedPositions: result.closedPositions,
              totalRealizedPnl: result.totalRealizedPnl,
              count: result.closedPositions.length,
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: formatError(error),
            }),
          },
        ],
      };
    }
  }
);

// ============================================================================
// Transaction Tools
// ============================================================================

/**
 * Get transaction status
 */
export const donutGetTxStatusTool = tool(
  "donut_get_tx_status",
  "Get the status of a transaction/order by its ID.",
  {
    orderId: z.string().describe("The order ID to check"),
  },
  async (args) => {
    try {
      const client = getClient();
      const status = await client.getTransactionStatus(args.orderId);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              transaction: {
                orderId: status.orderId,
                clientOrderId: status.clientOrderId,
                symbol: status.symbol,
                status: status.status,
                side: status.side,
                quantity: status.quantity,
                executedQuantity: status.executedQuantity,
                executedPrice: status.executedPrice,
                fee: status.fee,
                timestamp: status.timestamp,
                fillCount: status.fills.length,
              },
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: formatError(error),
            }),
          },
        ],
      };
    }
  }
);

// ============================================================================
// Market Data Tools
// ============================================================================

/**
 * Get current price
 */
export const donutGetPriceTool = tool(
  "donut_get_price",
  "Get current price, bid, and ask for a symbol.",
  {
    symbol: SymbolSchema.describe("Trading symbol (e.g., BTCUSDT)"),
  },
  async (args) => {
    try {
      const client = getClient();
      const price = await client.getCurrentPrice(args.symbol);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              price: {
                symbol: price.symbol,
                price: price.price,
                bid: price.bid,
                ask: price.ask,
                spread: price.ask - price.bid,
                timestamp: price.timestamp,
              },
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: formatError(error),
            }),
          },
        ],
      };
    }
  }
);

// ============================================================================
// MCP Server Creation
// ============================================================================

/**
 * Create the Donut Browser MCP server
 */
export async function createDonutBrowserMcpServer() {
  return createSdkMcpServer({
    name: "donut-browser",
    version: "0.1.0",
    tools: [
      // Wallet
      donutGetWalletTool,
      donutGetBalancesTool,
      // Positions
      donutGetPositionsTool,
      // Orders (including high-risk)
      donutPreviewTradeTool,
      donutExecuteTradeTool,
      donutModifyPositionTool,
      donutCloseAllPositionsTool,
      // Transactions
      donutGetTxStatusTool,
      // Market Data
      donutGetPriceTool,
    ],
  });
}

/**
 * All donut browser tool names
 */
export const DONUT_BROWSER_TOOLS = [
  "donut_get_wallet",
  "donut_get_balances",
  "donut_get_positions",
  "donut_preview_trade",
  "donut_execute_trade",
  "donut_modify_position",
  "donut_close_all_positions",
  "donut_get_tx_status",
  "donut_get_price",
] as const;

/**
 * Read-only donut browser tools
 */
export const DONUT_READ_TOOLS = [
  "donut_get_wallet",
  "donut_get_balances",
  "donut_get_positions",
  "donut_preview_trade",
  "donut_get_tx_status",
  "donut_get_price",
] as const;

/**
 * High-risk donut browser tools (require approval)
 */
export const DONUT_HIGH_RISK_TOOLS = [
  "donut_execute_trade",
  "donut_modify_position",
  "donut_close_all_positions",
] as const;

/**
 * Check if Donut Browser is available
 */
export function isDonutBrowserAvailable(): boolean {
  return isDonutBrowserConfigured();
}
