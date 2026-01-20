/**
 * HTTP client for Donut Agents Backend
 *
 * Provides access to AI-powered trading agents with LLM decision-making.
 * API runs on port 8080 with JWT Bearer authentication.
 *
 * Features:
 * - Trader lifecycle management (create, start, stop, pause)
 * - Position and trade tracking
 * - AI decision logs and analytics
 * - Arena rankings for performance comparison
 */

import { AuthenticatedHttpClient, AuthenticatedClientConfig } from "./base-client.js";
import {
  Trader,
  TraderConfig,
  TraderStatus,
  AgentPosition,
  AgentTrade,
  AgentDecision,
  TraderAnalytics,
  ArenaRanking,
  PaginationParams,
} from "../core/backend-types.js";

// ============================================================================
// Types
// ============================================================================

export interface DonutAgentsClientConfig extends AuthenticatedClientConfig {
  /** Base URL (default: http://localhost:8080) */
  baseUrl: string;
  /** JWT Bearer token for authentication */
  authToken?: string;
}

/**
 * Create trader request
 */
export interface CreateTraderRequest {
  name: string;
  strategy: string;
  maxPositionSize: number;
  riskTolerance: number;
  tradingPairs: string[];
  autoExecute?: boolean;
  customPrompt?: string;
}

/**
 * Update trader request
 */
export interface UpdateTraderRequest {
  name?: string;
  strategy?: string;
  maxPositionSize?: number;
  riskTolerance?: number;
  tradingPairs?: string[];
  autoExecute?: boolean;
  customPrompt?: string;
}

/**
 * Trader control action
 */
export type TraderAction = "start" | "pause" | "stop" | "resume";

// ============================================================================
// Client Implementation
// ============================================================================

/**
 * HTTP client for Donut Agents Backend API
 */
export class DonutAgentsClient extends AuthenticatedHttpClient {
  constructor(config: DonutAgentsClientConfig) {
    super(config);
  }

  protected getClientName(): string {
    return "DonutAgents";
  }

  // ============================================================================
  // Trader Management
  // ============================================================================

  /**
   * List all traders
   */
  async listTraders(params?: PaginationParams): Promise<Trader[]> {
    const response = await this.get<{ traders: Trader[] }>("/api/v1/traders", {
      params: params as Record<string, string | number | boolean>,
    });
    return response.traders || [];
  }

  /**
   * Get a specific trader by ID
   */
  async getTrader(traderId: string): Promise<Trader> {
    return this.get<Trader>(`/api/v1/traders/${traderId}`);
  }

  /**
   * Create a new AI trading agent
   */
  async createTrader(request: CreateTraderRequest): Promise<Trader> {
    return this.post<Trader>("/api/v1/traders", {
      name: request.name,
      strategy: request.strategy,
      max_position_size: request.maxPositionSize,
      risk_tolerance: request.riskTolerance,
      trading_pairs: request.tradingPairs,
      auto_execute: request.autoExecute ?? false,
      custom_prompt: request.customPrompt,
    });
  }

  /**
   * Update an existing trader
   */
  async updateTrader(traderId: string, request: UpdateTraderRequest): Promise<Trader> {
    const body: Record<string, unknown> = {};

    if (request.name !== undefined) body.name = request.name;
    if (request.strategy !== undefined) body.strategy = request.strategy;
    if (request.maxPositionSize !== undefined) body.max_position_size = request.maxPositionSize;
    if (request.riskTolerance !== undefined) body.risk_tolerance = request.riskTolerance;
    if (request.tradingPairs !== undefined) body.trading_pairs = request.tradingPairs;
    if (request.autoExecute !== undefined) body.auto_execute = request.autoExecute;
    if (request.customPrompt !== undefined) body.custom_prompt = request.customPrompt;

    return this.put<Trader>(`/api/v1/traders/${traderId}`, body);
  }

  /**
   * Delete a trader
   */
  async deleteTrader(traderId: string): Promise<void> {
    await this.delete(`/api/v1/traders/${traderId}`);
  }

  /**
   * Control a trader (start, pause, stop, resume)
   */
  async controlTrader(traderId: string, action: TraderAction): Promise<Trader> {
    return this.post<Trader>(`/api/v1/traders/${traderId}/${action}`);
  }

  /**
   * Get trader status
   */
  async getTraderStatus(traderId: string): Promise<TraderStatus> {
    const trader = await this.getTrader(traderId);
    return trader.status;
  }

  // ============================================================================
  // Position Management
  // ============================================================================

