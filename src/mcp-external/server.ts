#!/usr/bin/env node
/**
 * Donut CLI External MCP Server
 *
 * Exposes donut-cli capabilities as an MCP server for Claude Code integration.
 * Users can build strategies, run backtests, and check portfolio from their terminal.
 *
 * Supports stdio transport for Claude Code compatibility.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { config as dotenvConfig } from "dotenv";

import { handleStrategyBuild } from "./tools/strategy-build.js";
import { handleBacktestRun } from "./tools/backtest-run.js";
import { handlePortfolio } from "./tools/portfolio.js";
import { handleWalletStatus, handleMultiChainWalletStatus } from "./tools/wallet.js";
import { handleBaseWalletStatus } from "./tools/base-wallet.js";
import { handleQuote, handleSwap } from "./tools/swap.js";
import { handleBaseQuote, handleBaseSwap, detectChainFromToken } from "./tools/base-swap.js";
import { handleTokenSearch } from "./tools/token-search.js";
import {
  handleHLBalance,
  handleHLOpen,
  handleHLClose,
  handleHLPositions,
  handleHLMarkets,
} from "./tools/hyperliquid.js";
import {
  handlePMMarkets,
  handlePMMarketDetails,
  handlePMBuy,
  handlePMSell,
  handlePMOpenOrders,
  handlePMCancelOrder,
} from "./tools/polymarket.js";
import {
  handleTrending,
  handleSearchMentions,
  handleTrendingTopics,
} from "./tools/social-signals.js";
import {
  handleResearch,
  handlePlan,
  handleExecute,
  handleReport,
  loadPlan,
  savePlan,
} from "./tools/workflow.js";
import {
  checkPolicy,
  handlePolicySet,
  handlePolicyGet,
  handleKillSwitch,
} from "./tools/policy.js";

// Load environment variables
dotenvConfig();

// ============================================================================
// Tool Definitions
// ============================================================================

// Export TOOLS for use by web server MCP endpoint
export const TOOLS: Tool[] = [
  {
    name: "donut_strategy_build",
    description:
      "Build a trading strategy from natural language. Describe what kind of strategy you want and the AI will generate a configuration.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description:
            "Natural language description of the strategy (e.g., 'Build a momentum strategy for SOL with 5% stop loss')",
        },
        symbol: {
          type: "string",
          description:
            "Optional trading pair to focus on (e.g., 'SOL/USDT', 'BTC/USDT')",
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "donut_backtest_run",
    description:
      "Run a backtest on a trading strategy to validate performance before paper/live trading.",
    inputSchema: {
      type: "object",
      properties: {
        strategy: {
          type: "object",
          description: "Strategy configuration object from donut_strategy_build",
        },
        symbol: {
          type: "string",
          description: "Trading pair to backtest (e.g., 'BTC-USDT')",
        },
        days: {
          type: "number",
          description: "Backtest period in days (default: 30)",
          default: 30,
        },
      },
      required: ["strategy", "symbol"],
    },
  },
  {
    name: "donut_portfolio",
    description:
      "Check current portfolio status including positions and P&L. Works in paper trading mode.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  // ============================================================================
  // Trading Tools (Phase A: Solana)
  // ============================================================================
  {
    name: "donut_balance",
    description:
      "Check wallet status and SOL balance on Solana. Returns connected wallet address and balance.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "donut_base_balance",
    description:
      "Check wallet status and ETH balance on Base chain. Returns connected wallet address and balance.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "donut_wallet_status",
    description:
      "Check wallet status across all supported chains (Solana and Base). Returns connected wallets and balances for each chain.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "donut_quote",
    description:
      "Get a swap quote without executing. Shows expected output, minimum output, price impact, and route.",
    inputSchema: {
      type: "object",
      properties: {
        fromToken: {
          type: "string",
          description:
            "Token to swap from (symbol like 'SOL', 'USDC' or mint address)",
        },
        toToken: {
          type: "string",
          description:
            "Token to swap to (symbol like 'SOL', 'USDC' or mint address)",
        },
        amount: {
          type: "number",
          description: "Amount to swap in human-readable units (e.g., 1.5 SOL)",
        },
        slippage: {
          type: "number",
          description: "Slippage tolerance in percentage (default: 0.5 for 0.5%)",
        },
      },
      required: ["fromToken", "toToken", "amount"],
    },
  },
  {
    name: "donut_swap",
    description:
      "Execute a token swap on Solana via Jupiter aggregator. IMPORTANT: Always get a quote first and confirm the token addresses before swapping.",
    inputSchema: {
      type: "object",
      properties: {
        fromToken: {
          type: "string",
          description:
            "Token to swap from (symbol like 'SOL', 'USDC' or mint address)",
        },
        toToken: {
          type: "string",
          description:
            "Token to swap to (symbol like 'SOL', 'USDC' or mint address)",
        },
        amount: {
          type: "number",
          description: "Amount to swap in human-readable units (e.g., 1.5 SOL)",
        },
        slippage: {
          type: "number",
          description: "Slippage tolerance in percentage (default: 0.5 for 0.5%)",
        },
      },
      required: ["fromToken", "toToken", "amount"],
    },
  },
  {
    name: "donut_search_token",
    description:
      "Search for tokens by name or symbol. Returns top 5 matches with addresses. ALWAYS verify the contract address before trading, especially for tokens with similar names.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Token name or symbol to search for (e.g., 'BONK', 'Jupiter')",
        },
      },
      required: ["query"],
    },
  },
  // ============================================================================
  // Trading Tools (Phase B: Base Chain)
  // ============================================================================
  {
    name: "donut_base_quote",
    description:
      "Get a swap quote on Base chain via 0x aggregator. Shows expected output, minimum output, price impact, gas estimate, and route.",
    inputSchema: {
      type: "object",
      properties: {
        fromToken: {
          type: "string",
          description:
            "Token to swap from (symbol like 'ETH', 'USDC' or contract address)",
        },
        toToken: {
          type: "string",
          description:
            "Token to swap to (symbol like 'ETH', 'USDC' or contract address)",
        },
        amount: {
          type: "number",
          description: "Amount to swap in human-readable units (e.g., 0.1 ETH)",
        },
        slippage: {
          type: "number",
          description: "Slippage tolerance in percentage (default: 0.5 for 0.5%)",
        },
      },
      required: ["fromToken", "toToken", "amount"],
    },
  },
  {
    name: "donut_base_swap",
    description:
      "Execute a token swap on Base chain via 0x aggregator. IMPORTANT: Always get a quote first and confirm the token addresses before swapping. Handles ERC20 approvals automatically.",
    inputSchema: {
      type: "object",
      properties: {
        fromToken: {
          type: "string",
          description:
            "Token to swap from (symbol like 'ETH', 'USDC' or contract address)",
        },
        toToken: {
          type: "string",
          description:
            "Token to swap to (symbol like 'ETH', 'USDC' or contract address)",
        },
        amount: {
          type: "number",
          description: "Amount to swap in human-readable units (e.g., 0.1 ETH)",
        },
        slippage: {
          type: "number",
          description: "Slippage tolerance in percentage (default: 0.5 for 0.5%)",
        },
      },
      required: ["fromToken", "toToken", "amount"],
    },
  },
  {
    name: "donut_detect_chain",
    description:
      "Detect which blockchain a token belongs to based on its address format. Solana addresses are base58 (32-44 chars), Base/EVM addresses start with 0x (42 chars).",
    inputSchema: {
      type: "object",
      properties: {
        token: {
          type: "string",
          description: "Token address or symbol to check",
        },
      },
      required: ["token"],
    },
  },
  // ============================================================================
  // Trading Tools (Phase C: Hyperliquid Perpetuals)
  // ============================================================================
  {
    name: "donut_hl_balance",
    description:
      "Check Hyperliquid account balance, margin status, and open positions. Returns account value, withdrawable balance, margin used, and unrealized PnL.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "donut_hl_open",
    description:
      "Open a perpetual futures position on Hyperliquid. Supports market and limit orders with configurable leverage. IMPORTANT: Check available markets first with donut_hl_markets.",
    inputSchema: {
      type: "object",
      properties: {
        market: {
          type: "string",
          description: "Market symbol (e.g., 'BTC', 'ETH', 'SOL')",
        },
        side: {
          type: "string",
          enum: ["long", "short"],
          description: "Position direction: 'long' or 'short'",
        },
        size: {
          type: "number",
          description: "Position size in base asset units (e.g., 0.01 for 0.01 BTC)",
        },
        leverage: {
          type: "number",
          description: "Leverage multiplier (default: 1, max varies by market)",
        },
        orderType: {
          type: "string",
          enum: ["market", "limit"],
          description: "Order type: 'market' (default) or 'limit'",
        },
        price: {
          type: "number",
          description: "Limit price (required for limit orders)",
        },
        reduceOnly: {
          type: "boolean",
          description: "If true, only reduces existing position (default: false)",
        },
      },
      required: ["market", "side", "size"],
    },
  },
  {
    name: "donut_hl_close",
    description:
      "Close an open perpetual position on Hyperliquid. Closes the entire position for the specified market with a market order.",
    inputSchema: {
      type: "object",
      properties: {
        market: {
          type: "string",
          description: "Market symbol to close (e.g., 'BTC', 'ETH')",
        },
      },
      required: ["market"],
    },
  },
  {
    name: "donut_hl_positions",
    description:
      "List all open perpetual positions on Hyperliquid with their current PnL, entry prices, and liquidation prices.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "donut_hl_markets",
    description:
      "List available perpetual markets on Hyperliquid with their maximum leverage limits.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  // ============================================================================
  // Trading Tools (Phase D: Polymarket Prediction Markets)
  // ============================================================================
  {
    name: "donut_pm_markets",
    description:
      "Search or list prediction markets on Polymarket. Shows market question, outcomes, odds, volume, and liquidity. Use 'trending' for popular markets or provide a search query.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query (e.g., 'bitcoin', 'election', 'superbowl')",
        },
        trending: {
          type: "boolean",
          description: "If true, returns trending/high-volume markets (default: false)",
        },
        limit: {
          type: "number",
          description: "Maximum number of markets to return (default: 10)",
        },
      },
      required: [],
    },
  },
  {
    name: "donut_pm_market",
    description:
      "Get detailed information about a specific Polymarket prediction market including orderbook data.",
    inputSchema: {
      type: "object",
      properties: {
        conditionId: {
          type: "string",
          description: "The condition ID of the market (from donut_pm_markets)",
        },
      },
      required: ["conditionId"],
    },
  },
  {
    name: "donut_pm_buy",
    description:
      "Buy shares on a Polymarket prediction market. IMPORTANT: Get market details first to find the correct tokenId for the outcome you want to bet on. Prices are between 0 and 1 (representing probability).",
    inputSchema: {
      type: "object",
      properties: {
        tokenId: {
          type: "string",
          description: "Token ID of the outcome to buy (from donut_pm_market)",
        },
        amount: {
          type: "number",
          description: "USDC amount to spend (for market orders) or calculate shares (for limit orders)",
        },
        price: {
          type: "number",
          description: "Optional limit price between 0-1 (e.g., 0.65 for 65% probability). If omitted, executes as market order.",
        },
      },
      required: ["tokenId", "amount"],
    },
  },
  {
    name: "donut_pm_sell",
    description:
      "Sell shares on a Polymarket prediction market. IMPORTANT: You must own shares to sell them.",
    inputSchema: {
      type: "object",
      properties: {
        tokenId: {
          type: "string",
          description: "Token ID of the outcome to sell (from donut_pm_market)",
        },
        size: {
          type: "number",
          description: "Number of shares to sell",
        },
        price: {
          type: "number",
          description: "Optional limit price between 0-1. If omitted, executes as market order.",
        },
      },
      required: ["tokenId", "size"],
    },
  },
  {
    name: "donut_pm_orders",
    description:
      "List all open orders on Polymarket.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "donut_pm_cancel",
    description:
      "Cancel an open order on Polymarket.",
    inputSchema: {
      type: "object",
      properties: {
        orderId: {
          type: "string",
          description: "Order ID to cancel (from donut_pm_orders)",
        },
      },
      required: ["orderId"],
    },
  },
  // ============================================================================
  // Social Signal Discovery (Phase E: Farcaster Integration)
  // ============================================================================
  {
    name: "donut_trending",
    description:
      "Discover trending tokens on Farcaster social network. Aggregates token mentions from trending casts, analyzes sentiment, and returns social engagement metrics. Use this to find tokens with high social buzz.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of trending tokens to return (default: 10)",
        },
        minMentions: {
          type: "number",
          description: "Minimum mention count to include a token (default: 2)",
        },
        timeWindow: {
          type: "string",
          enum: ["1h", "6h", "24h", "7d"],
          description: "Time window for trending analysis (default: 24h)",
        },
        network: {
          type: "string",
          enum: ["solana", "base", "ethereum"],
          description: "Filter by blockchain network",
        },
      },
      required: [],
    },
  },
  {
    name: "donut_search_mentions",
    description:
      "Search for social mentions of a specific token or topic on Farcaster. Returns casts discussing the query with engagement metrics and sentiment analysis.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Token symbol (e.g., '$SOL', 'BONK') or topic to search for",
        },
        limit: {
          type: "number",
          description: "Maximum number of results to return (default: 20)",
        },
        sortBy: {
          type: "string",
          enum: ["algorithmic", "recent"],
          description: "Sort order: 'algorithmic' for relevance or 'recent' for chronological (default: algorithmic)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "donut_trending_topics",
    description:
      "Get trending topics on Farcaster. Useful for discovering emerging narratives and themes in the crypto community.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of topics to return (default: 10)",
        },
      },
      required: [],
    },
  },
  // ============================================================================
  // Workflow Tools (Agent Trust Layer)
  // ============================================================================
  {
    name: "donut_research",
    description:
      "Aggregate market context for a token or narrative. Combines social signals, token info, and sentiment analysis into a structured research report. Use this FIRST before creating a trade plan.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Token symbol (e.g., 'SOL', '$BONK'), contract address, or narrative/topic to research",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "donut_plan",
    description:
      "Generate a structured trade plan with entry, target, stop loss, and position sizing. The plan must pass pretrade checks before execution. Use donut_research first to inform your thesis.",
    inputSchema: {
      type: "object",
      properties: {
        thesis: {
          type: "string",
          description:
            "Your investment thesis - why you want to take this trade (e.g., 'SOL breaking out of consolidation with strong volume')",
        },
        token: {
          type: "string",
          description:
            "Token symbol or contract address to trade (e.g., 'SOL', 'BONK', or full address)",
        },
        direction: {
          type: "string",
          enum: ["long", "short"],
          description: "Trade direction: 'long' to buy, 'short' to sell/short",
        },
        riskPercent: {
          type: "number",
          description:
            "Percentage of portfolio to risk on this trade (e.g., 2 for 2%). Recommended: 1-5%",
        },
        timeHorizon: {
          type: "string",
          description:
            "Optional expected holding period (e.g., '1d', '1w', 'swing')",
        },
      },
      required: ["thesis", "token", "direction", "riskPercent"],
    },
  },
  {
    name: "donut_execute",
    description:
      "Execute a validated trade plan. Requires pretrade_check to have passed first. Routes to the appropriate exchange (Jupiter for Solana, 0x for Base) based on token chain. Implements automatic retry on failure.",
    inputSchema: {
      type: "object",
      properties: {
        planId: {
          type: "string",
          description: "The planId from a validated donut_plan result. Plan must have passed donut_pretrade_check.",
        },
      },
      required: ["planId"],
    },
  },
  {
    name: "donut_report",
    description:
      "Generate a posttrade analysis report for an executed trade. Returns slippage, fees, unrealized PnL, and holding period.",
    inputSchema: {
      type: "object",
      properties: {
        executionId: {
          type: "string",
          description: "The executionId from a donut_execute result",
        },
      },
      required: ["executionId"],
    },
  },
  // Policy Engine Tools
  {
    name: "donut_pretrade_check",
    description:
      "Check a trade plan against configured risk policies before execution. Returns pass/fail with any violations or warnings. Must be called before donut_execute.",
    inputSchema: {
      type: "object",
      properties: {
        planId: {
          type: "string",
          description: "The planId from a donut_plan result to check against policies",
        },
      },
      required: ["planId"],
    },
  },
  {
    name: "donut_policy_set",
    description:
      "Configure trading risk policies. Set position limits, portfolio risk limits, and cooldown periods.",
    inputSchema: {
      type: "object",
      properties: {
        maxPositionSize: {
          type: "number",
          description: "Maximum position size as % of portfolio (1-100). Default: 10%",
        },
        maxPortfolioRisk: {
          type: "number",
          description: "Maximum total portfolio risk as % (1-100). Default: 25%",
        },
        maxAssetConcentration: {
          type: "number",
          description: "Maximum % of portfolio in any single asset (1-100). Default: 20%",
        },
        cooldownMinutes: {
          type: "number",
          description: "Minimum minutes between trades on same token (0-1440). Default: 5",
        },
      },
      required: [],
    },
  },
  {
    name: "donut_policy_get",
    description:
      "Get current policy configuration including position limits, risk limits, cooldown, and kill switch status.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "donut_kill_switch",
    description:
      "Emergency kill switch to halt all trading. When enabled, all donut_execute calls will fail. Use to immediately stop trading activity.",
    inputSchema: {
      type: "object",
      properties: {
        enabled: {
          type: "boolean",
          description: "true to enable kill switch (halt trading), false to disable",
        },
        reason: {
          type: "string",
          description: "Optional reason for enabling kill switch (e.g., 'Market crash', 'Manual pause')",
        },
      },
      required: ["enabled"],
    },
  },
];

// ============================================================================
// Tool Execution Handler (Exported for Web Server MCP Endpoint)
// ============================================================================

/**
 * Execute a tool by name with given arguments.
 * Returns MCP-formatted response with content array.
 * Exported for use by HTTP MCP endpoint in web server.
 */
