/**
 * Turnkey Authentication Provider for MCP Tools
 *
 * Provides transparent authentication for MCP wallet tools using Turnkey.
 * When Turnkey auth is available (credentials exist), all wallet operations
 * route through the wallet-service API for delegated signing.
 *
 * Security Model (Fail-Closed):
 * - If authenticated but wallet-service unreachable: BLOCK operation
 * - If authenticated but token expired: BLOCK and prompt re-auth
 * - Only fall back to env var keys if NEVER authenticated (no credentials file)
 */

import {
  loadCredentials,
  hasCredentials,
  isTokenExpired,
  getWalletAddressForChain,
  getTokenExpiryInfo,
  type Credentials,
  type TurnkeyWallet,
} from "../../core/credentials.js";
import {
  WalletServiceClient,
  getWalletServiceClient,
  WalletServiceError,
  AuthenticationError,
  TokenExpiredError,
  ServiceUnavailableError,
} from "../../integrations/wallet-service.js";

// ============================================================================
// Types
// ============================================================================

export type AuthMode = "turnkey" | "legacy" | "none";

export interface AuthStatus {
  mode: AuthMode;
  isAuthenticated: boolean;
  userEmail?: string;
  wallets?: TurnkeyWallet[];
  error?: string;
}

export interface ChainAuthStatus {
  chain: "solana" | "evm";
  mode: AuthMode;
  address?: string;
  ready: boolean;
  error?: string;
}

// ============================================================================
// Turnkey Auth Provider Class
// ============================================================================

export class TurnkeyAuthProvider {
  private client: WalletServiceClient;
  private cachedCredentials: Credentials | null = null;
  private lastCredentialsCheck = 0;
  private readonly CREDENTIALS_CACHE_TTL = 5000; // 5 seconds

  constructor() {
    this.client = getWalletServiceClient();
  }

  // ==========================================================================
  // Authentication Status
  // ==========================================================================

  /**
   * Check if Turnkey authentication is available
   *
   * Returns true if credentials file exists (user has authenticated at least once).
   * Does NOT check if credentials are still valid - use isAuthenticated() for that.
   */
  hasTurnkeyAuth(): boolean {
    return hasCredentials();
  }

  /**
   * Check if currently authenticated with valid (non-expired) token
   */
  isAuthenticated(): boolean {
    const credentials = this.getCredentials();
    if (!credentials) return false;

    const expiryInfo = getTokenExpiryInfo(credentials);
    return !expiryInfo.isExpired;
  }

  /**
   * Get current auth mode
   *
   * - "turnkey": User has authenticated via Turnkey (use wallet-service)
   * - "legacy": User has never authenticated (use env var keys if present)
   * - "none": No authentication available
   */
  getAuthMode(): AuthMode {
    if (this.hasTurnkeyAuth()) {
      return "turnkey";
    }

    // Check if legacy env vars are configured
    const hasSolanaKey = !!process.env.SOLANA_PRIVATE_KEY;
    const hasBaseKey = !!process.env.BASE_PRIVATE_KEY;

    if (hasSolanaKey || hasBaseKey) {
      return "legacy";
    }

    return "none";
  }

  /**
   * Get comprehensive auth status
   */
  async getAuthStatus(): Promise<AuthStatus> {
    const mode = this.getAuthMode();

    if (mode === "none") {
      return {
        mode: "none",
        isAuthenticated: false,
        error: "Not authenticated. Run `donut auth login` or set private key env vars.",
      };
    }

    if (mode === "legacy") {
      return {
        mode: "legacy",
        isAuthenticated: true,
      };
    }

    // Turnkey mode
    const credentials = this.getCredentials();
    if (!credentials) {
      return {
        mode: "turnkey",
        isAuthenticated: false,
        error: "Credentials not found. Run `donut auth login`.",
      };
    }

    const expiryInfo = getTokenExpiryInfo(credentials);
    if (expiryInfo.isExpired) {
      return {
        mode: "turnkey",
        isAuthenticated: false,
        userEmail: credentials.userEmail,
        error: "Session expired. Run `donut auth login`.",
      };
    }

    return {
      mode: "turnkey",
      isAuthenticated: true,
      userEmail: credentials.userEmail,
      wallets: credentials.wallets,
    };
  }

  // ==========================================================================
  // Chain-Specific Status
  // ==========================================================================

  /**
   * Get auth status for a specific chain
   */
  getChainAuthStatus(chain: "solana" | "evm"): ChainAuthStatus {
    const mode = this.getAuthMode();

    if (mode === "none") {
      return {
        chain,
        mode: "none",
        ready: false,
        error: `No authentication for ${chain}. Run \`donut auth login\` or set ${chain === "solana" ? "SOLANA_PRIVATE_KEY" : "BASE_PRIVATE_KEY"}.`,
      };
    }

    if (mode === "legacy") {
      const envVar = chain === "solana" ? "SOLANA_PRIVATE_KEY" : "BASE_PRIVATE_KEY";
      const hasKey = !!process.env[envVar];

      return {
        chain,
        mode: "legacy",
        ready: hasKey,
        error: hasKey ? undefined : `${envVar} not configured.`,
      };
    }

    // Turnkey mode
    const address = getWalletAddressForChain(chain);
    const credentials = this.getCredentials();
    const isExpired = credentials ? isTokenExpired(credentials) : true;

    return {
      chain,
      mode: "turnkey",
      address: address || undefined,
      ready: !isExpired && !!address,
      error: isExpired ? "Session expired. Run `donut auth login`." : undefined,
    };
  }

  // ==========================================================================
  // Token Access
  // ==========================================================================

