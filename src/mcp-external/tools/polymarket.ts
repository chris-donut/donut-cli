/**
 * Polymarket Prediction Markets Integration
 *
 * Provides prediction market trading on Polymarket via CLOB API.
 * Security: API keys loaded only at execution time, never logged or cached.
 */

import { ClobClient } from "@polymarket/clob-client";
import { Chain, Side, OrderType } from "@polymarket/clob-client";
import { Wallet } from "@ethersproject/wallet";

// Polymarket API endpoints
const CLOB_HOST = "https://clob.polymarket.com";
const GAMMA_HOST = "https://gamma-api.polymarket.com";

// Cached client instances
let clobClient: ClobClient | null = null;
let readOnlyClient: ClobClient | null = null;

// ============================================================================
// Types
// ============================================================================

export interface PMMarket {
  conditionId: string;
  questionId: string;
  question: string;
  slug: string;
  volume: string;
  volume24hr: string;
  liquidity: string;
  startDate: string;
  endDate: string;
  outcomes: string[];
  tokens: Array<{
    tokenId: string;
    outcome: string;
    price: number;
  }>;
  status: string;
}

export interface PMMarketsResult {
  success: boolean;
  markets?: PMMarket[];
  count?: number;
  error?: string;
}

export interface PMOrderResult {
  success: boolean;
  orderId?: string;
  market?: string;
  side?: string;
  outcome?: string;
  size?: string;
  price?: string;
  status?: string;
  error?: string;
}

export interface PMBalanceResult {
  success: boolean;
  connected: boolean;
  address?: string;
  usdcBalance?: string;
  positions?: Array<{
    market: string;
    outcome: string;
    size: string;
    avgPrice: string;
    value: string;
  }>;
  error?: string;
}

// ============================================================================
// Credential Management
// ============================================================================

interface PolymarketCreds {
  privateKey: string;
  apiKey?: string;
  secret?: string;
  passphrase?: string;
}

/**
 * Load credentials from environment
 * SECURITY: Credentials are never logged or cached beyond the client instance
 */
function loadCredentials(): PolymarketCreds | null {
  const privateKey = process.env.POLYGON_PRIVATE_KEY;
  if (!privateKey) {
    return null;
  }

  return {
    privateKey,
    apiKey: process.env.POLYMARKET_API_KEY,
    secret: process.env.POLYMARKET_SECRET,
    passphrase: process.env.POLYMARKET_PASSPHRASE,
  };
}

/**
 * Get read-only CLOB client (no auth required)
 */
function getReadOnlyClient(): ClobClient {
  if (!readOnlyClient) {
    readOnlyClient = new ClobClient(CLOB_HOST, Chain.POLYGON);
  }
  return readOnlyClient;
}

/**
 * Get authenticated CLOB client
 */
async function getAuthenticatedClient(): Promise<ClobClient | null> {
  if (clobClient) {
    return clobClient;
  }

  const creds = loadCredentials();
  if (!creds) {
    return null;
  }

  try {
    // Format private key
    const formattedKey = creds.privateKey.startsWith("0x")
      ? creds.privateKey
      : `0x${creds.privateKey}`;

    const wallet = new Wallet(formattedKey);

    // Check if we have API credentials for L2 auth
    if (creds.apiKey && creds.secret && creds.passphrase) {
      clobClient = new ClobClient(
        CLOB_HOST,
        Chain.POLYGON,
        wallet,
        {
          key: creds.apiKey,
          secret: creds.secret,
          passphrase: creds.passphrase,
        }
      );
    } else {
      // L1 auth only - will need to derive API keys
      clobClient = new ClobClient(CLOB_HOST, Chain.POLYGON, wallet);

      // Derive API keys if not provided
      const apiCreds = await clobClient.deriveApiKey();

      // Create new client with full L2 auth
      clobClient = new ClobClient(
        CLOB_HOST,
        Chain.POLYGON,
        wallet,
        apiCreds
      );
    }

    return clobClient;
  } catch (error) {
    console.error("Failed to create Polymarket client:", error);
    return null;
  }
}

// ============================================================================
// Gamma API Functions (Market Discovery)
// ============================================================================

