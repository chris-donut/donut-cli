/**
 * Donut Backend MCP Server - Exposes Solana DeFi tools to Claude Agent SDK
 *
 * Wraps the DonutBackendClient HTTP client as MCP tools for:
 * - Portfolio management and token balances
 * - Jupiter DEX swaps and limit orders
 * - Token lookup and metadata
 * - Risk guardrails configuration
 */

import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import {
  DonutBackendClient,
  DonutBackendClientConfig,
} from "../integrations/donut-backend-client.js";

// Global client instance
let backendClient: DonutBackendClient | null = null;

/**
 * Initialize the Donut Backend client
 */
export function initializeDonutBackendClient(config: DonutBackendClientConfig): void {
  backendClient = new DonutBackendClient(config);
}

/**
 * Get the client, throwing if not initialized
 */
function getClient(): DonutBackendClient {
  if (!backendClient) {
    throw new Error("Donut Backend client not initialized. Call initializeDonutBackendClient first.");
  }
  return backendClient;
}

// ============================================================================
// Portfolio Tools
// ============================================================================

/**
 * Get portfolio overview
 */
export const solanaGetPortfolioTool = tool(
  "solana_get_portfolio",
  "Get the complete portfolio overview including all token balances and total value.",
  {
    walletAddress: z.string().optional().describe("Wallet address (uses connected wallet if not specified)"),
  },
  async (args) => {
    const client = getClient();
    const portfolio = await client.getPortfolio(args.walletAddress);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          walletAddress: portfolio.walletAddress,
          totalValueUsd: portfolio.totalValueUsd,
          solBalance: portfolio.solBalance,
          tokenCount: portfolio.tokens.length,
          tokens: portfolio.tokens.map((t) => ({
            symbol: t.symbol,
            amount: t.amount,
            usdValue: t.usdValue,
          })),
          lastUpdated: portfolio.lastUpdated,
        }, null, 2),
      }],
    };
  }
);

/**
 * Get SOL balance
 */
export const solanaGetSolBalanceTool = tool(
  "solana_get_sol_balance",
  "Get the SOL balance for a wallet.",
  {
    walletAddress: z.string().optional().describe("Wallet address (uses connected wallet if not specified)"),
  },
  async (args) => {
    const client = getClient();
    const balance = await client.getSolBalance(args.walletAddress);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          balance,
          symbol: "SOL",
        }, null, 2),
      }],
    };
  }
);

/**
 * Refresh portfolio data
 */
export const solanaRefreshPortfolioTool = tool(
  "solana_refresh_portfolio",
  "Force refresh portfolio data from the blockchain.",
  {
    walletAddress: z.string().optional().describe("Wallet address (uses connected wallet if not specified)"),
  },
  async (args) => {
    const client = getClient();
    const portfolio = await client.refreshPortfolio(args.walletAddress);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          message: "Portfolio refreshed",
          totalValueUsd: portfolio.totalValueUsd,
          tokenCount: portfolio.tokens.length,
        }, null, 2),
      }],
    };
  }
);

// ============================================================================
// Token Lookup Tools
// ============================================================================

/**
 * Get token information
 */
export const solanaGetTokenInfoTool = tool(
  "solana_get_token_info",
  "Get detailed information about a Solana token by its mint address.",
  {
    mint: z.string().describe("Token mint address"),
  },
  async (args) => {
    const client = getClient();
    const tokenInfo = await client.getTokenInfo(args.mint);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(tokenInfo, null, 2),
      }],
    };
  }
);

/**
 * Search for tokens
 */
export const solanaSearchTokensTool = tool(
  "solana_search_tokens",
  "Search for Solana tokens by symbol or name.",
  {
    query: z.string().describe("Search query (symbol or name)"),
    limit: z.number().int().positive().default(10).describe("Maximum results to return"),
  },
  async (args) => {
    const client = getClient();
    const tokens = await client.searchTokens(args.query, args.limit);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          count: tokens.length,
          tokens: tokens.map((t) => ({
            mint: t.mint,
            symbol: t.symbol,
            name: t.name,
            price: t.price,
            priceChange24h: t.priceChange24h,
          })),
        }, null, 2),
      }],
    };
  }
);

/**
 * Get trending tokens
 */
export const solanaGetTrendingTokensTool = tool(
  "solana_get_trending_tokens",
  "Get trending Solana tokens by volume and activity.",
  {
    limit: z.number().int().positive().default(20).describe("Maximum results to return"),
  },
  async (args) => {
    const client = getClient();
    const tokens = await client.getTrendingTokens(args.limit);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          count: tokens.length,
          tokens: tokens.map((t) => ({
            symbol: t.symbol,
            name: t.name,
            price: t.price,
            priceChange24h: t.priceChange24h,
            volume24h: t.volume24h,
          })),
        }, null, 2),
      }],
    };
  }
);

