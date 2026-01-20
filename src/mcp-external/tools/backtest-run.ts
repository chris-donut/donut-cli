/**
 * Backtest Run Tool Handler
 *
 * Runs backtests via hummingbot-dashboard backend.
 * Uses existing hummingbot-client.ts integration.
 */

import { HummingbotClient, HummingbotClientConfig } from "../../integrations/hummingbot-client.js";
import { loadConfig } from "../../core/config.js";

// Valid timeframe values
const VALID_TIMEFRAMES = ["1m", "3m", "5m", "15m", "30m", "1h", "4h", "1d"] as const;
type Timeframe = (typeof VALID_TIMEFRAMES)[number];

// ============================================================================
// Types
// ============================================================================

export interface BacktestRunResult {
  success: boolean;
  runId?: string;
  status?: string;
  metrics?: {
    totalReturnPct: number;
    maxDrawdownPct: number;
    sharpeRatio: number;
    winRate: number;
    profitFactor: number;
    trades: number;
  };
  error?: string;
}

// ============================================================================
// Handler
// ============================================================================

/**
 * Handle backtest run request
 *
 * Invokes Backtest Analyst agent via hummingbot-client.ts integration.
 * Returns backtest results (P&L, win rate, max drawdown).
 * Handles missing hummingbot-dashboard gracefully with error message.
 */
export async function handleBacktestRun(
  strategy: Record<string, unknown>,
  symbol: string,
  days: number = 30
): Promise<BacktestRunResult> {
  if (!strategy) {
    return {
      success: false,
      error: "Strategy configuration is required",
    };
  }

  if (!symbol) {
    return {
      success: false,
      error: "Trading symbol is required (e.g., 'BTC-USDT')",
    };
  }

  try {
    const config = loadConfig();

    // Check if hummingbot backend is configured
    if (!config.hummingbotUrl) {
      return {
        success: false,
        error:
          "Hummingbot Dashboard not configured. Set HUMMINGBOT_URL in your .env file. Example: HUMMINGBOT_URL=http://localhost:8000",
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

    // Calculate timestamps
    const endTs = Math.floor(Date.now() / 1000);
    const startTs = endTs - days * 24 * 60 * 60;

    // Normalize symbol format (SOL/USDT -> SOL-USDT)
    const normalizedSymbol = symbol.replace("/", "-").toUpperCase();

    // Extract parameters from strategy
    const leverage =
      (strategy.riskControls as Record<string, number>)?.maxLeverage || 10;
    const initialBalance =
      (strategy.riskControls as Record<string, number>)?.maxPositionSizeUsd || 10000;
    const rawTimeframes = (strategy.timeframes as string[]) || ["1m", "5m", "15m"];
    // Filter to only valid timeframes
    const timeframes = rawTimeframes.filter((tf): tf is Timeframe =>
      VALID_TIMEFRAMES.includes(tf as Timeframe)
    );
    const customPrompt = strategy.customPrompt as string | undefined;

    // Start backtest
    const backtestConfig = {
      symbols: [normalizedSymbol],
      startTs,
      endTs,
      initialBalance,
      leverage: { btcEthLeverage: leverage, altcoinLeverage: leverage },
      timeframes,
      customPrompt,
    };

    const status = await client.startBacktest(backtestConfig);

    if (!status.runId) {
      return {
        success: false,
        error: "Backtest started but no run ID was returned",
      };
    }

    // Poll for completion (with timeout)
    const maxWaitMs = 5 * 60 * 1000; // 5 minutes max
    const pollIntervalMs = 2000;
    const startTime = Date.now();

    let currentStatus = status;

    while (
      currentStatus.state !== "completed" &&
      currentStatus.state !== "failed" &&
      currentStatus.state !== "stopped"
    ) {
      if (Date.now() - startTime > maxWaitMs) {
        return {
          success: true,
          runId: status.runId,
          status: "running",
          error:
            "Backtest is still running. Check status later with the run ID.",
        };
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      currentStatus = await client.getBacktestStatus(status.runId);
    }

    // Get final metrics
    if (currentStatus.state === "completed") {
      const metrics = await client.getBacktestMetrics(status.runId);

      return {
        success: true,
        runId: status.runId,
        status: "completed",
        metrics: {
          totalReturnPct: metrics.totalReturnPct,
          maxDrawdownPct: metrics.maxDrawdownPct,
          sharpeRatio: metrics.sharpeRatio,
          winRate: metrics.winRate,
          profitFactor: metrics.profitFactor,
          trades: metrics.trades,
        },
      };
    } else {
      return {
        success: false,
        runId: status.runId,
        status: currentStatus.state,
        error: currentStatus.lastError || `Backtest ${currentStatus.state}`,
      };
    }
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
