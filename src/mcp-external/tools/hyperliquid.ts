/**
 * Hyperliquid Perps Integration
 *
 * Provides perpetual futures trading on Hyperliquid DEX.
 * Security: API keys loaded only at execution time, never logged or cached.
 */

import { Hyperliquid } from "hyperliquid";
import { privateKeyToAccount } from "viem/accounts";

// Hyperliquid client instance (created lazily)
let hlClient: InstanceType<typeof Hyperliquid> | null = null;
let walletAddress: string | null = null;

/**
 * Load API credentials from environment
 * SECURITY: Credentials are never logged or cached beyond the client instance
 */
function loadCredentials(): { privateKey: string; testnet: boolean } | null {
  const privateKey = process.env.HYPERLIQUID_PRIVATE_KEY;
  if (!privateKey) {
    return null;
  }

  const testnet = process.env.HYPERLIQUID_TESTNET === "true";
  return { privateKey, testnet };
}

/**
 * Get wallet address from private key
 */
function getWalletAddress(privateKey: string): string {
  const formattedKey = privateKey.startsWith("0x")
    ? (privateKey as `0x${string}`)
    : (`0x${privateKey}` as `0x${string}`);
  const account = privateKeyToAccount(formattedKey);
  return account.address;
}

/**
 * Get or create Hyperliquid client
 */
async function getClient(): Promise<InstanceType<typeof Hyperliquid> | null> {
  if (hlClient) {
    return hlClient;
  }

  const creds = loadCredentials();
  if (!creds) {
    return null;
  }

  try {
    // Get wallet address from private key
    walletAddress = getWalletAddress(creds.privateKey);

    hlClient = new Hyperliquid({
      privateKey: creds.privateKey,
      testnet: creds.testnet,
    });

    // Connect to the exchange
    await hlClient.connect();
    return hlClient;
  } catch (error) {
    console.error("Failed to connect to Hyperliquid:", error);
    return null;
  }
}

// ============================================================================
// Types
// ============================================================================

export interface HLBalanceResult {
  success: boolean;
  connected: boolean;
  network: "mainnet" | "testnet";
  account?: {
    address: string;
    totalAccountValue: string;
    withdrawableBalance: string;
    marginUsed: string;
    unrealizedPnl: string;
  };
  positions?: HLPosition[];
  error?: string;
}

export interface HLPosition {
  market: string;
  side: "long" | "short";
  size: string;
  entryPrice: string;
  markPrice: string;
  unrealizedPnl: string;
  leverage: string;
  liquidationPrice: string | null;
}

export interface HLOpenParams {
  market: string;
  side: "long" | "short";
  size: number;
  leverage?: number;
  orderType?: "market" | "limit";
  price?: number; // Required for limit orders
  reduceOnly?: boolean;
}

export interface HLOpenResult {
  success: boolean;
  orderId?: string;
  market: string;
  side: string;
  size: string;
  orderType: string;
  price?: string;
  leverage?: string;
  liquidationPrice?: string;
  error?: string;
}

export interface HLCloseResult {
  success: boolean;
  orderId?: string;
  market: string;
  closedSize?: string;
  realizedPnl?: string;
  error?: string;
}

export interface HLPositionsResult {
  success: boolean;
  positions: HLPosition[];
  totalUnrealizedPnl: string;
  error?: string;
}

// ============================================================================
// Account Functions
// ============================================================================

/**
 * Get Hyperliquid account balance and positions
 */