/**
 * Get token price
 */
export const solanaGetTokenPriceTool = tool(
  "solana_get_token_price",
  "Get the current price of a Solana token.",
  {
    mint: z.string().describe("Token mint address"),
  },
  async (args) => {
    const client = getClient();
    const priceInfo = await client.getTokenPrice(args.mint);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(priceInfo, null, 2),
      }],
    };
  }
);

// ============================================================================
// Swap Tools
// ============================================================================

/**
 * Get swap quote
 */
export const solanaGetSwapQuoteTool = tool(
  "solana_get_swap_quote",
  "Get a quote for swapping tokens via Jupiter DEX.",
  {
    inputMint: z.string().describe("Input token mint address"),
    outputMint: z.string().describe("Output token mint address"),
    amount: z.number().positive().describe("Amount of input token to swap"),
    slippageBps: z.number().int().min(1).max(1000).default(50).describe("Max slippage in basis points (0.01% per bp)"),
  },
  async (args) => {
    const client = getClient();
    const quote = await client.getSwapQuote({
      inputMint: args.inputMint,
      outputMint: args.outputMint,
      amount: args.amount,
      slippageBps: args.slippageBps,
    });

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          inputAmount: quote.inputAmount,
          outputAmount: quote.outputAmount,
          priceImpact: `${(quote.priceImpact * 100).toFixed(2)}%`,
          fee: quote.fee,
          routeSteps: quote.route.length,
          expiresAt: quote.expiresAt,
        }, null, 2),
      }],
    };
  }
);

/**
 * Execute swap
 */
export const solanaExecuteSwapTool = tool(
  "solana_execute_swap",
  "Execute a token swap via Jupiter DEX. Requires user confirmation.",
  {
    inputMint: z.string().describe("Input token mint address"),
    outputMint: z.string().describe("Output token mint address"),
    amount: z.number().positive().describe("Amount of input token to swap"),
    slippageBps: z.number().int().min(1).max(1000).default(50).describe("Max slippage in basis points"),
    priorityFee: z.number().min(0).optional().describe("Priority fee in lamports"),
  },
  async (args) => {
    const client = getClient();
    const result = await client.executeSwap({
      inputMint: args.inputMint,
      outputMint: args.outputMint,
      amount: args.amount,
      slippageBps: args.slippageBps,
      priorityFee: args.priorityFee,
    });

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: result.status === "confirmed",
          signature: result.signature,
          inputAmount: result.inputAmount,
          outputAmount: result.outputAmount,
          fee: result.fee,
          status: result.status,
          error: result.error,
        }, null, 2),
      }],
    };
  }
);

// ============================================================================
// Limit Order Tools
// ============================================================================

/**
 * Create limit order
 */
export const solanaCreateLimitOrderTool = tool(
  "solana_create_limit_order",
  "Create a limit order to buy/sell tokens at a specific price.",
  {
    inputMint: z.string().describe("Input token mint address"),
    outputMint: z.string().describe("Output token mint address"),
    inputAmount: z.number().positive().describe("Amount of input token"),
    targetPrice: z.number().positive().describe("Target price to execute at"),
    expiresInSeconds: z.number().int().positive().optional().describe("Order expiration in seconds"),
  },
  async (args) => {
    const client = getClient();
    const order = await client.createLimitOrder({
      inputMint: args.inputMint,
      outputMint: args.outputMint,
      inputAmount: args.inputAmount,
      targetPrice: args.targetPrice,
      expiresInSeconds: args.expiresInSeconds,
    });

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          orderId: order.id,
          status: order.status,
          targetPrice: order.targetPrice,
          createdAt: order.createdAt,
        }, null, 2),
      }],
    };
  }
);

/**
 * List limit orders
 */
export const solanaListLimitOrdersTool = tool(
  "solana_list_limit_orders",
  "List all active limit orders.",
  {
    limit: z.number().int().positive().default(20).describe("Maximum orders to return"),
  },
  async (args) => {
    const client = getClient();
    const orders = await client.getLimitOrders({ limit: args.limit });

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          count: orders.length,
          orders: orders.map((o) => ({
            id: o.id,
            inputMint: o.inputMint,
            outputMint: o.outputMint,
            inputAmount: o.inputAmount,
            targetPrice: o.targetPrice,
            status: o.status,
            createdAt: o.createdAt,
          })),
        }, null, 2),
      }],
    };
  }
);

/**
 * Cancel limit order
 */
export const solanaCancelLimitOrderTool = tool(
  "solana_cancel_limit_order",
  "Cancel an active limit order.",
  {
    orderId: z.string().describe("Order ID to cancel"),
  },
  async (args) => {
    const client = getClient();
    const order = await client.cancelLimitOrder(args.orderId);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: order.status === "cancelled",
          orderId: order.id,
          status: order.status,
        }, null, 2),
      }],
    };
  }
);

