/**
 * Backend Types - Shared type definitions for DonutLabs backend services
 *
 * This file contains types for:
 * - donut-agents-backend (AI trading agents)
 * - donut-backend (Solana DeFi operations)
 * - hummingbot-api (multi-exchange trading)
 */

import { z } from "zod";

// ============================================================================
// Common Types
// ============================================================================

/**
 * Backend identifiers for the three DonutLabs services
 */
export type BackendType = "donutAgents" | "donutBackend" | "hummingbot";

/**
 * Common pagination parameters
 */
export interface PaginationParams {
  limit?: number;
  offset?: number;
}

/**
 * Common API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ============================================================================
// Donut Agents Backend Types (port 8080)
// AI-powered trading agents with LLM decisions
// ============================================================================

/**
 * Trader status enum
 */
export type TraderStatus = "active" | "paused" | "stopped" | "error";

/**
 * Trader configuration
 */
export interface TraderConfig {
  /** Unique trader ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Trading strategy description */
  strategy: string;
  /** Maximum position size in USD */
  maxPositionSize: number;
  /** Risk tolerance (0-1) */
  riskTolerance: number;
  /** Trading pairs to monitor */
  tradingPairs: string[];
  /** Whether to auto-execute trades or require approval */
  autoExecute: boolean;
  /** Custom LLM prompt for decision making */
  customPrompt?: string;
}

/**
 * Trader instance with runtime state
 */
export interface Trader extends TraderConfig {
  status: TraderStatus;
  createdAt: string;
  updatedAt: string;
  lastDecisionAt?: string;
  totalTrades: number;
  totalPnl: number;
  winRate: number;
}

/**
 * Position held by a trader
 */
export interface AgentPosition {
  id: string;
  traderId: string;
  symbol: string;
  side: "long" | "short";
  size: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  leverage: number;
  openedAt: string;
  stopLoss?: number;
  takeProfit?: number;
}

/**
 * Trade executed by a trader
 */
export interface AgentTrade {
  id: string;
  traderId: string;
  symbol: string;
  side: "long" | "short";
  action: "open" | "close";
  size: number;
  price: number;
  fee: number;
  pnl?: number;
  timestamp: string;
  reasoning: string;
  confidence: number;
}

/**
 * AI decision made by a trader
 */
export interface AgentDecision {
  id: string;
  traderId: string;
  timestamp: string;
  action: "buy" | "sell" | "hold";
  symbol: string;
  confidence: number;
  reasoning: string;
  marketAnalysis: string;
  technicalSignals: Record<string, number>;
  sentimentScore?: number;
  executed: boolean;
  executedAt?: string;
}

/**
 * Trader performance analytics
 */
export interface TraderAnalytics {
  traderId: string;
  period: "24h" | "7d" | "30d" | "all";
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnl: number;
  avgPnlPerTrade: number;
  maxDrawdown: number;
  sharpeRatio: number;
  bestTrade: AgentTrade | null;
  worstTrade: AgentTrade | null;
  tradesBySymbol: Record<string, { count: number; pnl: number }>;
}

/**
 * Arena ranking for traders
 */
export interface ArenaRanking {
  rank: number;
  traderId: string;
  traderName: string;
  totalPnl: number;
  winRate: number;
  sharpeRatio: number;
  totalTrades: number;
  riskScore: number;
}

// ============================================================================
// Donut Backend Types (port 3000)
// Solana DeFi portfolio & transactions
// ============================================================================

/**
 * Wallet balance for a token
 */
export interface TokenBalance {
  mint: string;
  symbol: string;
  name: string;
  amount: number;
  decimals: number;
  usdValue: number;
  logoUri?: string;
}

/**
 * Complete portfolio state
 */
export interface Portfolio {
  walletAddress: string;
  totalValueUsd: number;
  solBalance: number;
  tokens: TokenBalance[];
  lastUpdated: string;
}

/**
 * Token metadata and price info
 */
export interface TokenInfo {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUri?: string;
  price: number;
  priceChange24h: number;
  volume24h: number;
  marketCap?: number;
  website?: string;
  twitter?: string;
}

/**
 * Jupiter swap quote
 */
export interface SwapQuote {
  inputMint: string;
  outputMint: string;
  inputAmount: number;
  outputAmount: number;
  priceImpact: number;
  fee: number;
  route: Array<{
    marketId: string;
    inputMint: string;
    outputMint: string;
  }>;
  expiresAt: string;
}

/**
 * Swap execution result
 */