export async function handleHLBalance(): Promise<HLBalanceResult> {
  const creds = loadCredentials();
  if (!creds) {
    return {
      success: false,
      connected: false,
      network: "mainnet",
      error: "HYPERLIQUID_PRIVATE_KEY not configured. Add it to your .env file.",
    };
  }

  const client = await getClient();
  if (!client || !walletAddress) {
    return {
      success: false,
      connected: false,
      network: creds.testnet ? "testnet" : "mainnet",
      error: "Failed to connect to Hyperliquid",
    };
  }

  try {
    // Get account state using the info API
    const userState = await client.info.perpetuals.getClearinghouseState(walletAddress);

    if (!userState) {
      return {
        success: false,
        connected: true,
        network: creds.testnet ? "testnet" : "mainnet",
        error: "Failed to fetch account state",
      };
    }

    // Parse positions
    const positions: HLPosition[] = (userState.assetPositions || [])
      .filter((p: any) => p.position && parseFloat(p.position.szi) !== 0)
      .map((p: any) => ({
        market: p.position.coin,
        side: parseFloat(p.position.szi) > 0 ? "long" : "short",
        size: Math.abs(parseFloat(p.position.szi)).toString(),
        entryPrice: p.position.entryPx || "0",
        markPrice: p.position.positionValue
          ? (parseFloat(p.position.positionValue) / Math.abs(parseFloat(p.position.szi))).toString()
          : "0",
        unrealizedPnl: p.position.unrealizedPnl || "0",
        leverage: p.position.leverage?.value?.toString() || "1",
        liquidationPrice: p.position.liquidationPx || null,
      }));

    // Calculate total unrealized PnL
    const totalUnrealizedPnl = positions
      .reduce((sum, p) => sum + parseFloat(p.unrealizedPnl), 0)
      .toFixed(2);

    return {
      success: true,
      connected: true,
      network: creds.testnet ? "testnet" : "mainnet",
      account: {
        address: walletAddress,
        totalAccountValue: userState.marginSummary?.accountValue || "0",
        withdrawableBalance: userState.withdrawable || "0",
        marginUsed: userState.marginSummary?.totalMarginUsed || "0",
        unrealizedPnl: totalUnrealizedPnl,
      },
      positions,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      connected: true,
      network: creds.testnet ? "testnet" : "mainnet",
      error: `Failed to fetch account: ${message}`,
    };
  }
}

// ============================================================================
// Position Management Functions
// ============================================================================

/**
 * Open a perpetual position on Hyperliquid
 */
export async function handleHLOpen(params: HLOpenParams): Promise<HLOpenResult> {
  const client = await getClient();
  if (!client || !walletAddress) {
    return {
      success: false,
      market: params.market,
      side: params.side,
      size: params.size.toString(),
      orderType: params.orderType || "market",
      error: "HYPERLIQUID_PRIVATE_KEY not configured or connection failed",
    };
  }

  try {
    // Get market info to validate leverage
    const meta = await client.info.perpetuals.getMeta();
    const marketInfo = meta?.universe?.find(
      (m: any) => m.name.toUpperCase() === params.market.toUpperCase()
    );

    if (!marketInfo) {
      return {
        success: false,
        market: params.market,
        side: params.side,
        size: params.size.toString(),
        orderType: params.orderType || "market",
        error: `Market ${params.market} not found. Available: ${meta?.universe?.map((m: any) => m.name).join(", ")}`,
      };
    }

    // Validate leverage against market max
    const maxLeverage = marketInfo.maxLeverage || 50;
    const leverage = params.leverage || 1;
    if (leverage > maxLeverage) {
      return {
        success: false,
        market: params.market,
        side: params.side,
        size: params.size.toString(),
        orderType: params.orderType || "market",
        error: `Leverage ${leverage}x exceeds market max of ${maxLeverage}x`,
      };
    }

    // Prepare order according to SDK types
    const isBuy = params.side === "long";
    const orderType = params.orderType || "market";

    // Get current mark price for market orders
    const allMids = await client.info.getAllMids();
    const markPrice = parseFloat(allMids[params.market.toUpperCase()] || "0");

    if (markPrice === 0) {
      return {
        success: false,
        market: params.market,
        side: params.side,
        size: params.size.toString(),
        orderType,
        error: `Could not fetch current price for ${params.market}`,
      };
    }

    // For market orders, use slippage from mark price
    const slippagePercent = 0.5; // 0.5% slippage for market orders
    const limitPrice = orderType === "market"
      ? isBuy
        ? markPrice * (1 + slippagePercent / 100)
        : markPrice * (1 - slippagePercent / 100)
      : params.price;

    if (!limitPrice) {
      return {
        success: false,
        market: params.market,
        side: params.side,
        size: params.size.toString(),
        orderType,
        error: "Price is required for limit orders",
      };
    }

    const order = {
      coin: params.market.toUpperCase(),
      is_buy: isBuy,
      sz: params.size,
      limit_px: limitPrice,
      order_type: orderType === "market"
        ? { limit: { tif: "Ioc" as const } } // Immediate-or-cancel for market orders
        : { limit: { tif: "Gtc" as const } }, // Good-till-cancelled for limit orders
      reduce_only: params.reduceOnly || false,
    };

    // Execute order
    const result = await client.exchange.placeOrder(order);

    // Get liquidation price estimate
    const newState = await client.info.perpetuals.getClearinghouseState(walletAddress);
    const position = newState?.assetPositions?.find(
      (p: any) => p.position?.coin?.toUpperCase() === params.market.toUpperCase()
    );

    return {
      success: true,
      orderId: (result as any)?.response?.data?.statuses?.[0]?.resting?.oid || "filled",
      market: params.market,
      side: params.side,
      size: params.size.toString(),
      orderType,
      price: limitPrice.toString(),
      leverage: leverage.toString(),
      liquidationPrice: position?.position?.liquidationPx || undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      market: params.market,
      side: params.side,
      size: params.size.toString(),
      orderType: params.orderType || "market",
      error: `Order failed: ${message}`,
    };
  }
}