  /**
   * Get all positions for a trader
   */
  async getPositions(traderId: string): Promise<AgentPosition[]> {
    const response = await this.get<{ positions: AgentPosition[] }>(
      `/api/v1/traders/${traderId}/positions`
    );
    return response.positions || [];
  }

  /**
   * Get a specific position
   */
  async getPosition(traderId: string, positionId: string): Promise<AgentPosition> {
    return this.get<AgentPosition>(
      `/api/v1/traders/${traderId}/positions/${positionId}`
    );
  }

  /**
   * Close a position
   */
  async closePosition(traderId: string, positionId: string): Promise<AgentTrade> {
    return this.post<AgentTrade>(
      `/api/v1/traders/${traderId}/positions/${positionId}/close`
    );
  }

  /**
   * Close all positions for a trader
   */
  async closeAllPositions(traderId: string): Promise<AgentTrade[]> {
    const response = await this.post<{ trades: AgentTrade[] }>(
      `/api/v1/traders/${traderId}/positions/close-all`
    );
    return response.trades || [];
  }

  // ============================================================================
  // Trade History
  // ============================================================================

  /**
   * Get trade history for a trader
   */
  async getTrades(
    traderId: string,
    params?: PaginationParams & { symbol?: string; side?: "long" | "short" }
  ): Promise<AgentTrade[]> {
    const response = await this.get<{ trades: AgentTrade[] }>(
      `/api/v1/traders/${traderId}/trades`,
      { params: params as Record<string, string | number | boolean> }
    );
    return response.trades || [];
  }

  /**
   * Get a specific trade
   */
  async getTrade(traderId: string, tradeId: string): Promise<AgentTrade> {
    return this.get<AgentTrade>(`/api/v1/traders/${traderId}/trades/${tradeId}`);
  }

  // ============================================================================
  // AI Decision Logs
  // ============================================================================

  /**
   * Get decision history for a trader
   */
  async getDecisions(
    traderId: string,
    params?: PaginationParams & { executed?: boolean }
  ): Promise<AgentDecision[]> {
    const response = await this.get<{ decisions: AgentDecision[] }>(
      `/api/v1/traders/${traderId}/decisions`,
      { params: params as Record<string, string | number | boolean> }
    );
    return response.decisions || [];
  }

  /**
   * Get a specific decision
   */
  async getDecision(traderId: string, decisionId: string): Promise<AgentDecision> {
    return this.get<AgentDecision>(
      `/api/v1/traders/${traderId}/decisions/${decisionId}`
    );
  }

  /**
   * Get the latest decision for a trader
   */
  async getLatestDecision(traderId: string): Promise<AgentDecision | null> {
    const decisions = await this.getDecisions(traderId, { limit: 1 });
    return decisions[0] || null;
  }

  // ============================================================================
  // Analytics
  // ============================================================================

  /**
   * Get performance analytics for a trader
   */
  async getAnalytics(
    traderId: string,
    period: "24h" | "7d" | "30d" | "all" = "7d"
  ): Promise<TraderAnalytics> {
    return this.get<TraderAnalytics>(
      `/api/v1/traders/${traderId}/analytics`,
      { params: { period } }
    );
  }

  /**
   * Get aggregated analytics across all traders
   */
  async getAggregatedAnalytics(
    period: "24h" | "7d" | "30d" | "all" = "7d"
  ): Promise<{
    totalTraders: number;
    activeTraders: number;
    totalPnl: number;
    avgWinRate: number;
    totalTrades: number;
  }> {
    return this.get(`/api/v1/analytics/aggregate`, { params: { period } });
  }

  // ============================================================================
  // Arena Rankings
  // ============================================================================

  /**
   * Get arena rankings (leaderboard)
   */
  async getArenaRankings(
    params?: PaginationParams & { period?: "24h" | "7d" | "30d" | "all" }
  ): Promise<ArenaRanking[]> {
    const response = await this.get<{ rankings: ArenaRanking[] }>(
      "/api/v1/arena/rankings",
      { params: params as Record<string, string | number | boolean> }
    );
    return response.rankings || [];
  }

  /**
   * Get a specific trader's arena rank
   */
  async getTraderRank(traderId: string): Promise<ArenaRanking> {
    return this.get<ArenaRanking>(`/api/v1/arena/rankings/${traderId}`);
  }

  // ============================================================================
  // Health Check
  // ============================================================================

  /**
   * Check if the Donut Agents backend is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.get("/health");
      return true;
    } catch {
      return false;
    }
  }
}