interface GammaMarket {
  condition_id: string;
  question_id: string;
  question: string;
  slug: string;
  volume: string;
  volume_num: number;
  volume_24hr: number;
  liquidity: string;
  liquidity_num: number;
  start_date_iso: string;
  end_date_iso: string;
  outcomes: string;
  tokens: Array<{
    token_id: string;
    outcome: string;
    price: number;
  }>;
  active: boolean;
  closed: boolean;
}

/**
 * Search for markets via Gamma API
 */
async function searchMarketsGamma(query?: string, limit: number = 10): Promise<GammaMarket[]> {
  try {
    const url = new URL(`${GAMMA_HOST}/markets`);
    if (query) {
      url.searchParams.set("_q", query);
    }
    url.searchParams.set("_limit", limit.toString());
    url.searchParams.set("active", "true");
    url.searchParams.set("closed", "false");
    url.searchParams.set("_order", "volume_num");
    url.searchParams.set("_sort", "desc");

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Gamma API error: ${response.status}`);
    }

    return (await response.json()) as GammaMarket[];
  } catch (error) {
    console.error("Gamma API search failed:", error);
    return [];
  }
}

/**
 * Get trending/popular markets
 */
async function getTrendingMarkets(limit: number = 10): Promise<GammaMarket[]> {
  try {
    const url = new URL(`${GAMMA_HOST}/markets`);
    url.searchParams.set("_limit", limit.toString());
    url.searchParams.set("active", "true");
    url.searchParams.set("closed", "false");
    url.searchParams.set("_order", "volume_24hr");
    url.searchParams.set("_sort", "desc");

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Gamma API error: ${response.status}`);
    }

    return (await response.json()) as GammaMarket[];
  } catch (error) {
    console.error("Gamma API trending failed:", error);
    return [];
  }
}

// ============================================================================
// Market Tools
// ============================================================================

/**
 * Search/list prediction markets on Polymarket
 */
export async function handlePMMarkets(params: {
  query?: string;
  trending?: boolean;
  limit?: number;
}): Promise<PMMarketsResult> {
  try {
    const limit = params.limit || 10;

    let markets: GammaMarket[];
    if (params.trending) {
      markets = await getTrendingMarkets(limit);
    } else {
      markets = await searchMarketsGamma(params.query, limit);
    }

    if (markets.length === 0) {
      return {
        success: true,
        markets: [],
        count: 0,
        error: params.query
          ? `No markets found matching "${params.query}"`
          : "No active markets found",
      };
    }

    // Transform to our format
    const transformedMarkets: PMMarket[] = markets.map((m) => ({
      conditionId: m.condition_id,
      questionId: m.question_id,
      question: m.question,
      slug: m.slug,
      volume: m.volume,
      volume24hr: m.volume_24hr?.toString() || "0",
      liquidity: m.liquidity,
      startDate: m.start_date_iso,
      endDate: m.end_date_iso,
      outcomes: m.outcomes ? m.outcomes.split(",").map((o) => o.trim()) : [],
      tokens: (m.tokens || []).map((t) => ({
        tokenId: t.token_id,
        outcome: t.outcome,
        price: t.price,
      })),
      status: m.active ? (m.closed ? "closed" : "active") : "inactive",
    }));

    return {
      success: true,
      markets: transformedMarkets,
      count: transformedMarkets.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to fetch markets: ${message}`,
    };
  }
}

/**
 * Get market details and orderbook
 */
export async function handlePMMarketDetails(conditionId: string): Promise<{
  success: boolean;
  market?: any;
  orderbook?: any;
  error?: string;
}> {
  try {
    const client = getReadOnlyClient();

    // Get market from CLOB
    const market = await client.getMarket(conditionId);

    if (!market) {
      return {
        success: false,
        error: `Market not found: ${conditionId}`,
      };
    }

    // Get orderbook for the first token if available
    let orderbook = null;
    if (market.tokens && market.tokens.length > 0) {
      const tokenId = market.tokens[0].token_id;
      orderbook = await client.getOrderBook(tokenId);
    }

    return {
      success: true,
      market,
      orderbook,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to get market details: ${message}`,
    };
  }
}

