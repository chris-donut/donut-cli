/**
 * Portfolio Tool Handler
 *
 * Returns current portfolio status including positions and P&L.
 * Works in paper trading mode.
 */

import { HummingbotClient, HummingbotClientConfig } from "../../integrations/hummingbot-client.js";
import { loadConfig } from "../../core/config.js";

// ============================================================================
// Types
// ============================================================================

export interface Position {
  symbol: string;
  size: number;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPct: number;
  leverage: number;
  side: "long" | "short";
}

export interface PortfolioResult {
  success: boolean;
  totalValue?: number;
  availableBalance?: number;
  unrealizedPnl?: number;
  realizedPnl?: number;
  positions?: Position[];
  mode?: "live" | "paper" | "demo";
  error?: string;
}

// ============================================================================
// Handler
// ============================================================================

/**
 * Handle portfolio request
 *
 * Returns current positions (symbol, size, entry price, P&L).
 * Returns total portfolio value.
 * Works in paper trading mode.
 * Handles no active positions gracefully.
 */
export async function handlePortfolio(): Promise<PortfolioResult> {
  try {
    const config = loadConfig();

    // Check if hummingbot backend is configured
    if (!config.hummingbotUrl) {
      // Return demo data when no backend configured
      return {
        success: true,
        totalValue: 10000,
        availableBalance: 10000,
        unrealizedPnl: 0,
        realizedPnl: 0,
        positions: [],
        mode: "demo",
        error:
          "No Hummingbot Dashboard configured. Showing demo portfolio. Set HUMMINGBOT_URL to see live data.",
      };
    }

    // Create hummingbot client
    const clientConfig: HummingbotClientConfig = {
      baseUrl: config.hummingbotUrl,
      username: config.hummingbotUsername,
      password: config.hummingbotPassword,
    };

    const client = new HummingbotClient(clientConfig);

    // Check if backend is healthy
    const healthy = await client.healthCheck();
    if (!healthy) {
      return {
        success: false,
        error: `Cannot connect to Hummingbot Dashboard at ${config.hummingbotUrl}. Please ensure the service is running.`,
      };
    }

    // Get dashboard status for overall P&L
    const status = await client.getStatus();

    // Get running bots to determine positions
    const bots = await client.listBots();

    // Transform bots into positions
    const positions: Position[] = [];
    let totalUnrealizedPnl = 0;

    for (const bot of bots) {
      if (bot.status === "running" && bot.pnl !== 0) {
        // Get current price for the bot's trading pair
        const priceData = await client.getCurrentPrice(bot.tradingPair);
        const currentPrice = priceData?.price ?? 0;

        // Estimate position details from bot data
        // Note: This is a simplified view; actual position data may vary
        const position: Position = {
          symbol: bot.tradingPair,
          size: bot.volume / currentPrice || 0,
          entryPrice: currentPrice - (bot.pnl / (bot.volume / currentPrice || 1)),
          currentPrice,
          pnl: bot.pnl,
          pnlPct: bot.volume > 0 ? (bot.pnl / bot.volume) * 100 : 0,
          leverage: 10, // Default, actual value depends on strategy
          side: bot.pnl >= 0 ? "long" : "short",
        };

        positions.push(position);
        totalUnrealizedPnl += bot.pnl;
      }
    }

    // If no running bots, show available balance
    if (positions.length === 0) {
      return {
        success: true,
        totalValue: 10000, // Default initial balance
        availableBalance: 10000,
        unrealizedPnl: 0,
        realizedPnl: status.totalPnl,
        positions: [],
        mode: status.botsRunning > 0 ? "paper" : "demo",
      };
    }

    return {
      success: true,
      totalValue: 10000 + status.totalPnl,
      availableBalance: 10000 + status.totalPnl - totalUnrealizedPnl,
      unrealizedPnl: totalUnrealizedPnl,
      realizedPnl: status.totalPnl - totalUnrealizedPnl,
      positions,
      mode: "paper",
    };
  } catch (error) {
    // Handle connection errors gracefully
    if (
      error instanceof Error &&
      (error.message.includes("ECONNREFUSED") ||
        error.message.includes("fetch failed"))
    ) {
      return {
        success: false,
        error:
          "Cannot connect to Hummingbot Dashboard. Please ensure the service is running and HUMMINGBOT_URL is correct.",
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