  /**
   * Get access token for API calls
   *
   * IMPORTANT: This validates the token and may throw if expired.
   * Callers should handle TokenExpiredError.
   */
  getAccessToken(): string {
    const credentials = this.getCredentials();
    if (!credentials) {
      throw new AuthenticationError("Not authenticated. Run `donut auth login`.");
    }

    if (isTokenExpired(credentials)) {
      // Note: We don't auto-refresh here - that's handled by WalletServiceClient
      const expiryInfo = getTokenExpiryInfo(credentials);
      if (expiryInfo.isExpired) {
        throw new TokenExpiredError();
      }
    }

    return credentials.accessToken;
  }

  /**
   * Get refresh token (for refresh operations only)
   */
  getRefreshToken(): string | null {
    const credentials = this.getCredentials();
    return credentials?.refreshToken || null;
  }

  // ==========================================================================
  // Wallet Service Access
  // ==========================================================================

  /**
   * Get the wallet service client
   *
   * IMPORTANT: Only use this in Turnkey mode. Check getAuthMode() first.
   */
  getWalletServiceClient(): WalletServiceClient {
    if (this.getAuthMode() !== "turnkey") {
      throw new Error("Wallet service only available in Turnkey mode");
    }
    return this.client;
  }

  /**
   * Ensure wallet service is reachable
   *
   * @throws ServiceUnavailableError if service is not reachable
   */
  async ensureWalletServiceAvailable(): Promise<void> {
    if (this.getAuthMode() !== "turnkey") {
      return; // Not using wallet service
    }

    const isHealthy = await this.client.healthCheck();
    if (!isHealthy) {
      throw new ServiceUnavailableError();
    }
  }

  // ==========================================================================
  // Wallet Address Helpers
  // ==========================================================================

  /**
   * Get Solana wallet address (from Turnkey or derived from legacy key)
   */
  getSolanaAddress(): string | null {
    const mode = this.getAuthMode();

    if (mode === "turnkey") {
      return getWalletAddressForChain("solana");
    }

    // Legacy mode - would need to derive from private key
    // This is handled by the wallet.ts tool directly
    return null;
  }

  /**
   * Get EVM (Base) wallet address
   */
  getEvmAddress(): string | null {
    const mode = this.getAuthMode();

    if (mode === "turnkey") {
      return getWalletAddressForChain("evm");
    }

    // Legacy mode - would need to derive from private key
    // This is handled by the base-wallet.ts tool directly
    return null;
  }

  // ==========================================================================
  // Error Helpers
  // ==========================================================================

  /**
   * Get user-friendly error message for auth failures
   */
  getAuthErrorMessage(error: unknown): string {
    if (error instanceof TokenExpiredError) {
      return "Session expired. Run `donut auth login` to re-authenticate.";
    }

    if (error instanceof ServiceUnavailableError) {
      return `Wallet service unavailable at ${this.client.getServiceUrl()}. ` +
        "Check WALLET_SERVICE_URL or ensure the service is running.";
    }

    if (error instanceof AuthenticationError) {
      return error.message;
    }

    if (error instanceof WalletServiceError) {
      return `Wallet service error: ${error.message}`;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }

  /**
   * Check if error indicates auth is needed
   */
  isAuthError(error: unknown): boolean {
    return (
      error instanceof TokenExpiredError ||
      error instanceof AuthenticationError ||
      (error instanceof WalletServiceError && error.statusCode === 401)
    );
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Get credentials with caching to avoid repeated disk reads
   */
  private getCredentials(): Credentials | null {
    const now = Date.now();

    if (
      this.cachedCredentials &&
      now - this.lastCredentialsCheck < this.CREDENTIALS_CACHE_TTL
    ) {
      return this.cachedCredentials;
    }

    this.cachedCredentials = loadCredentials();
    this.lastCredentialsCheck = now;
    return this.cachedCredentials;
  }

  /**
   * Clear credentials cache (for logout)
   */
  clearCache(): void {
    this.cachedCredentials = null;
    this.lastCredentialsCheck = 0;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let providerInstance: TurnkeyAuthProvider | null = null;

/**
 * Get singleton TurnkeyAuthProvider instance
 */
export function getTurnkeyAuthProvider(): TurnkeyAuthProvider {
  if (!providerInstance) {
    providerInstance = new TurnkeyAuthProvider();
  }
  return providerInstance;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Check if should use Turnkey auth for a chain
 *
 * Returns true if Turnkey auth is available (user authenticated at least once).
 * This means we should route operations through wallet-service.
 */
export function shouldUseTurnkey(): boolean {
  return getTurnkeyAuthProvider().hasTurnkeyAuth();
}

/**
 * Get auth mode for display
 */
export function getAuthModeLabel(): string {
  const mode = getTurnkeyAuthProvider().getAuthMode();

  switch (mode) {
    case "turnkey":
      return "Turnkey (secure HSM)";
    case "legacy":
      return "Local private key";
    case "none":
      return "Not configured";
  }
}

/**
 * Require Turnkey authentication for an operation
 *
 * @throws AuthenticationError if not authenticated
 * @throws TokenExpiredError if token is expired
 * @throws ServiceUnavailableError if wallet service is unreachable
 */
export async function requireTurnkeyAuth(): Promise<TurnkeyAuthProvider> {
  const provider = getTurnkeyAuthProvider();

  if (!provider.hasTurnkeyAuth()) {
    throw new AuthenticationError(
      "This operation requires Turnkey authentication. Run `donut auth login`."
    );
  }

  if (!provider.isAuthenticated()) {
    throw new TokenExpiredError();
  }

  await provider.ensureWalletServiceAvailable();
  return provider;
}
