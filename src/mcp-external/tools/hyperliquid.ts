/**
 * Hyperliquid Perps Integration with Auth Mode Awareness
 *
 * Provides perpetual futures trading on Hyperliquid DEX.
 *
 * Authentication Modes:
 * - Turnkey: Reports Turnkey auth status but STILL requires HYPERLIQUID_PRIVATE_KEY
 *   (Hyperliquid SDK doesn't support external signers - keys are used internally)
 * - Legacy: Uses HYPERLIQUID_PRIVATE_KEY environment variable
 *
 * NOTE: Unlike Solana/Base wallets where we can route signing to wallet-service,
 * the Hyperliquid SDK handles signing internally. Until the SDK supports external
 * signers, users must configure HYPERLIQUID_PRIVATE_KEY even when using Turnkey.
 *
 * Security: API keys loaded only at execution time, never logged or cached.
 */

import { Hyperliquid } from "hyperliquid";
import { privateKeyToAccount } from "viem/accounts";
import {
  getTurnkeyAuthProvider,
  shouldUseTurnkey,
  getAuthModeLabel,
  type AuthMode,
} from "../auth/turnkey.js";

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
function getWalletAddressFromKey(privateKey: string): string {
  const formattedKey = privateKey.startsWith("0x")
    ? (privateKey as `0x${string}`)
    : (`0x${privateKey}` as `0x${string}`);
  const account = privateKeyToAccount(formattedKey);
  return account.address;
}

/**
 * Get wallet address (checks Turnkey first, then local key)
 */
function getEffectiveWalletAddress(): string | null {
  // If using Turnkey, try to get EVM address from credentials
  if (shouldUseTurnkey()) {
    const provider = getTurnkeyAuthProvider();
    const turnkeyAddress = provider.getEvmAddress();
    if (turnkeyAddress) {
      return turnkeyAddress;
    }
  }

  // Fall back to private key-derived address
  const creds = loadCredentials();
  if (creds) {
    return getWalletAddressFromKey(creds.privateKey);
  }

  return null;
}

/**
 * Get or create Hyperliquid client
 *
 * NOTE: This always requires HYPERLIQUID_PRIVATE_KEY because the SDK
 * handles signing internally and doesn't support external signers.
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
    walletAddress = getWalletAddressFromKey(creds.privateKey);

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
  authMode?: string;
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
  authMode?: string;
  error?: string;
}

export interface HLCloseResult {
  success: boolean;
  orderId?: string;
  market: string;
  closedSize?: string;
  realizedPnl?: string;
  authMode?: string;
  error?: string;
}

export interface HLPositionsResult {
  success: boolean;
  positions: HLPosition[];
  totalUnrealizedPnl: string;
  authMode?: string;
  error?: string;
}

export interface HLAuthStatus {
  turnkeyAuthenticated: boolean;
  turnkeyAddress?: string;
  hyperliquidKeyConfigured: boolean;
  hyperliquidAddress?: string;
  ready: boolean;
  message: string;
}

// ============================================================================
// Auth Status Function
// ============================================================================

/**
 * Get Hyperliquid authentication status
 *
 * This helps users understand the auth state since Hyperliquid
 * requires its own private key even when Turnkey is authenticated.
 */
export function getHLAuthStatus(): HLAuthStatus {
  const isTurnkey = shouldUseTurnkey();
  const turnkeyAddress = isTurnkey
    ? getTurnkeyAuthProvider().getEvmAddress()
    : null;
  const creds = loadCredentials();
  const hlAddress = creds ? getWalletAddressFromKey(creds.privateKey) : null;

  // Check if addresses match (user configured correct key for Turnkey wallet)
  const addressesMatch = turnkeyAddress && hlAddress
    ? turnkeyAddress.toLowerCase() === hlAddress.toLowerCase()
    : false;

  let message: string;
  if (isTurnkey && creds) {
    if (addressesMatch) {
      message = "Turnkey authenticated. HYPERLIQUID_PRIVATE_KEY matches Turnkey wallet.";
    } else {
      message = "Turnkey authenticated but HYPERLIQUID_PRIVATE_KEY uses different address. " +
        "Configure the key for your Turnkey wallet or use `donut auth logout` for legacy mode.";
    }
  } else if (isTurnkey && !creds) {
    message = "Turnkey authenticated but HYPERLIQUID_PRIVATE_KEY not configured. " +
      "Hyperliquid SDK requires private key for signing. Export key from Turnkey or configure separately.";
  } else if (creds) {
    message = "Using legacy mode with HYPERLIQUID_PRIVATE_KEY.";
  } else {
    message = "HYPERLIQUID_PRIVATE_KEY not configured. Add it to your .env file.";
  }

  return {
    turnkeyAuthenticated: isTurnkey,
    turnkeyAddress: turnkeyAddress || undefined,
    hyperliquidKeyConfigured: !!creds,
    hyperliquidAddress: hlAddress || undefined,
    ready: !!creds,
    message,
  };
}

