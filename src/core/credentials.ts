/**
 * Credentials Management for Turnkey Wallet Authentication
 *
 * Handles secure storage, loading, and refresh of OAuth tokens for the
 * donut-wallet-service integration. Credentials are stored in ~/.donut/credentials.json
 * with restrictive file permissions (0600) to protect sensitive tokens.
 *
 * Token refresh is handled transparently - when access token is within 5 minutes
 * of expiry, refresh is triggered automatically.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { z } from "zod";

// ============================================================================
// Types and Schemas
// ============================================================================

/**
 * Zod schema for credentials file validation
 */
export const CredentialsSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.number(), // Unix timestamp in milliseconds
  userEmail: z.string().email(),
  wallets: z.array(
    z.object({
      id: z.string(),
      chain: z.enum(["solana", "evm"]),
      address: z.string(),
      name: z.string().optional(),
    })
  ).optional(),
});

export type Credentials = z.infer<typeof CredentialsSchema>;

/**
 * Wallet information from Turnkey
 */
export interface TurnkeyWallet {
  id: string;
  chain: "solana" | "evm";
  address: string;
  name?: string;
}

// ============================================================================
// Constants
// ============================================================================

const DONUT_DIR = join(homedir(), ".donut");
const CREDENTIALS_FILE = join(DONUT_DIR, "credentials.json");

// Refresh token when access token has less than 5 minutes remaining
const TOKEN_REFRESH_THRESHOLD_MS = 5 * 60 * 1000;

// ============================================================================
// Directory Management
// ============================================================================

/**
 * Ensure the ~/.donut directory exists with secure permissions
 */
function ensureDonutDir(): void {
  if (!existsSync(DONUT_DIR)) {
    mkdirSync(DONUT_DIR, { mode: 0o700, recursive: true });
  }
}

// ============================================================================
// Credential Storage
// ============================================================================

/**
 * Save credentials to disk with secure file permissions
 *
 * @param credentials - The credentials to save
 */
export function saveCredentials(credentials: Credentials): void {
  ensureDonutDir();

  // Validate before saving
  const validated = CredentialsSchema.parse(credentials);

  writeFileSync(CREDENTIALS_FILE, JSON.stringify(validated, null, 2), {
    mode: 0o600, // Owner read/write only
    encoding: "utf-8",
  });

  // Ensure permissions are set correctly (in case file already existed)
  chmodSync(CREDENTIALS_FILE, 0o600);
}

/**
 * Load credentials from disk
 *
 * @returns Credentials if valid file exists, null otherwise
 */
export function loadCredentials(): Credentials | null {
  if (!existsSync(CREDENTIALS_FILE)) {
    return null;
  }

  try {
    const content = readFileSync(CREDENTIALS_FILE, "utf-8");
    const data = JSON.parse(content);
    return CredentialsSchema.parse(data);
  } catch {
    // Invalid credentials file - return null to trigger re-auth
    return null;
  }
}

/**
 * Clear stored credentials (logout)
 */
export function clearCredentials(): boolean {
  if (!existsSync(CREDENTIALS_FILE)) {
    return false;
  }

  try {
    // Overwrite with empty object before deleting for security
    writeFileSync(CREDENTIALS_FILE, "{}", { mode: 0o600, encoding: "utf-8" });

    // Use unlink to delete
    const { unlinkSync } = require("fs");
    unlinkSync(CREDENTIALS_FILE);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if credentials file exists
 */
export function hasCredentials(): boolean {
  return existsSync(CREDENTIALS_FILE);
}

// ============================================================================
// Token Management
// ============================================================================

/**
 * Check if the access token is expired or about to expire
 *
 * @param credentials - Current credentials
 * @returns true if token needs refresh
 */
export function isTokenExpired(credentials: Credentials): boolean {
  return Date.now() >= credentials.expiresAt - TOKEN_REFRESH_THRESHOLD_MS;
}

/**
 * Check if token is completely expired (past expiry time)
 */
export function isTokenFullyExpired(credentials: Credentials): boolean {
  return Date.now() >= credentials.expiresAt;
}

/**
 * Get time until token expiry in human-readable format
 */
export function getTokenExpiryInfo(credentials: Credentials): {
  expiresAt: Date;
  timeRemaining: string;
  isExpired: boolean;
  needsRefresh: boolean;
} {
  const expiresAt = new Date(credentials.expiresAt);
  const remaining = credentials.expiresAt - Date.now();
  const isExpired = remaining <= 0;
  const needsRefresh = remaining < TOKEN_REFRESH_THRESHOLD_MS;

  let timeRemaining: string;
  if (isExpired) {
    timeRemaining = "Expired";
  } else if (remaining < 60 * 1000) {
    timeRemaining = `${Math.ceil(remaining / 1000)} seconds`;
  } else if (remaining < 60 * 60 * 1000) {
    timeRemaining = `${Math.ceil(remaining / (60 * 1000))} minutes`;
  } else {
    timeRemaining = `${Math.ceil(remaining / (60 * 60 * 1000))} hours`;
  }

  return { expiresAt, timeRemaining, isExpired, needsRefresh };
}

/**
 * Update credentials with new access token from refresh
 *
 * @param accessToken - New access token
 * @param expiresIn - Token lifetime in seconds
 */
export function updateAccessToken(accessToken: string, expiresIn: number): void {
  const credentials = loadCredentials();
  if (!credentials) {
    throw new Error("No credentials to update");
  }

  const updated: Credentials = {
    ...credentials,
    accessToken,
    expiresAt: Date.now() + expiresIn * 1000,
  };

  saveCredentials(updated);
}

/**
 * Update credentials with wallet information
 */
export function updateWallets(wallets: TurnkeyWallet[]): void {
  const credentials = loadCredentials();
  if (!credentials) {
    throw new Error("No credentials to update");
  }

  const updated: Credentials = {
    ...credentials,
    wallets,
  };

  saveCredentials(updated);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get the path to the credentials file (for display purposes)
 */
export function getCredentialsPath(): string {
  return CREDENTIALS_FILE;
}

/**
 * Get user email from credentials if authenticated
 */
export function getUserEmail(): string | null {
  const credentials = loadCredentials();
  return credentials?.userEmail ?? null;
}

/**
 * Get stored wallet addresses
 */
export function getStoredWallets(): TurnkeyWallet[] | null {
  const credentials = loadCredentials();
  return credentials?.wallets ?? null;
}

/**
 * Get wallet address for a specific chain
 */
export function getWalletAddressForChain(chain: "solana" | "evm"): string | null {
  const wallets = getStoredWallets();
  if (!wallets) return null;

  const wallet = wallets.find((w) => w.chain === chain);
  return wallet?.address ?? null;
}
