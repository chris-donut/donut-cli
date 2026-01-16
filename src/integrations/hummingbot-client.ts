/**
 * HTTP client for Hummingbot Dashboard backend API
 * Wraps the REST API exposed by the Hummingbot Dashboard (port 8000)
 *
 * Based on: https://github.com/DonutLabs-ai/hummingbot-dashboard
 */

import {
  BacktestConfig,
  BacktestStatus,
  BacktestMetrics,
  EquityPoint,
  TradeEvent,
} from "../core/types.js";

export interface HummingbotClientConfig {
  baseUrl: string;
  timeout?: number;
}

export interface HummingbotStrategy {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface HummingbotBot {
  id: string;
  name: string;
  status: "running" | "stopped" | "error";
  strategy: string;
  exchange: string;
  tradingPair: string;
  pnl: number;
  volume: number;
}

export interface MarketData {
  symbol: string;
  price: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  timestamp: number;
}

export interface CandleData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * HTTP client for Hummingbot Dashboard API
 */
export class HummingbotClient {
  private baseUrl: string;
  private timeout: number;

  constructor(config: HummingbotClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ""); // Remove trailing slash
    this.timeout = config.timeout || 30000;
  }

  // ============================================================================
  // Backtest Operations
  // ============================================================================

  /**
   * Start a new backtest run
   */
  async startBacktest(config: Partial<BacktestConfig>): Promise<BacktestStatus> {
    const apiConfig = {
      trading_pair: config.symbols?.[0] || "BTC-USDT",
      exchange: "binance_perpetual",
      start_time: config.startTs,
      end_time: config.endTs,
      initial_portfolio: config.initialBalance || 10000,
      trade_cost: (config.feeBps || 4) / 10000, // Convert bps to decimal
      config: {
        timeframes: config.timeframes || ["1m", "5m", "15m"],
        leverage: config.leverage?.btcEthLeverage || 10,
        custom_prompt: config.customPrompt,
      },
    };

    const response = await this.request("POST", "/api/v1/backtest/start", apiConfig);

    return this.parseBacktestStatus(response);
  }

  /**
   * Get status of a backtest run
   */
  async getBacktestStatus(runId: string): Promise<BacktestStatus> {
    const response = await this.request("GET", `/api/v1/backtest/${runId}/status`);
    return this.parseBacktestStatus(response);
  }

  /**
   * Stop a running backtest
   */
  async stopBacktest(runId: string): Promise<BacktestStatus> {
    const response = await this.request("POST", `/api/v1/backtest/${runId}/stop`);
    return this.parseBacktestStatus(response);
  }

  /**
   * Get backtest results/metrics
   */
  async getBacktestMetrics(runId: string): Promise<BacktestMetrics> {
    const response = await this.request("GET", `/api/v1/backtest/${runId}/results`);

    return {
      totalReturnPct: (response.total_return as number) || 0,
      maxDrawdownPct: (response.max_drawdown as number) || 0,
      sharpeRatio: (response.sharpe_ratio as number) || 0,
      profitFactor: (response.profit_factor as number) || 0,
      winRate: (response.win_rate as number) || 0,
      trades: (response.total_trades as number) || 0,
      avgWin: (response.avg_win as number) || 0,
      avgLoss: (response.avg_loss as number) || 0,
      bestSymbol: (response.best_performing_pair as string) || "",
      worstSymbol: (response.worst_performing_pair as string) || "",
      liquidated: (response.liquidated as boolean) || false,
    };
  }

  /**
   * Get equity curve data
   */
  async getEquityCurve(runId: string): Promise<EquityPoint[]> {
    const response = await this.request("GET", `/api/v1/backtest/${runId}/equity`);
    const points = (response.equity_curve as Array<Record<string, number>>) || [];

    return points.map((p) => ({
      timestamp: p.timestamp,
      equity: p.portfolio_value,
      available: p.available_balance,
      pnl: p.pnl,
      pnlPct: p.pnl_pct,
      drawdownPct: p.drawdown_pct,
      cycle: p.cycle || 0,
    }));
  }

