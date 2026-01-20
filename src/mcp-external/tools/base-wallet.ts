/**
 * Base Chain Wallet Integration
 *
 * Provides wallet connectivity and balance checking for Base chain.
 * Security: Private keys loaded only at execution time, never logged or cached.
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

// RPC endpoints
const BASE_RPC = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const USE_TESTNET = process.env.BASE_TESTNET === "true";

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
}

/**
 * Get Base wallet status and ETH balance
 */
export async function handleBaseWalletStatus(): Promise<BaseWalletStatus> {
  const account = loadBaseWallet();

  if (!account) {
    return {
      connected: false,
      chain: "base",
      network: USE_TESTNET ? "sepolia" : "mainnet",
      address: null,
      balance: null,
      error: "BASE_PRIVATE_KEY not configured. Add it to your .env file.",
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
    };
  }
}

/**
 * Get ERC20 token balance for a specific token
 */
export async function getBaseTokenBalance(
  tokenAddress: string
): Promise<{ balance: string; decimals: number } | null> {
  const account = loadBaseWallet();
  if (!account) return null;

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
      args: [account.address],
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
 */
export function getBaseAccountForSigning(): Account | null {
  return loadBaseWallet();
}

/**
 * Export wallet client factory for swap operations
 * SECURITY: Only used internally
 */
export function createBaseWalletClient(): WalletClient | null {
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
  const account = loadBaseWallet();
  return account ? account.address : null;
}
