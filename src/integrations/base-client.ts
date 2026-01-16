/**
 * Base HTTP Client
 *
 * Abstract base class for HTTP API clients with shared functionality:
 * - Timeout handling with AbortController
 * - JSON serialization/deserialization
 * - Error handling with status codes
 * - Optional authentication headers
 */

import { ApiError } from "../core/errors.js";

// ============================================================================
// Types
// ============================================================================

/**
 * HTTP methods supported by the client
 */
export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

/**
 * Base configuration for HTTP clients
 */
export interface BaseClientConfig {
  /** Base URL for the API (e.g., "http://localhost:8000") */
  baseUrl: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Default headers to include in all requests */
  defaultHeaders?: Record<string, string>;
}

/**
 * Request options for individual requests
 */
export interface RequestOptions {
  /** Additional headers for this request */
  headers?: Record<string, string>;
  /** Override timeout for this request */
  timeout?: number;
  /** Query parameters */
  params?: Record<string, string | number | boolean>;
}

// ============================================================================
// Base Client Implementation
// ============================================================================

/**
 * Abstract base class for HTTP API clients
 */
export abstract class BaseHttpClient {
  protected readonly baseUrl: string;
  protected readonly timeout: number;
  protected readonly defaultHeaders: Record<string, string>;

  constructor(config: BaseClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ""); // Remove trailing slash
    this.timeout = config.timeout ?? 30000;
    this.defaultHeaders = {
      "Content-Type": "application/json",
      ...config.defaultHeaders,
    };
  }

  /**
   * Get the client name for error messages
   */
  protected abstract getClientName(): string;

  /**
   * Make an HTTP request
   */
  protected async request<T = Record<string, unknown>>(
    method: HttpMethod,
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    // Build URL with query parameters
    let url = `${this.baseUrl}${path}`;
    if (options?.params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(options.params)) {
        searchParams.append(key, String(value));
      }
      url += `?${searchParams.toString()}`;
    }

    // Merge headers
    const headers: Record<string, string> = {
      ...this.defaultHeaders,
      ...options?.headers,
    };

    // Setup timeout
    const controller = new AbortController();
    const timeoutMs = options?.timeout ?? this.timeout;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new ApiError(
          `${this.getClientName()} API error (${response.status}): ${errorText}`,
          {
            statusCode: response.status,
            endpoint: path,
            context: { method, url },
          }
        );
      }

      // Handle empty responses
      const text = await response.text();
      if (!text) {
        return {} as T;
      }

      return JSON.parse(text) as T;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      // Handle abort (timeout)
      if (error instanceof Error && error.name === "AbortError") {
        throw new ApiError(
          `${this.getClientName()} request timed out after ${timeoutMs}ms`,
          {
            statusCode: 408,
            endpoint: path,
            context: { method, url, timeout: timeoutMs },
          }
        );
      }

      // Handle network errors
      throw new ApiError(
        `${this.getClientName()} network error: ${error instanceof Error ? error.message : String(error)}`,
        {
          endpoint: path,
          context: { method, url },
          cause: error instanceof Error ? error : undefined,
        }
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Convenience method for GET requests
   */
  protected get<T = Record<string, unknown>>(
    path: string,
    options?: RequestOptions
  ): Promise<T> {
    return this.request<T>("GET", path, undefined, options);
  }

  /**
   * Convenience method for POST requests
   */
  protected post<T = Record<string, unknown>>(
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    return this.request<T>("POST", path, body, options);
  }

  /**
   * Convenience method for PUT requests
   */
  protected put<T = Record<string, unknown>>(
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    return this.request<T>("PUT", path, body, options);
  }

  /**
   * Convenience method for DELETE requests
   */
  protected delete<T = Record<string, unknown>>(
    path: string,
    options?: RequestOptions
  ): Promise<T> {
    return this.request<T>("DELETE", path, undefined, options);
  }

  /**
   * Health check - override in subclasses for specific endpoints
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.get("/health");
      return true;
    } catch {
      return false;
    }
  }
}

// ============================================================================
// Authenticated Client
// ============================================================================

/**
 * Configuration for authenticated clients
 */
export interface AuthenticatedClientConfig extends BaseClientConfig {
  /** Bearer token for authentication */
  authToken?: string;
  /** API key header name and value */
  apiKey?: { headerName: string; value: string };
}

/**
 * Base class for clients that require authentication
 */
export abstract class AuthenticatedHttpClient extends BaseHttpClient {
  protected readonly authToken?: string;
  protected readonly apiKey?: { headerName: string; value: string };

  constructor(config: AuthenticatedClientConfig) {
    // Build default headers with auth
    const defaultHeaders: Record<string, string> = {
      ...config.defaultHeaders,
    };

    if (config.authToken) {
      defaultHeaders["Authorization"] = `Bearer ${config.authToken}`;
    }

    if (config.apiKey) {
      defaultHeaders[config.apiKey.headerName] = config.apiKey.value;
    }

    super({ ...config, defaultHeaders });
    this.authToken = config.authToken;
    this.apiKey = config.apiKey;
  }

  /**
   * Check if the client has authentication configured
   */
  hasAuth(): boolean {
    return !!this.authToken || !!this.apiKey;
  }
}