  /**
   * Get trade history from backtest
   */
  async getBacktestTrades(runId: string): Promise<TradeEvent[]> {
    const response = await this.request("GET", `/api/v1/backtest/${runId}/trades`);
    const trades = (response.trades as Array<Record<string, unknown>>) || [];

    return trades.map((t) => ({
      timestamp: t.timestamp as number,
      symbol: t.trading_pair as string,
      action: (t.trade_type === "entry" ? "open" : "close") as "open" | "close",
      side: t.side as "long" | "short",
      quantity: t.amount as number,
      price: t.price as number,
      fee: t.fee as number,
      slippage: (t.slippage as number) || 0,
      orderValue: t.order_value as number,
      realizedPnL: t.realized_pnl as number | undefined,
      leverage: (t.leverage as number) || 1,
      cycle: (t.cycle as number) || 0,
      liquidationFlag: (t.is_liquidation as boolean) || false,
      note: t.note as string | undefined,
    }));
  }

  /**
   * List all backtest runs
   */
  async listBacktests(limit: number = 20): Promise<Array<{
    runId: string;
    status: string;
    tradingPair: string;
    startTime: number;
    endTime: number;
    createdAt: string;
  }>> {
    const response = await this.request("GET", `/api/v1/backtest/list?limit=${limit}`);
    const runs = (response.backtests as Array<Record<string, unknown>>) || [];

    return runs.map((r) => ({
      runId: r.id as string,
      status: r.status as string,
      tradingPair: r.trading_pair as string,
      startTime: r.start_time as number,
      endTime: r.end_time as number,
      createdAt: r.created_at as string,
    }));
  }

  // ============================================================================
  // Strategy Operations
  // ============================================================================

  /**
   * List available strategies
   */
  async listStrategies(): Promise<HummingbotStrategy[]> {
    const response = await this.request("GET", "/api/v1/strategies");
    const strategies = (response.strategies as Array<Record<string, unknown>>) || [];

    return strategies.map((s) => ({
      id: s.id as string,
      name: s.name as string,
      type: s.type as string,
      config: s.config as Record<string, unknown>,
      createdAt: s.created_at as string,
      updatedAt: s.updated_at as string,
    }));
  }

  /**
   * Get a specific strategy
   */
  async getStrategy(strategyId: string): Promise<HummingbotStrategy> {
    const response = await this.request("GET", `/api/v1/strategies/${strategyId}`);

    return {
      id: response.id as string,
      name: response.name as string,
      type: response.type as string,
      config: response.config as Record<string, unknown>,
      createdAt: response.created_at as string,
      updatedAt: response.updated_at as string,
    };
  }

  /**
   * Create a new strategy
   */
  async createStrategy(strategy: Omit<HummingbotStrategy, "id" | "createdAt" | "updatedAt">): Promise<HummingbotStrategy> {
    const response = await this.request("POST", "/api/v1/strategies", {
      name: strategy.name,
      type: strategy.type,
      config: strategy.config,
    });

    return {
      id: response.id as string,
      name: response.name as string,
      type: response.type as string,
      config: response.config as Record<string, unknown>,
      createdAt: response.created_at as string,
      updatedAt: response.updated_at as string,
    };
  }

  // ============================================================================
  // Bot Operations
  // ============================================================================

  /**
   * List all bots
   */
  async listBots(): Promise<HummingbotBot[]> {
    const response = await this.request("GET", "/api/v1/bots");
    const bots = (response.bots as Array<Record<string, unknown>>) || [];

    return bots.map((b) => ({
      id: b.id as string,
      name: b.name as string,
      status: b.status as "running" | "stopped" | "error",
      strategy: b.strategy as string,
      exchange: b.exchange as string,
      tradingPair: b.trading_pair as string,
      pnl: (b.pnl as number) || 0,
      volume: (b.volume as number) || 0,
    }));
  }

