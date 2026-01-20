/**
 * Multi-Chain Wallet Integration with Turnkey Support
 *
 * Provides wallet connectivity and balance checking for Solana and Base chains.
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
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import bs58 from "bs58";
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
import { handleBaseWalletStatus, type BaseWalletStatus } from "./base-wallet.js";

// RPC endpoints
const SOLANA_RPC = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

// ============================================================================
// Legacy Mode Functions (Private Key)
// ============================================================================

/**
 * Load wallet from environment variable at execution time only
 * SECURITY: Never cache or log the keypair
 */
function loadWallet(): Keypair | null {
  const privateKey = process.env.SOLANA_PRIVATE_KEY;
  if (!privateKey) {
    return null;
  }

  try {
    // Support both base58 and array formats
    if (privateKey.startsWith("[")) {
      const secretKey = new Uint8Array(JSON.parse(privateKey));
      return Keypair.fromSecretKey(secretKey);
    } else {
      const secretKey = bs58.decode(privateKey);
      return Keypair.fromSecretKey(secretKey);
    }
  } catch {
    return null;
  }
}

/**
 * Get connection to Solana network
 */
function getConnection(): Connection {
  return new Connection(SOLANA_RPC, "confirmed");
}

// ============================================================================
// Types
// ============================================================================

export interface WalletStatus {
  connected: boolean;
  chain: "solana";
  address: string | null;
  balance: {
    sol: number;
    lamports: number;
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
async function handleWalletStatusTurnkey(): Promise<WalletStatus> {
  const provider = getTurnkeyAuthProvider();
  const client = getWalletServiceClient();

  try {
    // Check if service is reachable
    const isHealthy = await client.healthCheck();
    if (!isHealthy) {
      throw new ServiceUnavailableError();
    }

    // Get wallet for Solana chain
    const wallet = await client.getWalletForChain("solana");
    if (!wallet) {
      return {
        connected: false,
        chain: "solana",
        address: null,
        balance: null,
        error: "No Solana wallet provisioned. Contact support or try re-authenticating.",
        authMode: "Turnkey (no wallet)",
      };
    }

    // Get balance using wallet-service
    try {
      const balanceResult = await client.getWalletBalance(wallet.id);
      const solBalance = parseFloat(balanceResult.balance);

      return {
        connected: true,
        chain: "solana",
        address: wallet.address,
        balance: {
          sol: solBalance,
          lamports: Math.round(solBalance * LAMPORTS_PER_SOL),
        },
        authMode: "Turnkey (HSM-secured)",
      };
    } catch {
      // Balance fetch failed, but wallet exists - try RPC directly
      const connection = getConnection();
      const pubkey = new PublicKey(wallet.address);
      const balance = await connection.getBalance(pubkey);

      return {
        connected: true,
        chain: "solana",
        address: wallet.address,
        balance: {
          sol: balance / LAMPORTS_PER_SOL,
          lamports: balance,
        },
        authMode: "Turnkey (HSM-secured)",
      };
    }
  } catch (error) {
    if (error instanceof ServiceUnavailableError) {
      return {
        connected: false,
        chain: "solana",
        address: null,
        balance: null,
        error: "Wallet service unavailable. Run `donut auth login` to reconnect.",
        authMode: "Turnkey (service unavailable)",
      };
    }

    if (error instanceof TokenExpiredError) {
      return {
        connected: false,
        chain: "solana",
        address: null,
        balance: null,
        error: "Session expired. Run `donut auth login` to re-authenticate.",
        authMode: "Turnkey (session expired)",
      };
    }

    const message = error instanceof Error ? error.message : String(error);
    return {
      connected: false,
      chain: "solana",
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
async function handleWalletStatusLegacy(): Promise<WalletStatus> {
  const wallet = loadWallet();

  if (!wallet) {
    return {
      connected: false,
      chain: "solana",
      address: null,
      balance: null,
      error: "SOLANA_PRIVATE_KEY not configured. Add it to your .env file or run `donut auth login`.",
      authMode: "Legacy (not configured)",
    };
  }

  try {
    const connection = getConnection();
    const publicKey = wallet.publicKey;
    const balance = await connection.getBalance(publicKey);

    return {
      connected: true,
      chain: "solana",
      address: publicKey.toBase58(),
      balance: {
        sol: balance / LAMPORTS_PER_SOL,
        lamports: balance,
      },
      authMode: "Legacy (local key)",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      connected: false,
      chain: "solana",
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
 * Get wallet status and SOL balance
 *
 * Routes to Turnkey or legacy based on authentication state:
 * - If user has Turnkey credentials → use wallet-service
 * - If no Turnkey credentials → fall back to SOLANA_PRIVATE_KEY env var
 */
export async function handleWalletStatus(): Promise<WalletStatus> {
  if (shouldUseTurnkey()) {
    return handleWalletStatusTurnkey();
  }
  return handleWalletStatusLegacy();
}

/**
 * Get SPL token balance for a specific token
 */
export async function getTokenBalance(
  tokenMint: string
): Promise<{ balance: number; decimals: number } | null> {
  // For Turnkey, get address from credentials
  if (shouldUseTurnkey()) {
    const provider = getTurnkeyAuthProvider();
    const address = provider.getSolanaAddress();

    if (!address) return null;

    try {
      const connection = getConnection();
      const mintPubkey = new PublicKey(tokenMint);
      const ownerPubkey = new PublicKey(address);

      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        ownerPubkey,
        { mint: mintPubkey }
      );

      if (tokenAccounts.value.length === 0) {
        return { balance: 0, decimals: 0 };
      }

      const accountInfo = tokenAccounts.value[0].account.data.parsed.info;
      return {
        balance: parseFloat(accountInfo.tokenAmount.uiAmount),
        decimals: accountInfo.tokenAmount.decimals,
      };
    } catch {
      return null;
    }
  }

  // Legacy mode
  const wallet = loadWallet();
  if (!wallet) return null;

  try {
    const connection = getConnection();
    const mintPubkey = new PublicKey(tokenMint);
    const ownerPubkey = wallet.publicKey;

    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      ownerPubkey,
      { mint: mintPubkey }
    );

    if (tokenAccounts.value.length === 0) {
      return { balance: 0, decimals: 0 };
    }

    const accountInfo = tokenAccounts.value[0].account.data.parsed.info;
    return {
      balance: parseFloat(accountInfo.tokenAmount.uiAmount),
      decimals: accountInfo.tokenAmount.decimals,
    };
  } catch {
    return null;
  }
}

/**
 * Export wallet loading for use by swap operations
 * SECURITY: Only used internally, never exposed to MCP
 *
 * IMPORTANT: This only works in legacy mode. For Turnkey mode,
 * transactions must be signed via wallet-service API.
 */
export function getWalletForSigning(): Keypair | null {
  // Only return keypair in legacy mode
  if (shouldUseTurnkey()) {
    return null; // Turnkey mode uses delegated signing
  }
  return loadWallet();
}

/**
 * Get public key only (safe to expose)
 */
export function getWalletPublicKey(): PublicKey | null {
  if (shouldUseTurnkey()) {
    const provider = getTurnkeyAuthProvider();
    const address = provider.getSolanaAddress();
    return address ? new PublicKey(address) : null;
  }

  const wallet = loadWallet();
  return wallet ? wallet.publicKey : null;
}

/**
 * Get wallet address as string
 */
export function getWalletAddress(): string | null {
  if (shouldUseTurnkey()) {
    const provider = getTurnkeyAuthProvider();
    return provider.getSolanaAddress();
  }

  const wallet = loadWallet();
  return wallet ? wallet.publicKey.toBase58() : null;
}

/**
 * Check current authentication mode
 */
export function getAuthenticationMode(): AuthMode {
  return getTurnkeyAuthProvider().getAuthMode();
}

/**
 * Get human-readable auth mode label
 */
export function getAuthenticationLabel(): string {
  return getAuthModeLabel();
}

/**
 * Combined multi-chain wallet status
 */
export interface MultiChainWalletStatus {
  solana: WalletStatus;
  base: BaseWalletStatus;
}

/**
 * Get wallet status for all supported chains
 */
export async function handleMultiChainWalletStatus(): Promise<MultiChainWalletStatus> {
  const [solanaStatus, baseStatus] = await Promise.all([
    handleWalletStatus(),
    handleBaseWalletStatus(),
  ]);

  return {
    solana: solanaStatus,
    base: baseStatus,
  };
}

// Re-export Base wallet functions for convenience
export { handleBaseWalletStatus, type BaseWalletStatus } from "./base-wallet.js";