// ============================================================================
// Trading Tools
// ============================================================================

/**
 * Buy shares on a Polymarket prediction market
 */
export async function handlePMBuy(params: {
  tokenId: string;
  amount: number; // USDC amount to spend
  price?: number; // Optional limit price (0-1)
}): Promise<PMOrderResult> {
  const client = await getAuthenticatedClient();
  if (!client) {
    return {
      success: false,
      error: "POLYGON_PRIVATE_KEY not configured. Add it to your .env file.",
    };
  }

  try {
    const { tokenId, amount, price } = params;

    if (price !== undefined) {
      // Limit order (GTC)
      const size = amount / price; // Calculate shares from USDC amount

      const signedOrder = await client.createOrder({
        tokenID: tokenId,
        price: price,
        size: size,
        side: Side.BUY,
      });

      const result = await client.postOrder(signedOrder, OrderType.GTC);

      return {
        success: true,
        orderId: result?.orderID || "submitted",
        side: "BUY",
        size: size.toFixed(2),
        price: price.toFixed(4),
        status: result?.status || "submitted",
      };
    } else {
      // Market order (FOK)
      const signedOrder = await client.createMarketOrder({
        tokenID: tokenId,
        amount: amount,
        side: Side.BUY,
        orderType: OrderType.FOK,
      });

      const result = await client.postOrder(signedOrder, OrderType.FOK);

      return {
        success: true,
        orderId: result?.orderID || "submitted",
        side: "BUY",
        size: amount.toFixed(2),
        status: result?.status || "submitted",
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Buy order failed: ${message}`,
    };
  }
}

/**
 * Sell shares on a Polymarket prediction market
 */
export async function handlePMSell(params: {
  tokenId: string;
  size: number; // Number of shares to sell
  price?: number; // Optional limit price (0-1)
}): Promise<PMOrderResult> {
  const client = await getAuthenticatedClient();
  if (!client) {
    return {
      success: false,
      error: "POLYGON_PRIVATE_KEY not configured. Add it to your .env file.",
    };
  }

  try {
    const { tokenId, size, price } = params;

    if (price !== undefined) {
      // Limit order (GTC)
      const signedOrder = await client.createOrder({
        tokenID: tokenId,
        price: price,
        size: size,
        side: Side.SELL,
      });

      const result = await client.postOrder(signedOrder, OrderType.GTC);

      return {
        success: true,
        orderId: result?.orderID || "submitted",
        side: "SELL",
        size: size.toFixed(2),
        price: price.toFixed(4),
        status: result?.status || "submitted",
      };
    } else {
      // Market order (FOK) - need to get current price
      const signedOrder = await client.createMarketOrder({
        tokenID: tokenId,
        amount: size,
        side: Side.SELL,
        orderType: OrderType.FOK,
      });

      const result = await client.postOrder(signedOrder, OrderType.FOK);

      return {
        success: true,
        orderId: result?.orderID || "submitted",
        side: "SELL",
        size: size.toFixed(2),
        status: result?.status || "submitted",
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Sell order failed: ${message}`,
    };
  }
}

/**
 * Get open orders on Polymarket
 */
export async function handlePMOpenOrders(): Promise<{
  success: boolean;
  orders?: any[];
  error?: string;
}> {
  const client = await getAuthenticatedClient();
  if (!client) {
    return {
      success: false,
      error: "POLYGON_PRIVATE_KEY not configured. Add it to your .env file.",
    };
  }

  try {
    const orders = await client.getOpenOrders();

    return {
      success: true,
      orders: orders || [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to get open orders: ${message}`,
    };
  }
}

/**
 * Cancel an order on Polymarket
 */
export async function handlePMCancelOrder(orderId: string): Promise<{
  success: boolean;
  cancelled?: boolean;
  error?: string;
}> {
  const client = await getAuthenticatedClient();
  if (!client) {
    return {
      success: false,
      error: "POLYGON_PRIVATE_KEY not configured. Add it to your .env file.",
    };
  }

  try {
    await client.cancelOrder({ orderID: orderId });

    return {
      success: true,
      cancelled: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to cancel order: ${message}`,
    };
  }
}
