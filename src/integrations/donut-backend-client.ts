/**
 * HTTP client for Donut Backend
 *
 * Provides access to Solana DeFi operations including:
 * - Portfolio management and token balances
 * - Jupiter DEX swaps and limit orders
 * - Token lookup and metadata
 * - Risk guardrails configuration
 *
 * API runs on port 3000 with JWT Bearer authentication.
 */

import { AuthenticatedHttpClient, AuthenticatedClientConfig } from "./base-client.js";
import {
  Portfolio,
  TokenBalance,
  TokenInfo,
  SwapQuote,
  SwapResult,
  LimitOrder,
  LimitOrderConfig,
  Guardrail,
  Transaction,
  PaginationParams,
} from "../core/backend-types.js";

// ============================================================================
// Types
// ============================================================================

export interface DonutBackendClientConfig extends AuthenticatedClientConfig {
  /** Base URL (default: http://localhost:3000) */
  baseUrl: string;
  /** JWT Bearer token for authentication */
  authToken?: string;
}

/**
 * Swap quote request
 */
export interface GetSwapQuoteRequest {
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps?: number;
}

/**
 * Execute swap request
 */
export interface ExecuteSwapRequest {
  quoteId?: string;
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps?: number;
  priorityFee?: number;
}

/**
 * Create limit order request
 */
export interface CreateLimitOrderRequest {
  inputMint: string;
  outputMint: string;
  inputAmount: number;
  targetPrice: number;
  expiresInSeconds?: number;
}

/**
 * Create guardrail request
 */
export interface CreateGuardrailRequest {
  name: string;
  type: "max_position" | "max_daily_loss" | "max_slippage" | "blacklist" | "whitelist";
  enabled?: boolean;
  config: Record<string, unknown>;
}

// ============================================================================
// Client Implementation
// ============================================================================

/**
 * HTTP client for Donut Backend API
 */
export class DonutBackendClient extends AuthenticatedHttpClient {
  constructor(config: DonutBackendClientConfig) {
    super(config);
  }

  protected getClientName(): string {
    return "DonutBackend";
  }

  // ============================================================================
  // Portfolio Management
  // ============================================================================

  /**
   * Get portfolio for a wallet address
   */
  async getPortfolio(walletAddress?: string): Promise<Portfolio> {
    const path = walletAddress
      ? `/api/v1/portfolio/${walletAddress}`
      : "/api/v1/portfolio";
    return this.get<Portfolio>(path);
  }

  /**
   * Get token balances for a wallet
   */
  async getTokenBalances(walletAddress?: string): Promise<TokenBalance[]> {
    const portfolio = await this.getPortfolio(walletAddress);
    return portfolio.tokens;
  }

  /**
   * Get SOL balance for a wallet
   */
  async getSolBalance(walletAddress?: string): Promise<number> {
    const portfolio = await this.getPortfolio(walletAddress);
    return portfolio.solBalance;
  }

  /**
   * Refresh portfolio data (force re-fetch from chain)
   */
  async refreshPortfolio(walletAddress?: string): Promise<Portfolio> {
    const path = walletAddress
      ? `/api/v1/portfolio/${walletAddress}/refresh`
      : "/api/v1/portfolio/refresh";
    return this.post<Portfolio>(path);
  }

  // ============================================================================
  // Token Lookup
  // ============================================================================

  /**
   * Get token information by mint address
   */
  async getTokenInfo(mint: string): Promise<TokenInfo> {
    return this.get<TokenInfo>(`/api/v1/tokens/${mint}`);
  }

  /**
   * Search for tokens by symbol or name
   */
  async searchTokens(query: string, limit?: number): Promise<TokenInfo[]> {
    const response = await this.get<{ tokens: TokenInfo[] }>("/api/v1/tokens/search", {
      params: { q: query, limit: limit || 10 },
    });
    return response.tokens || [];
  }

  /**
   * Get trending tokens
   */
  async getTrendingTokens(limit?: number): Promise<TokenInfo[]> {
    const response = await this.get<{ tokens: TokenInfo[] }>("/api/v1/tokens/trending", {
      params: { limit: limit || 20 },
    });
    return response.tokens || [];
  }

  /**
   * Get token price
   */
  async getTokenPrice(mint: string): Promise<{ price: number; change24h: number }> {
    return this.get(`/api/v1/tokens/${mint}/price`);
  }

  // ============================================================================
  // Jupiter Swaps
  // ============================================================================

  /**
   * Get a swap quote from Jupiter
   */
  async getSwapQuote(request: GetSwapQuoteRequest): Promise<SwapQuote> {
    return this.post<SwapQuote>("/api/v1/swap/quote", {
      input_mint: request.inputMint,
      output_mint: request.outputMint,
      amount: request.amount,
      slippage_bps: request.slippageBps || 50, // Default 0.5%
    });
  }

