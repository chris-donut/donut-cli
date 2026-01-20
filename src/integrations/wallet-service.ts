/**
 * Wallet Service Client
 *
 * Typed client for donut-wallet-service API. Handles all communication with the
 * wallet service including OAuth flow initiation, user info, wallet management,
 * and delegated transaction signing.
 *
 * Uses JWT auth headers and supports automatic token refresh via the auth provider.
 */

import {
  loadCredentials,
  saveCredentials,
  updateAccessToken,
  updateWallets,
  isTokenExpired,
  type Credentials,
  type TurnkeyWallet,
} from "../core/credentials.js";

// ============================================================================
// Configuration
// ============================================================================

const WALLET_SERVICE_URL =
  process.env.WALLET_SERVICE_URL || "http://localhost:3001";

// ============================================================================
// Error Types
// ============================================================================

export class WalletServiceError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public code?: string
  ) {
    super(message);
    this.name = "WalletServiceError";
  }
}

export class AuthenticationError extends WalletServiceError {
  constructor(message = "Authentication required. Run `donut auth login`.") {
    super(message, 401, "AUTH_REQUIRED");
    this.name = "AuthenticationError";
  }
}

export class TokenExpiredError extends WalletServiceError {
  constructor() {
    super("Token expired. Run `donut auth login` to refresh.", 401, "TOKEN_EXPIRED");
    this.name = "TokenExpiredError";
  }
}

export class ServiceUnavailableError extends WalletServiceError {
  constructor() {
    super(
      "Wallet service unavailable. Check WALLET_SERVICE_URL or run `donut auth login`.",
      503,
      "SERVICE_UNAVAILABLE"
    );
    this.name = "ServiceUnavailableError";
  }
}

// ============================================================================
// Response Types
// ============================================================================

export interface WalletServiceUser {
  id: string;
  email: string;
  name?: string;
  createdAt: string;
  turnkeyUserId?: string;
}

export interface WalletInfo {
  id: string;
  chain: "solana" | "evm";
  address: string;
  name?: string;
  createdAt: string;
}

export interface LinkedAccount {
  provider: "google" | "twitter" | "telegram";
  providerId: string;
  email?: string;
}

export interface SignTransactionRequest {
  chain: "solana" | "evm";
  transaction: string; // Base64-encoded transaction
  walletId?: string; // Optional - uses default wallet if not specified
}

export interface SignTransactionResponse {
  signature: string;
  txHash?: string; // If transaction was also sent
}

export interface RefreshTokenResponse {
  accessToken: string;
  expiresIn: number; // Seconds
}

// ============================================================================
// Wallet Service Client Class
// ============================================================================