// ============================================================================
// Guardrail Tools
// ============================================================================

/**
 * List guardrails
 */
export const solanaListGuardrailsTool = tool(
  "solana_list_guardrails",
  "List all risk management guardrails.",
  {},
  async () => {
    const client = getClient();
    const guardrails = await client.listGuardrails();

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          count: guardrails.length,
          guardrails: guardrails.map((g) => ({
            id: g.id,
            name: g.name,
            type: g.type,
            enabled: g.enabled,
          })),
        }, null, 2),
      }],
    };
  }
);

/**
 * Create guardrail
 */
export const solanaCreateGuardrailTool = tool(
  "solana_create_guardrail",
  "Create a new risk management guardrail.",
  {
    name: z.string().describe("Guardrail name"),
    type: z.enum(["max_position", "max_daily_loss", "max_slippage", "blacklist", "whitelist"])
      .describe("Guardrail type"),
    enabled: z.boolean().default(true).describe("Whether guardrail is active"),
    config: z.record(z.unknown()).describe("Guardrail configuration"),
  },
  async (args) => {
    const client = getClient();
    const guardrail = await client.createGuardrail({
      name: args.name,
      type: args.type,
      enabled: args.enabled,
      config: args.config,
    });

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          guardrailId: guardrail.id,
          name: guardrail.name,
          type: guardrail.type,
          enabled: guardrail.enabled,
        }, null, 2),
      }],
    };
  }
);

// ============================================================================
// Transaction History Tools
// ============================================================================

/**
 * Get transaction history
 */
export const solanaGetTransactionsTool = tool(
  "solana_get_transactions",
  "Get transaction history for the connected wallet.",
  {
    limit: z.number().int().positive().default(20).describe("Maximum transactions to return"),
    type: z.enum(["swap", "transfer", "stake", "unstake"]).optional().describe("Filter by transaction type"),
  },
  async (args) => {
    const client = getClient();
    const transactions = await client.getTransactions({
      limit: args.limit,
      type: args.type,
    });

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          count: transactions.length,
          transactions: transactions.map((tx) => ({
            signature: tx.signature.slice(0, 16) + "...",
            type: tx.type,
            timestamp: tx.timestamp,
            status: tx.status,
            description: tx.description,
          })),
        }, null, 2),
      }],
    };
  }
);

// ============================================================================
// MCP Server Creation
// ============================================================================

/**
 * Create the Donut Backend MCP server instance
 */
export function createDonutBackendMcpServer(clientConfig: DonutBackendClientConfig) {
  // Initialize the client
  initializeDonutBackendClient(clientConfig);

  // Create and return the MCP server
  return createSdkMcpServer({
    name: "donut-backend",
    version: "0.1.0",
    tools: [
      // Portfolio
      solanaGetPortfolioTool,
      solanaGetSolBalanceTool,
      solanaRefreshPortfolioTool,
      // Token lookup
      solanaGetTokenInfoTool,
      solanaSearchTokensTool,
      solanaGetTrendingTokensTool,
      solanaGetTokenPriceTool,
      // Swaps
      solanaGetSwapQuoteTool,
      solanaExecuteSwapTool,
      // Limit orders
      solanaCreateLimitOrderTool,
      solanaListLimitOrdersTool,
      solanaCancelLimitOrderTool,
      // Guardrails
      solanaListGuardrailsTool,
      solanaCreateGuardrailTool,
      // Transactions
      solanaGetTransactionsTool,
    ],
  });
}

/**
 * All Donut Backend tools
 */
export const DONUT_BACKEND_TOOLS = [
  "solana_get_portfolio",
  "solana_get_sol_balance",
  "solana_refresh_portfolio",
  "solana_get_token_info",
  "solana_search_tokens",
  "solana_get_trending_tokens",
  "solana_get_token_price",
  "solana_get_swap_quote",
  "solana_execute_swap",
  "solana_create_limit_order",
  "solana_list_limit_orders",
  "solana_cancel_limit_order",
  "solana_list_guardrails",
  "solana_create_guardrail",
  "solana_get_transactions",
] as const;

/**
 * Read-only Donut Backend tools
 */
export const DONUT_BACKEND_READ_TOOLS = [
  "solana_get_portfolio",
  "solana_get_sol_balance",
  "solana_get_token_info",
  "solana_search_tokens",
  "solana_get_trending_tokens",
  "solana_get_token_price",
  "solana_get_swap_quote",
  "solana_list_limit_orders",
  "solana_list_guardrails",
  "solana_get_transactions",
] as const;

/**
 * Write Donut Backend tools (can modify state or execute transactions)
 */
export const DONUT_BACKEND_WRITE_TOOLS = [
  "solana_refresh_portfolio",
  "solana_execute_swap",
  "solana_create_limit_order",
  "solana_cancel_limit_order",
  "solana_create_guardrail",
] as const;