export async function executeToolHandler(
  name: string,
  args?: Record<string, unknown>
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  try {
    switch (name) {
      case "donut_strategy_build": {
        const result = await handleStrategyBuild(
          args?.prompt as string,
          args?.symbol as string | undefined
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "donut_backtest_run": {
        const result = await handleBacktestRun(
          args?.strategy as Record<string, unknown>,
          args?.symbol as string,
          (args?.days as number) ?? 30
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "donut_portfolio": {
        const result = await handlePortfolio();
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "donut_balance": {
        const result = await handleWalletStatus();
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "donut_base_balance": {
        const result = await handleBaseWalletStatus();
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "donut_wallet_status": {
        const result = await handleMultiChainWalletStatus();
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "donut_quote": {
        const result = await handleQuote({
          fromToken: args?.fromToken as string,
          toToken: args?.toToken as string,
          amount: args?.amount as number,
          slippage: args?.slippage as number | undefined,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "donut_swap": {
        const result = await handleSwap({
          fromToken: args?.fromToken as string,
          toToken: args?.toToken as string,
          amount: args?.amount as number,
          slippage: args?.slippage as number | undefined,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "donut_search_token": {
        const result = await handleTokenSearch(args?.query as string);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "donut_base_quote": {
        const result = await handleBaseQuote({
          fromToken: args?.fromToken as string,
          toToken: args?.toToken as string,
          amount: args?.amount as number,
          slippage: args?.slippage as number | undefined,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "donut_base_swap": {
        const result = await handleBaseSwap({
          fromToken: args?.fromToken as string,
          toToken: args?.toToken as string,
          amount: args?.amount as number,
          slippage: args?.slippage as number | undefined,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "donut_detect_chain": {
        const result = detectChainFromToken(args?.token as string);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "donut_hl_balance": {
        const result = await handleHLBalance();
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "donut_hl_markets": {
        const result = await handleHLMarkets();
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "donut_hl_positions": {
        const result = await handleHLPositions();
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "donut_hl_open": {
        const result = await handleHLOpen({
          market: args?.market as string,
          side: args?.side as "long" | "short",
          size: args?.size as number,
          leverage: args?.leverage as number,
          orderType: args?.orderType as "market" | "limit" | undefined,
          price: args?.price as number | undefined,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "donut_hl_close": {
        const result = await handleHLClose(args?.market as string);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "donut_pm_markets": {
        const result = await handlePMMarkets({
          query: args?.query as string | undefined,
          trending: args?.trending as boolean | undefined,
          limit: args?.limit as number | undefined,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "donut_pm_market": {
        const result = await handlePMMarketDetails(args?.conditionId as string);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "donut_pm_buy": {
        const result = await handlePMBuy({
          tokenId: args?.tokenId as string,
          amount: args?.amount as number,
          price: args?.price as number | undefined,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "donut_pm_sell": {
        const result = await handlePMSell({
          tokenId: args?.tokenId as string,
          size: args?.size as number,
          price: args?.price as number | undefined,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "donut_pm_orders": {
        const result = await handlePMOpenOrders();
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "donut_pm_cancel": {
        const result = await handlePMCancelOrder(args?.orderId as string);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "donut_trending": {
        const result = await handleTrending({
          limit: args?.limit as number | undefined,
          minMentions: args?.minMentions as number | undefined,
          timeWindow: args?.timeWindow as "1h" | "6h" | "24h" | "7d" | undefined,
          network: args?.network as "solana" | "base" | "ethereum" | undefined,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "donut_search_mentions": {
        const result = await handleSearchMentions({
          query: args?.query as string,
          limit: args?.limit as number | undefined,
          sortBy: args?.sortBy as "algorithmic" | "recent" | undefined,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "donut_trending_topics": {
        const result = await handleTrendingTopics({
          limit: args?.limit as number | undefined,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      // ============================================================================
      // Workflow Tools (Agent Trust Layer)
      // ============================================================================

      case "donut_research": {
        const result = await handleResearch({
          query: args?.query as string,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "donut_plan": {
        const result = await handlePlan({
          thesis: args?.thesis as string,
          token: args?.token as string,
          direction: args?.direction as "long" | "short",
          riskPercent: args?.riskPercent as number,
          timeHorizon: args?.timeHorizon as string | undefined,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "donut_execute": {
        const result = await handleExecute({
          planId: args?.planId as string,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "donut_report": {
        const result = await handleReport({
          executionId: args?.executionId as string,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      // ============================================================================
      // Policy Engine Tools
      // ============================================================================

      case "donut_pretrade_check": {
        const planId = args?.planId as string;
        if (!planId) {
          return {
            content: [{ type: "text", text: JSON.stringify({ success: false, error: "planId is required" }, null, 2) }],
            isError: true,
          };
        }
        const plan = loadPlan(planId);
        if (!plan) {
          return {
            content: [{ type: "text", text: JSON.stringify({ success: false, error: `Plan not found: ${planId}` }, null, 2) }],
            isError: true,
          };
        }
        const result = checkPolicy(plan);
        // Update the plan with pretrade status
        plan.pretradeStatus = result.passed ? "passed" : "failed";
        plan.pretradeViolations = result.violations;
        savePlan(plan);
        return {
          content: [{ type: "text", text: JSON.stringify({ success: true, planId, ...result }, null, 2) }],
        };
      }

      case "donut_policy_set": {
        const result = handlePolicySet({
          maxPositionSize: args?.maxPositionSize as number | undefined,
          maxPortfolioRisk: args?.maxPortfolioRisk as number | undefined,
          maxAssetConcentration: args?.maxAssetConcentration as number | undefined,
          cooldownMinutes: args?.cooldownMinutes as number | undefined,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "donut_policy_get": {
        const result = handlePolicyGet();
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "donut_kill_switch": {
        const result = handleKillSwitch({
          enabled: args?.enabled as boolean,
          reason: args?.reason as string | undefined,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
}

// ============================================================================
// Server Setup
// ============================================================================

const server = new Server(
  {
    name: "donut-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ============================================================================
// Request Handlers
// ============================================================================

/**
 * Handle tools/list request
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

/**
 * Handle tools/call request
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  return executeToolHandler(name, args as Record<string, unknown> | undefined);
});

// ============================================================================
// Server Startup
// ============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Donut MCP Server started");
}

main().catch((error) => {
  console.error("Failed to start Donut MCP Server:", error);
  process.exit(1);
});