/**
 * Close a perpetual position on Hyperliquid
 */
export async function handleHLClose(market: string): Promise<HLCloseResult> {
  const client = await getClient();
  if (!client || !walletAddress) {
    return {
      success: false,
      market,
      error: "HYPERLIQUID_PRIVATE_KEY not configured or connection failed",
    };
  }

  try {
    // Get current position
    const userState = await client.info.perpetuals.getClearinghouseState(walletAddress);
    const position = userState?.assetPositions?.find(
      (p: any) => p.position?.coin?.toUpperCase() === market.toUpperCase()
    );

    if (!position || parseFloat(position.position?.szi || "0") === 0) {
      return {
        success: false,
        market,
        error: `No open position found for ${market}`,
      };
    }

    const size = Math.abs(parseFloat(position.position.szi));
    const isLong = parseFloat(position.position.szi) > 0;
    const unrealizedPnl = position.position?.unrealizedPnl || "0";

    // Get current mark price for the close order
    const allMids = await client.info.getAllMids();
    const markPrice = parseFloat(allMids[market.toUpperCase()] || "0");

    if (markPrice === 0) {
      return {
        success: false,
        market,
        error: `Could not fetch current price for ${market}`,
      };
    }

    // Use slippage from mark price for close
    const slippagePercent = 0.5;
    const limitPrice = isLong
      ? markPrice * (1 - slippagePercent / 100) // Selling to close long
      : markPrice * (1 + slippagePercent / 100); // Buying to close short

    // Close position with IOC order (opposite side, reduce only)
    const order = {
      coin: market.toUpperCase(),
      is_buy: !isLong, // Opposite side to close
      sz: size,
      limit_px: limitPrice,
      order_type: { limit: { tif: "Ioc" as const } },
      reduce_only: true,
    };

    const result = await client.exchange.placeOrder(order);

    return {
      success: true,
      orderId: (result as any)?.response?.data?.statuses?.[0]?.filled?.oid || "filled",
      market,
      closedSize: size.toString(),
      realizedPnl: unrealizedPnl,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      market,
      error: `Close failed: ${message}`,
    };
  }
}

/**
 * Get all open positions
 */
export async function handleHLPositions(): Promise<HLPositionsResult> {
  const result = await handleHLBalance();

  if (!result.success) {
    return {
      success: false,
      positions: [],
      totalUnrealizedPnl: "0",
      error: result.error,
    };
  }

  const positions = result.positions || [];
  const totalUnrealizedPnl = positions
    .reduce((sum, p) => sum + parseFloat(p.unrealizedPnl), 0)
    .toFixed(2);

  return {
    success: true,
    positions,
    totalUnrealizedPnl,
  };
}

/**
 * Get available markets on Hyperliquid
 */
export async function handleHLMarkets(): Promise<{
  success: boolean;
  markets?: Array<{ name: string; maxLeverage: number }>;
  error?: string;
}> {
  const client = await getClient();
  if (!client) {
    // Try to get markets without auth (public endpoint)
    try {
      const publicClient = new Hyperliquid({ testnet: process.env.HYPERLIQUID_TESTNET === "true" });
      await publicClient.connect();
      const meta = await publicClient.info.perpetuals.getMeta();

      return {
        success: true,
        markets: meta?.universe?.map((m: any) => ({
          name: m.name,
          maxLeverage: m.maxLeverage || 50,
        })) || [],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Failed to fetch markets: ${message}`,
      };
    }
  }

  try {
    const meta = await client.info.perpetuals.getMeta();

    return {
      success: true,
      markets: meta?.universe?.map((m: any) => ({
        name: m.name,
        maxLeverage: m.maxLeverage || 50,
      })) || [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to fetch markets: ${message}`,
    };
  }
}
