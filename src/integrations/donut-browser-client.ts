/**
 * Donut Browser Client - Exchange API integration
 *
 * HTTP client for the Donut Browser service that provides unified access
 * to exchange APIs for wallet, positions, orders, and market data.
 */

import { AuthenticatedHttpClient, AuthenticatedClientConfig } from "./base-client.js";
import { Position, TradeOrder, TradeResult } from "../core/types.js";

// ============================================================================
// Types
// ============================================================================

export interface DonutBrowserConfig {
  baseUrl: string;
  authToken?: string;
  timeout?: number;
}

export interface WalletInfo {
  totalEquity: number;
  availableBalance: number;
  usedMargin: number;
  unrealizedPnl: number;
  marginLevel: number;
  currency: string;
}

export interface Balance {
  asset: string;
  free: number;
  locked: number;
  total: number;
}

export interface BalancesResponse {
  balances: Balance[];
}

export interface PositionsResponse {
  positions: Position[];
}

export interface TradePreview {
  symbol: string;
  side: "long" | "short";
  quantity: number;
  estimatedPrice: number;
  estimatedCost: number;
  estimatedFee: number;
  margin: number;
  liquidationPrice: number;
  leverage: number;
  valid: boolean;
  warnings: string[];
}

export interface ExecuteTradeRequest {
  symbol: string;
  side: "long" | "short";
  quantity: number;
  leverage: number;
  orderType: "market" | "limit";
  limitPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  clientOrderId?: string;
}

export interface ExecuteTradeResponse {
  orderId: string;
  clientOrderId?: string;
  symbol: string;
  side: "long" | "short";
  quantity: number;
  executedPrice: number;
  fee: number;
  status: "pending" | "filled" | "partial" | "cancelled" | "failed";
  timestamp: number;
  stopLossOrderId?: string;
  takeProfitOrderId?: string;
  error?: string;
}

export interface ModifyPositionRequest {
  action: "modify";
  stopLoss?: number;
  takeProfit?: number;
}

export interface ModifyPositionResponse {
  success: boolean;
  symbol: string;
  stopLoss?: number;
  takeProfit?: number;
  message: string;
}

export interface ClosePositionResponse {
  orderId: string;
  symbol: string;
  side: "long" | "short";
  quantity: number;
  executedPrice: number;
  fee: number;
  realizedPnl: number;
  status: string;
  timestamp: number;
}

export interface CloseAllPositionsResponse {
  closedPositions: Array<{
    symbol: string;
    realizedPnl: number;
    status: string;
  }>;
  totalRealizedPnl: number;
}

export interface TransactionStatus {
  orderId: string;
  clientOrderId?: string;
  symbol: string;
  status: "pending" | "filled" | "partial" | "cancelled" | "failed";
  side: "long" | "short";
  quantity: number;
  executedQuantity: number;
  executedPrice: number;
  fee: number;
  timestamp: number;
  fills: Array<{
    price: number;
    quantity: number;
    fee: number;
    timestamp: number;
  }>;
}

export interface PriceData {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  timestamp: number;
}

export interface OrderBook {
  symbol: string;
  bids: Array<[number, number]>; // [price, quantity]
  asks: Array<[number, number]>;
  timestamp: number;
}

export interface HealthStatus {
  status: "ok" | "degraded" | "error";
  version: string;
  exchange: string;
  connected: boolean;
  timestamp: string;
}

// ============================================================================
// Client Implementation
// ============================================================================

/**
 * Donut Browser API Client
 *
 * Provides methods to interact with the Donut Browser service for
 * unified exchange access.
 */
export class DonutBrowserClient extends AuthenticatedHttpClient {
  constructor(config: DonutBrowserConfig) {
    const clientConfig: AuthenticatedClientConfig = {
      baseUrl: config.baseUrl,
      authToken: config.authToken,
      timeout: config.timeout ?? 30000,
    };
    super(clientConfig);
  }

  protected getClientName(): string {
    return "DonutBrowser";
  }

  // =========================================================================
  // Health
  // =========================================================================

  /**
   * Check service health and connectivity
   */
  async getHealth(): Promise<HealthStatus> {
    return this.get<HealthStatus>("/health");
  }

  // =========================================================================
  // Wallet
  // =========================================================================

  /**
   * Get wallet overview (equity, margin, P&L)
   */
  async getWallet(): Promise<WalletInfo> {
    return this.get<WalletInfo>("/wallet");
  }

  /**
   * Get all asset balances
   */
  async getBalances(): Promise<Balance[]> {
    const response = await this.get<BalancesResponse>("/balances");
    return response.balances;
  }

  // =========================================================================
  // Positions
  // =========================================================================

