/**
 * HTTP client for nofx Go backtesting engine
 * Wraps the REST API exposed by /Users/chrizhuu/nofx/api/backtest.go
 */

import {
  BacktestConfig,
  BacktestStatus,
  BacktestMetrics,
  EquityPoint,
  TradeEvent,
} from "../core/types.js";

export interface NofxClientConfig {
  baseUrl: string;
  authToken?: string;
  timeout?: number;
}

export interface BacktestDecision {
  cycle: number;
  timestamp: number;
  decisions: Array<{
    action: string;
    symbol: string;
    side: string;
    quantity: number;
    leverage: number;
    confidence: number;
    reasoning: string;
  }>;
  systemPrompt?: string;
  userPrompt?: string;
  rawResponse?: string;
}

export interface BacktestRunMetadata {
  runId: string;
  userId?: string;
  label?: string;
  state: string;
  createdAt: string;
  symbols: string[];
  startTs: number;
  endTs: number;
}

/**
 * HTTP client for nofx backtesting API
 */
export class NofxClient {
  private baseUrl: string;
  private authToken?: string;
  private timeout: number;

  constructor(config: NofxClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ""); // Remove trailing slash
    this.authToken = config.authToken;
    this.timeout = config.timeout || 30000;
  }

  /**
   * Start a new backtest run
   */
  async startBacktest(config: BacktestConfig): Promise<BacktestStatus> {
    // Convert config to nofx API format
    const apiConfig = {
      run_id: config.runId || this.generateRunId(),
      symbols: config.symbols,
      timeframes: config.timeframes,
      decision_timeframe: config.decisionTimeframe,
      decision_cadence_nbars: config.decisionCadenceNBars,
      start_ts: config.startTs,
      end_ts: config.endTs,
      initial_balance: config.initialBalance,
      fee_bps: config.feeBps,
      slippage_bps: config.slippageBps,
      custom_prompt: config.customPrompt,
      cache_ai: config.cacheAi,
      replay_only: config.replayOnly,
      leverage: config.leverage
        ? {
            btc_eth_leverage: config.leverage.btcEthLeverage,
            altcoin_leverage: config.leverage.altcoinLeverage,
          }
        : undefined,
      ai: config.aiConfig
        ? {
            provider: config.aiConfig.provider,
            model: config.aiConfig.model,
            temperature: config.aiConfig.temperature,
          }
        : undefined,
    };

    const response = await this.request("POST", "/api/backtest/start", {
      config: apiConfig,
    });

    return this.parseStatus(response);
  }

  /**
   * Get status of a backtest run
   */
  async getStatus(runId: string): Promise<BacktestStatus> {
    const response = await this.request("GET", `/api/backtest/status?run_id=${runId}`);
    return this.parseStatus(response);
  }

  /**
   * Pause a running backtest
   */
  async pauseBacktest(runId: string): Promise<BacktestStatus> {
    const response = await this.request("POST", "/api/backtest/pause", { run_id: runId });
    return this.parseStatus(response);
  }

  /**
   * Resume a paused backtest
   */
  async resumeBacktest(runId: string): Promise<BacktestStatus> {
    const response = await this.request("POST", "/api/backtest/resume", { run_id: runId });
    return this.parseStatus(response);
  }

  /**
   * Stop a running backtest
   */
  async stopBacktest(runId: string): Promise<BacktestStatus> {
    const response = await this.request("POST", "/api/backtest/stop", { run_id: runId });
    return this.parseStatus(response);
  }

  /**
   * Get performance metrics for a completed backtest
   */
  async getMetrics(runId: string): Promise<BacktestMetrics> {
    const response = await this.request("GET", `/api/backtest/metrics?run_id=${runId}`);

    return {
      totalReturnPct: (response.total_return_pct as number) || 0,
      maxDrawdownPct: (response.max_drawdown_pct as number) || 0,
      sharpeRatio: (response.sharpe_ratio as number) || 0,
      profitFactor: (response.profit_factor as number) || 0,
      winRate: (response.win_rate as number) || 0,
      trades: (response.trades as number) || 0,
      avgWin: (response.avg_win as number) || 0,
      avgLoss: (response.avg_loss as number) || 0,
      bestSymbol: (response.best_symbol as string) || "",
      worstSymbol: (response.worst_symbol as string) || "",
      liquidated: (response.liquidated as boolean) || false,
      symbolStats: response.symbol_stats as BacktestMetrics["symbolStats"],
    };
  }

  /**
   * Get equity curve data
   */
  async getEquityCurve(
    runId: string,
    limit?: number,
    offset?: number
  ): Promise<EquityPoint[]> {
    let url = `/api/backtest/equity?run_id=${runId}`;
    if (limit) url += `&limit=${limit}`;
    if (offset) url += `&offset=${offset}`;

    const response = await this.request("GET", url);
    const points = (response.points as Array<Record<string, number>>) || [];

    return points.map((p) => ({
      timestamp: p.timestamp,
      equity: p.equity,
      available: p.available,
      pnl: p.pnl,
      pnlPct: p.pnl_pct,
      drawdownPct: p.drawdown_pct,
      cycle: p.cycle,
    }));
  }

  /**
   * Get trade history
   */
  async getTrades(
    runId: string,
    options?: { symbol?: string; side?: string; limit?: number }
  ): Promise<TradeEvent[]> {
    let url = `/api/backtest/trades?run_id=${runId}`;
    if (options?.symbol) url += `&symbol=${options.symbol}`;
    if (options?.side) url += `&side=${options.side}`;
    if (options?.limit) url += `&limit=${options.limit}`;

    const response = await this.request("GET", url);
    const trades = (response.trades as Array<Record<string, unknown>>) || [];

    return trades.map((t) => ({
      timestamp: t.timestamp as number,
      symbol: t.symbol as string,
      action: t.action as "open" | "close",
      side: t.side as "long" | "short",
      quantity: t.quantity as number,
      price: t.price as number,
      fee: t.fee as number,
      slippage: t.slippage as number,
      orderValue: t.order_value as number,
      realizedPnL: t.realized_pnl as number | undefined,
      leverage: t.leverage as number,
      cycle: t.cycle as number,
      liquidationFlag: (t.liquidation_flag as boolean) || false,
      note: t.note as string | undefined,
    }));
  }

  /**
   * Get AI decision history
   */
  async getDecisions(
    runId: string,
    options?: { cycle?: number; limit?: number }
  ): Promise<BacktestDecision[]> {
    let url = `/api/backtest/decisions?run_id=${runId}`;
    if (options?.cycle) url += `&cycle=${options.cycle}`;
    if (options?.limit) url += `&limit=${options.limit}`;

    const response = await this.request("GET", url);
    const decisions = (response.decisions as Array<Record<string, unknown>>) || [];

    return decisions.map((d) => ({
      cycle: d.cycle as number,
      timestamp: d.timestamp as number,
      decisions: d.decisions as BacktestDecision["decisions"],
      systemPrompt: d.system_prompt as string | undefined,
      userPrompt: d.user_prompt as string | undefined,
      rawResponse: d.raw_response as string | undefined,
    }));
  }

  /**
   * List all backtest runs
   */
  async listRuns(options?: {
    userId?: string;
    state?: string;
    limit?: number;
  }): Promise<BacktestRunMetadata[]> {
    let url = "/api/backtest/runs?";
    if (options?.userId) url += `user_id=${options.userId}&`;
    if (options?.state) url += `state=${options.state}&`;
    if (options?.limit) url += `limit=${options.limit}&`;

    const response = await this.request("GET", url);
    const runs = (response.runs as Array<Record<string, unknown>>) || [];

    return runs.map((r) => ({
      runId: r.run_id as string,
      userId: r.user_id as string | undefined,
      label: r.label as string | undefined,
      state: r.state as string,
      createdAt: r.created_at as string,
      symbols: r.symbols as string[],
      startTs: r.start_ts as number,
      endTs: r.end_ts as number,
    }));
  }

  /**
   * Set label for a backtest run
   */
  async setLabel(runId: string, label: string): Promise<void> {
    await this.request("POST", "/api/backtest/label", { run_id: runId, label });
  }

  /**
   * Delete a backtest run
   */
  async deleteRun(runId: string): Promise<void> {
    await this.request("POST", "/api/backtest/delete", { run_id: runId });
  }

  /**
   * Export backtest results
   */
  async exportResults(runId: string): Promise<Record<string, unknown>> {
    return this.request("GET", `/api/backtest/export?run_id=${runId}`);
  }

  /**
   * Check if the nofx server is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.request("GET", "/health");
      return true;
    } catch {
      return false;
    }
  }

  // Private helpers

  private async request(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?: unknown
  ): Promise<Record<string, unknown>> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.authToken) {
      headers["Authorization"] = `Bearer ${this.authToken}`;
    }

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
        throw new Error(`nofx API error (${response.status}): ${errorText}`);
      }

      return (await response.json()) as Record<string, unknown>;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private parseStatus(response: Record<string, unknown>): BacktestStatus {
    return {
      runId: response.run_id as string,
      state: response.state as BacktestStatus["state"],
      progressPct: (response.progress_pct as number) || 0,
      processedBars: (response.processed_bars as number) || 0,
      currentTime: (response.current_time as number) || 0,
      decisionCycle: (response.decision_cycle as number) || 0,
      equity: (response.equity as number) || 0,
      unrealizedPnL: (response.unrealized_pnl as number) || 0,
      realizedPnL: (response.realized_pnl as number) || 0,
      note: response.note as string | undefined,
      lastError: response.last_error as string | undefined,
      lastUpdatedIso: response.last_updated_iso as string | undefined,
    };
  }

  private generateRunId(): string {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "");
    const timeStr = date.toISOString().slice(11, 19).replace(/:/g, "");
    return `bt_${dateStr}_${timeStr}`;
  }
}