export class WalletServiceClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || WALLET_SERVICE_URL;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Get authorization header with current access token
   */
  private getAuthHeader(): string | null {
    const credentials = loadCredentials();
    if (!credentials) return null;
    return `Bearer ${credentials.accessToken}`;
  }

  /**
   * Make authenticated request to wallet service
   */
  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const authHeader = this.getAuthHeader();
    if (!authHeader) {
      throw new AuthenticationError();
    }

    const credentials = loadCredentials();
    if (credentials && isTokenExpired(credentials)) {
      // Try to refresh token
      try {
        await this.refreshToken();
      } catch {
        throw new TokenExpiredError();
      }
    }

    const url = `${this.baseUrl}${path}`;
    const headers = {
      "Content-Type": "application/json",
      Authorization: this.getAuthHeader()!,
      ...options.headers,
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        let errorMessage = `HTTP ${response.status}`;

        try {
          const errorJson = JSON.parse(errorBody);
          errorMessage = errorJson.message || errorJson.error || errorMessage;
        } catch {
          errorMessage = errorBody || errorMessage;
        }

        if (response.status === 401) {
          throw new TokenExpiredError();
        }

        throw new WalletServiceError(errorMessage, response.status);
      }

      return response.json() as Promise<T>;
    } catch (error) {
      if (error instanceof WalletServiceError) {
        throw error;
      }

      // Network error
      if (error instanceof TypeError && error.message.includes("fetch")) {
        throw new ServiceUnavailableError();
      }

      throw new WalletServiceError(
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  // ==========================================================================
  // OAuth Flow
  // ==========================================================================

  /**
   * Get the Google OAuth authorization URL
   *
   * The CLI should open this URL in the browser and then listen for the callback.
   */
  async getGoogleAuthUrl(redirectUri: string): Promise<string> {
    const response = await fetch(
      `${this.baseUrl}/v1/turnkey/auth/google?redirect_uri=${encodeURIComponent(redirectUri)}`,
      { method: "GET" }
    );

    if (!response.ok) {
      throw new WalletServiceError("Failed to get auth URL", response.status);
    }

    const data = (await response.json()) as { url: string };
    return data.url;
  }

  /**
   * Exchange OAuth callback code for tokens
   *
   * Called after user completes Google OAuth and is redirected back with code.
   */
  async handleOAuthCallback(
    code: string,
    redirectUri: string
  ): Promise<Credentials> {
    const response = await fetch(
      `${this.baseUrl}/v1/turnkey/auth/google/callback`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, redirect_uri: redirectUri }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new WalletServiceError(`OAuth callback failed: ${error}`, response.status);
    }

    const data = (await response.json()) as {
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      user: { email: string };
    };

    const credentials: Credentials = {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: Date.now() + data.expiresIn * 1000,
      userEmail: data.user.email,
    };

    saveCredentials(credentials);
    return credentials;
  }

  /**
   * Refresh the access token using refresh token
   */
  async refreshToken(): Promise<void> {
    const credentials = loadCredentials();
    if (!credentials) {
      throw new AuthenticationError();
    }

    const response = await fetch(`${this.baseUrl}/v1/turnkey/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: credentials.refreshToken }),
    });

    if (!response.ok) {
      throw new TokenExpiredError();
    }

    const data = (await response.json()) as RefreshTokenResponse;
    updateAccessToken(data.accessToken, data.expiresIn);
  }

  // ==========================================================================
  // User Management
  // ==========================================================================

  /**
   * Get current user information
   */
  async getUser(): Promise<WalletServiceUser> {
    return this.request<WalletServiceUser>("/v1/turnkey/users/me");
  }

  /**
   * Get user's linked accounts (OAuth providers)
   */
  async getLinkedAccounts(): Promise<LinkedAccount[]> {
    return this.request<LinkedAccount[]>("/v1/turnkey/users/me/linked-accounts");
  }

  // ==========================================================================
  // Wallet Management
  // ==========================================================================

  /**
   * Get all wallets for the current user
   */
  async getWallets(): Promise<WalletInfo[]> {
    const wallets = await this.request<WalletInfo[]>("/v1/turnkey/wallets");

    // Update stored wallet addresses
    const turnkeyWallets: TurnkeyWallet[] = wallets.map((w) => ({
      id: w.id,
      chain: w.chain,
      address: w.address,
      name: w.name,
    }));
    updateWallets(turnkeyWallets);

    return wallets;
  }

  /**
   * Get wallet for a specific chain
   */
  async getWalletForChain(chain: "solana" | "evm"): Promise<WalletInfo | null> {
    const wallets = await this.getWallets();
    return wallets.find((w) => w.chain === chain) || null;
  }

  /**
   * Get wallet balance (delegates to appropriate chain RPC)
   */
  async getWalletBalance(
    walletId: string
  ): Promise<{ balance: string; symbol: string }> {
    return this.request<{ balance: string; symbol: string }>(
      `/v1/turnkey/wallets/${walletId}/balance`
    );
  }

  // ==========================================================================
  // Transaction Signing
  // ==========================================================================

  /**
   * Sign and send a transaction using Turnkey delegated signing
   *
   * The transaction is signed by Turnkey's HSM and optionally submitted to the network.
   */
  async signAndSendTransaction(
    request: SignTransactionRequest
  ): Promise<SignTransactionResponse> {
    // Get wallet ID if not provided
    let walletId = request.walletId;
    if (!walletId) {
      const wallet = await this.getWalletForChain(request.chain);
      if (!wallet) {
        throw new WalletServiceError(
          `No ${request.chain} wallet found. Wallet may not be provisioned.`
        );
      }
      walletId = wallet.id;
    }

    return this.request<SignTransactionResponse>(
      `/v1/turnkey/wallets/${walletId}/sign_and_send_transaction`,
      {
        method: "POST",
        body: JSON.stringify({
          transaction: request.transaction,
        }),
      }
    );
  }

  /**
   * Sign a transaction without sending (for preview/dry-run)
   */
  async signTransaction(
    request: SignTransactionRequest
  ): Promise<{ signature: string }> {
    let walletId = request.walletId;
    if (!walletId) {
      const wallet = await this.getWalletForChain(request.chain);
      if (!wallet) {
        throw new WalletServiceError(
          `No ${request.chain} wallet found. Wallet may not be provisioned.`
        );
      }
      walletId = wallet.id;
    }

    return this.request<{ signature: string }>(
      `/v1/turnkey/wallets/${walletId}/sign_transaction`,
      {
        method: "POST",
        body: JSON.stringify({
          transaction: request.transaction,
        }),
      }
    );
  }

  // ==========================================================================
  // Health Check
  // ==========================================================================

  /**
   * Check if wallet service is reachable
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get wallet service URL (for display)
   */
  getServiceUrl(): string {
    return this.baseUrl;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let clientInstance: WalletServiceClient | null = null;

/**
 * Get singleton wallet service client instance
 */
export function getWalletServiceClient(): WalletServiceClient {
  if (!clientInstance) {
    clientInstance = new WalletServiceClient();
  }
  return clientInstance;
}

/**
 * Check if Turnkey auth is available (credentials exist and not expired)
 */
export function isTurnkeyAuthAvailable(): boolean {
  const credentials = loadCredentials();
  if (!credentials) return false;
  // Consider it available even if expired - we'll try refresh
  return true;
}

/**
 * Check if we should use Turnkey auth vs legacy private keys
 *
 * Returns true if:
 * - Credentials file exists (user has authenticated at least once)
 *
 * Returns false if:
 * - No credentials file (user never authenticated, use legacy keys)
 */
export function shouldUseTurnkeyAuth(): boolean {
  return isTurnkeyAuthAvailable();
}