  /**
   * Execute a swap via Jupiter
   */
  async executeSwap(request: ExecuteSwapRequest): Promise<SwapResult> {
    return this.post<SwapResult>("/api/v1/swap/execute", {
      quote_id: request.quoteId,
      input_mint: request.inputMint,
      output_mint: request.outputMint,
      amount: request.amount,
      slippage_bps: request.slippageBps || 50,
      priority_fee: request.priorityFee,
    });
  }

  /**
   * Get swap history
   */
  async getSwapHistory(params?: PaginationParams): Promise<SwapResult[]> {
    const response = await this.get<{ swaps: SwapResult[] }>("/api/v1/swap/history", {
      params: params as Record<string, string | number | boolean>,
    });
    return response.swaps || [];
  }

  // ============================================================================
  // Limit Orders
  // ============================================================================

  /**
   * Create a limit order
   */
  async createLimitOrder(request: CreateLimitOrderRequest): Promise<LimitOrder> {
    return this.post<LimitOrder>("/api/v1/orders/limit", {
      input_mint: request.inputMint,
      output_mint: request.outputMint,
      input_amount: request.inputAmount,
      target_price: request.targetPrice,
      expires_in_seconds: request.expiresInSeconds,
    });
  }

  /**
   * Get all active limit orders
   */
  async getLimitOrders(params?: PaginationParams): Promise<LimitOrder[]> {
    const response = await this.get<{ orders: LimitOrder[] }>("/api/v1/orders/limit", {
      params: params as Record<string, string | number | boolean>,
    });
    return response.orders || [];
  }

  /**
   * Get a specific limit order
   */
  async getLimitOrder(orderId: string): Promise<LimitOrder> {
    return this.get<LimitOrder>(`/api/v1/orders/limit/${orderId}`);
  }

  /**
   * Cancel a limit order
   */
  async cancelLimitOrder(orderId: string): Promise<LimitOrder> {
    return this.post<LimitOrder>(`/api/v1/orders/limit/${orderId}/cancel`);
  }

  /**
   * Cancel all active limit orders
   */
  async cancelAllLimitOrders(): Promise<{ cancelled: number }> {
    return this.post("/api/v1/orders/limit/cancel-all");
  }

  // ============================================================================
  // Guardrails (Risk Management)
  // ============================================================================

  /**
   * List all guardrails
   */
  async listGuardrails(): Promise<Guardrail[]> {
    const response = await this.get<{ guardrails: Guardrail[] }>("/api/v1/guardrails");
    return response.guardrails || [];
  }

  /**
   * Get a specific guardrail
   */
  async getGuardrail(guardrailId: string): Promise<Guardrail> {
    return this.get<Guardrail>(`/api/v1/guardrails/${guardrailId}`);
  }

  /**
   * Create a new guardrail
   */
  async createGuardrail(request: CreateGuardrailRequest): Promise<Guardrail> {
    return this.post<Guardrail>("/api/v1/guardrails", {
      name: request.name,
      type: request.type,
      enabled: request.enabled ?? true,
      config: request.config,
    });
  }

  /**
   * Update a guardrail
   */
  async updateGuardrail(
    guardrailId: string,
    updates: Partial<CreateGuardrailRequest>
  ): Promise<Guardrail> {
    return this.put<Guardrail>(`/api/v1/guardrails/${guardrailId}`, updates);
  }

  /**
   * Delete a guardrail
   */
  async deleteGuardrail(guardrailId: string): Promise<void> {
    await this.delete(`/api/v1/guardrails/${guardrailId}`);
  }

  /**
   * Enable or disable a guardrail
   */
  async setGuardrailEnabled(guardrailId: string, enabled: boolean): Promise<Guardrail> {
    return this.put<Guardrail>(`/api/v1/guardrails/${guardrailId}`, { enabled });
  }

  // ============================================================================
  // Transaction History
  // ============================================================================

  /**
   * Get transaction history
   */
  async getTransactions(
    params?: PaginationParams & { type?: string }
  ): Promise<Transaction[]> {
    const response = await this.get<{ transactions: Transaction[] }>(
      "/api/v1/transactions",
      { params: params as Record<string, string | number | boolean> }
    );
    return response.transactions || [];
  }

  /**
   * Get a specific transaction by signature
   */
  async getTransaction(signature: string): Promise<Transaction> {
    return this.get<Transaction>(`/api/v1/transactions/${signature}`);
  }

  // ============================================================================
  // Wallet Management
  // ============================================================================

  /**
   * Get connected wallet address
   */
  async getWalletAddress(): Promise<string> {
    const response = await this.get<{ address: string }>("/api/v1/wallet");
    return response.address;
  }

  /**
   * Check if wallet is connected
   */
  async isWalletConnected(): Promise<boolean> {
    try {
      await this.getWalletAddress();
      return true;
    } catch {
      return false;
    }
  }

  // ============================================================================
  // Health Check
  // ============================================================================

  /**
   * Check if the Donut Backend is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.get("/health");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get backend status including coordination state
   */
  async getStatus(): Promise<{
    healthy: boolean;
    version: string;
    walletConnected: boolean;
    guardrailsActive: number;
  }> {
    return this.get("/api/v1/status");
  }
}