  /**
   * Start a bot
   */
  async startBot(botId: string): Promise<HummingbotBot> {
    const response = await this.request("POST", `/api/v1/bots/${botId}/start`);
    return this.parseBotResponse(response);
  }

  /**
   * Stop a bot
   */
  async stopBot(botId: string): Promise<HummingbotBot> {
    const response = await this.request("POST", `/api/v1/bots/${botId}/stop`);
    return this.parseBotResponse(response);
  }

  // ============================================================================
  // Market Data
  // ============================================================================

  /**
   * Get current market prices
   */
  async getPrices(pairs: string[]): Promise<MarketData[]> {
    const pairsParam = pairs.join(",");
    const response = await this.request("GET", `/api/v1/market/prices?pairs=${pairsParam}`);
    const prices = (response.prices as Array<Record<string, unknown>>) || [];

    return prices.map((p) => ({
      symbol: p.symbol as string,
      price: p.price as number,
      volume24h: (p.volume_24h as number) || 0,
      high24h: (p.high_24h as number) || 0,
      low24h: (p.low_24h as number) || 0,
      timestamp: p.timestamp as number,
    }));
  }

  /**
   * Get historical candle data
   */
  async getCandles(
    pair: string,
    interval: string = "1m",
    limit: number = 100
  ): Promise<CandleData[]> {
    const response = await this.request(
      "GET",
      `/api/v1/market/candles?pair=${pair}&interval=${interval}&limit=${limit}`
    );
    const candles = (response.candles as Array<Record<string, number>>) || [];

    return candles.map((c) => ({
      timestamp: c.timestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));
  }

  // ============================================================================
  // Health & Utilities
  // ============================================================================

  /**
   * Check if the Hummingbot Dashboard is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.request("GET", "/health");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get dashboard status
   */
  async getStatus(): Promise<{
    version: string;
    botsRunning: number;
    totalPnl: number;
  }> {
    const response = await this.request("GET", "/api/v1/status");
    return {
      version: (response.version as string) || "unknown",
      botsRunning: (response.bots_running as number) || 0,
      totalPnl: (response.total_pnl as number) || 0,
    };
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private async request(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?: unknown
  ): Promise<Record<string, unknown>> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Hummingbot API error (${response.status}): ${errorText}`);
      }

      return (await response.json()) as Record<string, unknown>;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private parseBacktestStatus(response: Record<string, unknown>): BacktestStatus {
    return {
      runId: (response.id as string) || (response.run_id as string),
      state: this.mapBacktestState(response.status as string),
      progressPct: (response.progress as number) || 0,
      processedBars: (response.processed_bars as number) || 0,
      currentTime: (response.current_time as number) || 0,
      decisionCycle: (response.cycle as number) || 0,
      equity: (response.portfolio_value as number) || 0,
      unrealizedPnL: (response.unrealized_pnl as number) || 0,
      realizedPnL: (response.realized_pnl as number) || 0,
      note: response.message as string | undefined,
      lastError: response.error as string | undefined,
    };
  }

  private mapBacktestState(status: string): BacktestStatus["state"] {
    const stateMap: Record<string, BacktestStatus["state"]> = {
      pending: "created",
      running: "running",
      paused: "paused",
      completed: "completed",
      failed: "failed",
      stopped: "stopped",
    };
    return stateMap[status?.toLowerCase()] || "created";
  }

  private parseBotResponse(response: Record<string, unknown>): HummingbotBot {
    return {
      id: response.id as string,
      name: response.name as string,
      status: response.status as "running" | "stopped" | "error",
      strategy: response.strategy as string,
      exchange: response.exchange as string,
      tradingPair: response.trading_pair as string,
      pnl: (response.pnl as number) || 0,
      volume: (response.volume as number) || 0,
    };
  }
}
