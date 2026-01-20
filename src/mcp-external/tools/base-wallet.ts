/**
 * Base Chain Wallet Integration with Turnkey Support
 *
 * Provides wallet connectivity and balance checking for Base chain.
 * Supports two authentication modes:
 *
 * 1. Turnkey (preferred): Uses wallet-service API for secure HSM-backed operations
 * 2. Legacy: Falls back to private key environment variables
 *
 * Security:
 * - Turnkey mode: Keys never leave HSM, delegated signing via API
 * - Legacy mode: Private keys loaded only at execution time, never logged or cached
 * - Fail-closed: If Turnkey auth exists but service unavailable, operations are blocked
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  formatEther,
  type Account,
  type PublicClient,
  type WalletClient,
  type Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import {
  getTurnkeyAuthProvider,
  shouldUseTurnkey,
  getAuthModeLabel,
  type AuthMode,
} from "../auth/turnkey.js";
import {
  getWalletServiceClient,
  ServiceUnavailableError,
  TokenExpiredError,
} from "../../integrations/wallet-service.js";

// RPC endpoints
const BASE_RPC = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const USE_TESTNET = process.env.BASE_TESTNET === "true";

// ============================================================================
// Legacy Mode Functions (Private Key)
// ============================================================================

/**
 * Get the Base chain configuration
 */
function getBaseChain(): Chain {
  return USE_TESTNET ? baseSepolia : base;
}

/**
 * Load wallet from environment variable at execution time only
 * SECURITY: Never cache or log the account
 */
function loadBaseWallet(): Account | null {
  const privateKey = process.env.BASE_PRIVATE_KEY;
  if (!privateKey) {
    return null;
  }

  try {
    // Ensure private key has 0x prefix
    const formattedKey = privateKey.startsWith("0x")
      ? (privateKey as `0x${string}`)
      : (`0x${privateKey}` as `0x${string}`);

    return privateKeyToAccount(formattedKey);
  } catch {
    return null;
  }
}

/**
 * Get public client for reading chain data
 */
function getPublicClient(): PublicClient {
  return createPublicClient({
    chain: getBaseChain(),
    transport: http(BASE_RPC),
  });
}

/**
 * Get wallet client for signing transactions
 * SECURITY: Only used internally for transaction signing
 * Returns a wallet client with account bound for proper typing
 */
function getWalletClient(account: Account) {
  return createWalletClient({
    account,
    chain: getBaseChain(),
    transport: http(BASE_RPC),
  });
}

// ============================================================================
// Types
// ============================================================================

export interface BaseWalletStatus {
  connected: boolean;
  chain: "base";
  network: "mainnet" | "sepolia";
  address: string | null;
  balance: {
    eth: string;
    wei: bigint;
  } | null;
  error?: string;
  authMode?: string;
}

// ============================================================================
// Turnkey Mode Functions
// ============================================================================

/**
 * Get wallet status using Turnkey wallet-service
 */
async function handleBaseWalletStatusTurnkey(): Promise<BaseWalletStatus> {
  const provider = getTurnkeyAuthProvider();
  const client = getWalletServiceClient();

  try {
    // Check if service is reachable
    const isHealthy = await client.healthCheck();
    if (!isHealthy) {
      throw new ServiceUnavailableError();
    }

    // Get wallet for EVM chain (Base uses EVM wallets)
    const wallet = await client.getWalletForChain("evm");
    if (!wallet) {
      return {
        connected: false,
        chain: "base",
        network: USE_TESTNET ? "sepolia" : "mainnet",
        address: null,
        balance: null,
        error: "No EVM wallet provisioned. Contact support or try re-authenticating.",
        authMode: "Turnkey (no wallet)",
      };
    }

    // Get balance using wallet-service
    try {
      const balanceResult = await client.getWalletBalance(wallet.id);
      const ethBalance = balanceResult.balance;

      return {
        connected: true,
        chain: "base",
        network: USE_TESTNET ? "sepolia" : "mainnet",
        address: wallet.address,
        balance: {
          eth: ethBalance,
          wei: BigInt(Math.round(parseFloat(ethBalance) * 1e18)),
        },
        authMode: "Turnkey (HSM-secured)",
      };
    } catch {
      // Balance fetch failed, but wallet exists - try RPC directly
      const publicClient = getPublicClient();
      const balance = await publicClient.getBalance({
        address: wallet.address as `0x${string}`,
      });

      return {
        connected: true,
        chain: "base",
        network: USE_TESTNET ? "sepolia" : "mainnet",
        address: wallet.address,
        balance: {
          eth: formatEther(balance),
          wei: balance,
        },
        authMode: "Turnkey (HSM-secured)",
      };
    }
  } catch (error) {
    if (error instanceof ServiceUnavailableError) {
      return {
        connected: false,
        chain: "base",
        network: USE_TESTNET ? "sepolia" : "mainnet",
        address: null,
        balance: null,
        error: "Wallet service unavailable. Run `donut auth login` to reconnect.",
        authMode: "Turnkey (service unavailable)",
      };
    }

    if (error instanceof TokenExpiredError) {
      return {
        connected: false,
        chain: "base",
        network: USE_TESTNET ? "sepolia" : "mainnet",
        address: null,
        balance: null,
        error: "Session expired. Run `donut auth login` to re-authenticate.",
        authMode: "Turnkey (session expired)",
      };
    }

    const message = error instanceof Error ? error.message : String(error);
    return {
      connected: false,
      chain: "base",
      network: USE_TESTNET ? "sepolia" : "mainnet",
      address: null,
      balance: null,
      error: `Turnkey error: ${message}`,
      authMode: "Turnkey (error)",
    };
  }
}