/**
 * Get human-readable auth mode label for Hyperliquid
 */
function getHLAuthModeLabel(): string {
  const status = getHLAuthStatus();

  if (status.turnkeyAuthenticated && status.hyperliquidKeyConfigured) {
    return "Turnkey + Local Key";
  } else if (status.turnkeyAuthenticated) {
    return "Turnkey (key required)";
  } else if (status.hyperliquidKeyConfigured) {
    return "Legacy (local key)";
  }
  return "Not configured";
}

// ============================================================================
// Account Functions
// ============================================================================

/**
 * Get Hyperliquid account balance and positions
 */
export async function handleHLBalance(): Promise<HLBalanceResult> {
  const creds = loadCredentials();
  const authMode = getHLAuthModeLabel();

  if (!creds) {
    // Check if Turnkey authenticated to give more helpful error
    if (shouldUseTurnkey()) {
      return {
        success: false,
        connected: false,
        network: "mainnet",
        authMode,
        error: "Turnkey authenticated but HYPERLIQUID_PRIVATE_KEY not configured. " +
          "Hyperliquid SDK requires private key for signing operations.",
      };
    }
    return {
      success: false,
      connected: false,
      network: "mainnet",
      authMode,
      error: "HYPERLIQUID_PRIVATE_KEY not configured. Add it to your .env file or run `donut auth login`.",
    };
  }

  const client = await getClient();
  if (!client || !walletAddress) {
    return {
      success: false,
      connected: false,
      network: creds.testnet ? "testnet" : "mainnet",
      authMode,
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
        authMode,
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
      authMode,
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
      authMode,
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
  const authMode = getHLAuthModeLabel();
  const client = await getClient();

  if (!client || !walletAddress) {
    // Check if Turnkey authenticated to give more helpful error
    if (shouldUseTurnkey()) {
      return {
        success: false,
        market: params.market,
        side: params.side,
        size: params.size.toString(),
        orderType: params.orderType || "market",
        authMode,
        error: "Turnkey authenticated but HYPERLIQUID_PRIVATE_KEY not configured. " +
          "Hyperliquid SDK requires private key for order signing.",
      };
    }
    return {
      success: false,
      market: params.market,
      side: params.side,
      size: params.size.toString(),
      orderType: params.orderType || "market",
      authMode,
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
        authMode,
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
        authMode,
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
        authMode,
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
        authMode,
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
      authMode,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      market: params.market,
      side: params.side,
      size: params.size.toString(),
      orderType: params.orderType || "market",
      authMode,
      error: `Order failed: ${message}`,
    };
  }
}

/**
 * Close a perpetual position on Hyperliquid
 */
export async function handleHLClose(market: string): Promise<HLCloseResult> {
  const authMode = getHLAuthModeLabel();
  const client = await getClient();

  if (!client || !walletAddress) {
    // Check if Turnkey authenticated to give more helpful error
    if (shouldUseTurnkey()) {
      return {
        success: false,
        market,
        authMode,
        error: "Turnkey authenticated but HYPERLIQUID_PRIVATE_KEY not configured. " +
          "Hyperliquid SDK requires private key for order signing.",
      };
    }
    return {
      success: false,
      market,
      authMode,
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
        authMode,
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
        authMode,
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
      authMode,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      market,
      authMode,
      error: `Close failed: ${message}`,
    };
  }
}

/**
 * Get all open positions
 */
export async function handleHLPositions(): Promise<HLPositionsResult> {
  const result = await handleHLBalance();
  const authMode = getHLAuthModeLabel();

  if (!result.success) {
    return {
      success: false,
      positions: [],
      totalUnrealizedPnl: "0",
      authMode,
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
    authMode,
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

/**
 * Get current authentication mode for Hyperliquid
 */
export function getHLAuthenticationMode(): AuthMode {
  return getTurnkeyAuthProvider().getAuthMode();
}

/**
 * Get effective wallet address for Hyperliquid operations
 * Returns Turnkey address if authenticated, otherwise key-derived address
 */
export function getHLWalletAddress(): string | null {
  return getEffectiveWalletAddress();
}
