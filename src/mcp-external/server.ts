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
import { handleWalletStatus } from "./tools/wallet.js";
import { handleQuote, handleSwap } from "./tools/swap.js";
import { handleTokenSearch } from "./tools/token-search.js";

// Load environment variables
dotenvConfig();

// ============================================================================
// Tool Definitions
// ============================================================================

const TOOLS: Tool[] = [
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
];

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

      // ============================================================================
      // Trading Tools (Phase A: Solana)
      // ============================================================================

      case "donut_balance": {
        const result = await handleWalletStatus();
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