/**
 * Get wallet status using legacy private key
 */
async function handleBaseWalletStatusLegacy(): Promise<BaseWalletStatus> {
  const account = loadBaseWallet();

  if (!account) {
    return {
      connected: false,
      chain: "base",
      network: USE_TESTNET ? "sepolia" : "mainnet",
      address: null,
      balance: null,
      error: "BASE_PRIVATE_KEY not configured. Add it to your .env file or run `donut auth login`.",
      authMode: "Legacy (not configured)",
    };
  }

  try {
    const publicClient = getPublicClient();
    const balance = await publicClient.getBalance({
      address: account.address,
    });

    return {
      connected: true,
      chain: "base",
      network: USE_TESTNET ? "sepolia" : "mainnet",
      address: account.address,
      balance: {
        eth: formatEther(balance),
        wei: balance,
      },
      authMode: "Legacy (local key)",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      connected: false,
      chain: "base",
      network: USE_TESTNET ? "sepolia" : "mainnet",
      address: null,
      balance: null,
      error: `Failed to connect: ${message}`,
      authMode: "Legacy (connection error)",
    };
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Get Base wallet status and ETH balance
 *
 * Routes to Turnkey or legacy based on authentication state:
 * - If user has Turnkey credentials → use wallet-service
 * - If no Turnkey credentials → fall back to BASE_PRIVATE_KEY env var
 */
export async function handleBaseWalletStatus(): Promise<BaseWalletStatus> {
  if (shouldUseTurnkey()) {
    return handleBaseWalletStatusTurnkey();
  }
  return handleBaseWalletStatusLegacy();
}

/**
 * Get ERC20 token balance for a specific token
 */
export async function getBaseTokenBalance(
  tokenAddress: string
): Promise<{ balance: string; decimals: number } | null> {
  // Get wallet address based on auth mode
  let walletAddress: string | null = null;

  if (shouldUseTurnkey()) {
    const provider = getTurnkeyAuthProvider();
    walletAddress = provider.getEvmAddress();
  } else {
    const account = loadBaseWallet();
    walletAddress = account ? account.address : null;
  }

  if (!walletAddress) return null;

  try {
    const publicClient = getPublicClient();

    // ERC20 balanceOf ABI
    const balanceResult = await publicClient.readContract({
      address: tokenAddress as `0x${string}`,
      abi: [
        {
          name: "balanceOf",
          type: "function",
          stateMutability: "view",
          inputs: [{ name: "account", type: "address" }],
          outputs: [{ name: "balance", type: "uint256" }],
        },
        {
          name: "decimals",
          type: "function",
          stateMutability: "view",
          inputs: [],
          outputs: [{ name: "", type: "uint8" }],
        },
      ] as const,
      functionName: "balanceOf",
      args: [walletAddress as `0x${string}`],
    });

    const decimalsResult = await publicClient.readContract({
      address: tokenAddress as `0x${string}`,
      abi: [
        {
          name: "decimals",
          type: "function",
          stateMutability: "view",
          inputs: [],
          outputs: [{ name: "", type: "uint8" }],
        },
      ] as const,
      functionName: "decimals",
    });

    const balance = balanceResult as bigint;
    const decimals = decimalsResult as number;
    const formattedBalance = Number(balance) / 10 ** decimals;

    return {
      balance: formattedBalance.toString(),
      decimals,
    };
  } catch {
    return null;
  }
}

/**
 * Export account loading for use by swap operations
 * SECURITY: Only used internally, never exposed to MCP
 *
 * IMPORTANT: This only works in legacy mode. For Turnkey mode,
 * transactions must be signed via wallet-service API.
 */
export function getBaseAccountForSigning(): Account | null {
  // Only return account in legacy mode
  if (shouldUseTurnkey()) {
    return null; // Turnkey mode uses delegated signing
  }
  return loadBaseWallet();
}

/**
 * Export wallet client factory for swap operations
 * SECURITY: Only used internally
 *
 * IMPORTANT: This only works in legacy mode. For Turnkey mode,
 * transactions must be signed via wallet-service API.
 */
export function createBaseWalletClient(): WalletClient | null {
  // Only create wallet client in legacy mode
  if (shouldUseTurnkey()) {
    return null; // Turnkey mode uses delegated signing
  }

  const account = loadBaseWallet();
  if (!account) return null;
  return getWalletClient(account);
}

/**
 * Export public client for read operations
 */
export function getBasePublicClient(): PublicClient {
  return getPublicClient();
}

/**
 * Get wallet address only (safe to expose)
 */
export function getBaseWalletAddress(): string | null {
  if (shouldUseTurnkey()) {
    const provider = getTurnkeyAuthProvider();
    return provider.getEvmAddress();
  }

  const account = loadBaseWallet();
  return account ? account.address : null;
}

/**
 * Check current authentication mode
 */
export function getBaseAuthenticationMode(): AuthMode {
  return getTurnkeyAuthProvider().getAuthMode();
}

/**
 * Get human-readable auth mode label
 */
export function getBaseAuthenticationLabel(): string {
  return getAuthModeLabel();
}
