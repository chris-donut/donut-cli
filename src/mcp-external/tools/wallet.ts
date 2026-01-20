/**
 * Solana Wallet Integration
 *
 * Provides wallet connectivity and balance checking for Solana chain.
 * Security: Private keys loaded only at execution time, never logged or cached.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import bs58 from "bs58";

// RPC endpoints
const SOLANA_RPC = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

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

export interface WalletStatus {
  connected: boolean;
  chain: "solana";
  address: string | null;
  balance: {
    sol: number;
    lamports: number;
  } | null;
  error?: string;
}

/**
 * Get wallet status and SOL balance
 */
export async function handleWalletStatus(): Promise<WalletStatus> {
  const wallet = loadWallet();

  if (!wallet) {
    return {
      connected: false,
      chain: "solana",
      address: null,
      balance: null,
      error: "SOLANA_PRIVATE_KEY not configured. Add it to your .env file.",
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
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      connected: false,
      chain: "solana",
      address: null,
      balance: null,
      error: `Failed to connect: ${message}`,
    };
  }
}

/**
 * Get SPL token balance for a specific token
 */
export async function getTokenBalance(
  tokenMint: string
): Promise<{ balance: number; decimals: number } | null> {
  const wallet = loadWallet();
  if (!wallet) return null;

  try {
    const connection = getConnection();
    const mintPubkey = new PublicKey(tokenMint);
    const ownerPubkey = wallet.publicKey;

    // Get token accounts for this mint owned by the wallet
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
 */
export function getWalletForSigning(): Keypair | null {
  return loadWallet();
}

/**
 * Get public key only (safe to expose)
 */
export function getWalletPublicKey(): PublicKey | null {
  const wallet = loadWallet();
  return wallet ? wallet.publicKey : null;
}
