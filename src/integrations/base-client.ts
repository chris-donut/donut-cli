/**
 * Base HTTP Client - Shared functionality for all API clients
 *
 * Provides consistent HTTP handling, timeout management, and error handling
 * across all backend integrations.
 */

import { ApiError } from "../core/errors.js";
import { TIMEOUTS, RETRY } from "../core/constants.js";

export interface BaseClientConfig {
  baseUrl: string;
  timeout?: number;
  authToken?: string;
}

export interface HttpRequestOptions {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * Abstract base class for HTTP API clients
 */
export abstract class BaseClient {
  protected readonly baseUrl: string;
  protected readonly timeout: number;
  protected readonly authToken?: string;

  constructor(config: BaseClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ""); // Remove trailing slash
    this.timeout = config.timeout || TIMEOUTS.httpRequest;
    this.authToken = config.authToken;
  }

  /**
   * Check if the backend service is healthy
   */
  abstract healthCheck(): Promise<boolean>;

  /**
   * Get the name of this client for logging
   */
  abstract getName(): string;

  /**
   * Make an HTTP request with timeout and error handling
   */
  protected async request<T = Record<string, unknown>>(
    options: HttpRequestOptions
  ): Promise<T> {
    const { method, path, body, headers: customHeaders } = options;
    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...customHeaders,
    };

    if (this.authToken) {
      headers["Authorization"] = `Bearer ${this.authToken}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new ApiError(`${this.getName()} API error: ${errorText}`, {
          statusCode: response.status,
          endpoint: path,
          context: { method, url },
        });
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new ApiError(`${this.getName()} request timeout after ${this.timeout}ms`, {
          statusCode: 408,
          endpoint: path,
          context: { method, url, timeout: this.timeout },
        });
      }

      throw new ApiError(`${this.getName()} request failed: ${error instanceof Error ? error.message : String(error)}`, {
        endpoint: path,
        context: { method, url },
        cause: error instanceof Error ? error : undefined,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Make a GET request
   */
  protected get<T = Record<string, unknown>>(path: string): Promise<T> {
    return this.request<T>({ method: "GET", path });
  }

  /**
   * Make a POST request
   */
  protected post<T = Record<string, unknown>>(
    path: string,
    body?: unknown
  ): Promise<T> {
    return this.request<T>({ method: "POST", path, body });
  }

  /**
   * Execute with retry logic for retriable errors
   */
  protected async withRetry<T>(
    fn: () => Promise<T>,
    options: {
      maxAttempts?: number;
      baseDelay?: number;
      maxDelay?: number;
    } = {}
  ): Promise<T> {
    const {
      maxAttempts = RETRY.maxAttempts,
      baseDelay = RETRY.baseDelay,
      maxDelay = RETRY.maxDelay,
    } = options;

    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        // Only retry on network/timeout errors (5xx, 429)
        if (error instanceof ApiError && error.isRetriable && attempt < maxAttempts) {
          const delay = Math.min(baseDelay * Math.pow(RETRY.backoffMultiplier, attempt - 1), maxDelay);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        throw error;
      }
    }

    throw lastError;
  }
}