export interface SwapResult {
  signature: string;
  inputMint: string;
  outputMint: string;
  inputAmount: number;
  outputAmount: number;
  fee: number;
  status: "pending" | "confirmed" | "failed";
  confirmedAt?: string;
  error?: string;
}

/**
 * Limit order configuration
 */
export interface LimitOrderConfig {
  inputMint: string;
  outputMint: string;
  inputAmount: number;
  targetPrice: number;
  expiresAt?: string;
}

/**
 * Active limit order
 */
export interface LimitOrder extends LimitOrderConfig {
  id: string;
  status: "pending" | "filled" | "cancelled" | "expired";
  createdAt: string;
  filledAt?: string;
  filledAmount?: number;
  filledPrice?: number;
}

/**
 * Guardrail configuration for risk management
 */
export interface Guardrail {
  id: string;
  name: string;
  type: "max_position" | "max_daily_loss" | "max_slippage" | "blacklist" | "whitelist";
  enabled: boolean;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Transaction history entry
 */
export interface Transaction {
  signature: string;
  type: "swap" | "transfer" | "stake" | "unstake" | "unknown";
  timestamp: string;
  status: "confirmed" | "failed";
  inputMint?: string;
  outputMint?: string;
  amount?: number;
  fee: number;
  description: string;
}

// ============================================================================
// Hummingbot API Types (port 8000)
// Multi-exchange trading & bot orchestration
// ============================================================================

/**
 * Exchange connector configuration
 */
export interface ConnectorConfig {
  name: string;
  type: "cex" | "dex";
  apiKey?: string;
  apiSecret?: string;
  subaccount?: string;
  testnet: boolean;
  status: "connected" | "disconnected" | "error";
}

/**
 * Account balance on an exchange
 */
export interface ExchangeBalance {
  connector: string;
  asset: string;
  free: number;
  locked: number;
  total: number;
  usdValue: number;
}

/**
 * Trading bot configuration
 */
export interface BotConfig {
  id: string;
  name: string;
  strategy: string;
  connector: string;
  tradingPair: string;
  config: Record<string, unknown>;
}

/**
 * Bot instance with runtime state
 */
export interface Bot extends BotConfig {
  status: "running" | "stopped" | "error";
  startedAt?: string;
  stoppedAt?: string;
  trades: number;
  pnl: number;
  volume: number;
}

/**
 * Order information
 */
export interface Order {
  id: string;
  connector: string;
  tradingPair: string;
  side: "buy" | "sell";
  type: "limit" | "market";
  amount: number;
  price?: number;
  status: "open" | "partial" | "filled" | "cancelled";
  filledAmount: number;
  avgPrice: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Market candle data
 */
export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Orderbook snapshot
 */
export interface Orderbook {
  connector: string;
  tradingPair: string;
  timestamp: number;
  bids: Array<[number, number]>; // [price, amount]
  asks: Array<[number, number]>;
}

// ============================================================================
// Zod Schemas for Validation
// ============================================================================

export const TraderStatusSchema = z.enum(["active", "paused", "stopped", "error"]);

export const TraderConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  strategy: z.string(),
  maxPositionSize: z.number().positive(),
  riskTolerance: z.number().min(0).max(1),
  tradingPairs: z.array(z.string()),
  autoExecute: z.boolean(),
  customPrompt: z.string().optional(),
});

export const AgentPositionSchema = z.object({
  id: z.string(),
  traderId: z.string(),
  symbol: z.string(),
  side: z.enum(["long", "short"]),
  size: z.number().positive(),
  entryPrice: z.number().positive(),
  currentPrice: z.number().positive(),
  unrealizedPnl: z.number(),
  unrealizedPnlPct: z.number(),
  leverage: z.number().min(1),
  openedAt: z.string(),
  stopLoss: z.number().optional(),
  takeProfit: z.number().optional(),
});

export const SwapQuoteSchema = z.object({
  inputMint: z.string(),
  outputMint: z.string(),
  inputAmount: z.number().positive(),
  outputAmount: z.number().positive(),
  priceImpact: z.number(),
  fee: z.number(),
  route: z.array(z.object({
    marketId: z.string(),
    inputMint: z.string(),
    outputMint: z.string(),
  })),
  expiresAt: z.string(),
});

export const OrderSchema = z.object({
  id: z.string(),
  connector: z.string(),
  tradingPair: z.string(),
  side: z.enum(["buy", "sell"]),
  type: z.enum(["limit", "market"]),
  amount: z.number().positive(),
  price: z.number().optional(),
  status: z.enum(["open", "partial", "filled", "cancelled"]),
  filledAmount: z.number(),
  avgPrice: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