  /**
   * Get all open positions
   */
  async getPositions(): Promise<Position[]> {
    const response = await this.get<PositionsResponse>("/positions");
    return response.positions;
  }

  /**
   * Get position for a specific symbol
   */
  async getPosition(symbol: string): Promise<Position | null> {
    try {
      const response = await this.get<{ position: Position }>(`/positions/${symbol}`);
      return response.position;
    } catch (error: unknown) {
      // Return null if position not found
      if (error && typeof error === "object" && "statusCode" in error) {
        const apiError = error as { statusCode?: number };
        if (apiError.statusCode === 404) {
          return null;
        }
      }
      throw error;
    }
  }

  // =========================================================================
  // Orders
  // =========================================================================

  /**
   * Preview a trade without execution
   */
  async previewTrade(order: Omit<ExecuteTradeRequest, "clientOrderId">): Promise<TradePreview> {
    return this.post<TradePreview>("/orders/preview", order);
  }

  /**
   * Execute a trade
   */
  async executeTrade(order: ExecuteTradeRequest): Promise<ExecuteTradeResponse> {
    return this.post<ExecuteTradeResponse>("/orders/execute", order);
  }

  /**
   * Modify an existing position (stop loss, take profit)
   */
  async modifyPosition(symbol: string, modification: ModifyPositionRequest): Promise<ModifyPositionResponse> {
    return this.request<ModifyPositionResponse>("PATCH", `/positions/${symbol}`, modification);
  }

  /**
   * Close a position (full or partial)
   */
  async closePosition(symbol: string, quantity?: number): Promise<ClosePositionResponse> {
    const params = quantity ? { quantity: quantity.toString() } : undefined;
    return this.delete<ClosePositionResponse>(`/positions/${symbol}`, { params });
  }

  /**
   * Close all positions
   */
  async closeAllPositions(): Promise<CloseAllPositionsResponse> {
    return this.delete<CloseAllPositionsResponse>("/positions");
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string): Promise<{ orderId: string; status: string; message: string }> {
    return this.delete(`/orders/${orderId}`);
  }

  // =========================================================================
  // Transactions
  // =========================================================================

  /**
   * Get transaction/order status
   */
  async getTransactionStatus(orderId: string): Promise<TransactionStatus> {
    return this.get<TransactionStatus>(`/transactions/${orderId}`);
  }

  // =========================================================================
  // Market Data
  // =========================================================================

  /**
   * Get current price for a symbol
   */
  async getCurrentPrice(symbol: string): Promise<PriceData> {
    return this.get<PriceData>(`/prices/${symbol}`);
  }

  /**
   * Get order book for a symbol
   */
  async getOrderBook(symbol: string, limit: number = 10): Promise<OrderBook> {
    return this.get<OrderBook>(`/orderbook/${symbol}`, { params: { limit } });
  }

  // =========================================================================
  // Utility Methods
  // =========================================================================

  /**
   * Convert internal TradeOrder to ExecuteTradeRequest
   */
  static toExecuteRequest(order: TradeOrder, clientOrderId?: string): ExecuteTradeRequest {
    return {
      symbol: order.symbol,
      side: order.side,
      quantity: order.quantity,
      leverage: order.leverage,
      orderType: order.orderType,
      limitPrice: order.limitPrice,
      stopLoss: order.stopLoss,
      takeProfit: order.takeProfit,
      clientOrderId,
    };
  }

  /**
   * Convert ExecuteTradeResponse to internal TradeResult
   */
  static toTradeResult(response: ExecuteTradeResponse): TradeResult {
    return {
      orderId: response.orderId,
      symbol: response.symbol as `${string}USDT`,
      side: response.side,
      quantity: response.quantity,
      executedPrice: response.executedPrice,
      fee: response.fee,
      status: response.status,
      timestamp: response.timestamp,
      error: response.error,
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

let clientInstance: DonutBrowserClient | null = null;

/**
 * Create or get the Donut Browser client instance
 */
export function getDonutBrowserClient(config?: DonutBrowserConfig): DonutBrowserClient | null {
  if (clientInstance) {
    return clientInstance;
  }

  // Try to create from environment
  const baseUrl = config?.baseUrl || process.env.DONUT_BROWSER_URL;
  const authToken = config?.authToken || process.env.DONUT_BROWSER_TOKEN;

  if (!baseUrl) {
    return null;
  }

  clientInstance = new DonutBrowserClient({
    baseUrl,
    authToken,
    timeout: config?.timeout,
  });

  return clientInstance;
}

/**
 * Check if Donut Browser is configured
 */
export function isDonutBrowserConfigured(): boolean {
  return !!process.env.DONUT_BROWSER_URL;
}
