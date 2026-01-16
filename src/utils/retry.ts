/**
 * Retry Utility with Exponential Backoff
 *
 * Provides robust retry logic for transient failures with:
 * - Configurable max retries and base delay
 * - Exponential backoff with optional jitter
 * - Custom shouldRetry predicate for fine-grained control
 * - RetryableError class for explicit retry signaling
 */

import { createLogger } from "../core/logger.js";

const logger = createLogger("retry");

// ============================================================================
// Types
// ============================================================================

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in milliseconds (default: 1000) */
  baseDelay?: number;
  /** Maximum delay cap in milliseconds (default: 30000) */
  maxDelay?: number;
  /** Add random jitter to delays (default: true) */
  jitter?: boolean;
  /** Custom predicate to determine if error is retryable */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Callback invoked before each retry */
  onRetry?: (error: unknown, attempt: number, delay: number) => void;
}

// ============================================================================
// RetryableError Class
// ============================================================================

/**
 * Error class that explicitly signals an operation should be retried
 *
 * @example
 * ```typescript
 * if (response.status === 429) {
 *   throw new RetryableError("Rate limited", { retryAfter: 5000 });
 * }
 * ```
 */
export class RetryableError extends Error {
  public readonly retryAfter?: number;
  public readonly context?: Record<string, unknown>;
  public readonly originalCause?: Error;

  constructor(
    message: string,
    options: {
      retryAfter?: number;
      context?: Record<string, unknown>;
      cause?: Error;
    } = {}
  ) {
    super(message);
    this.name = "RetryableError";
    this.retryAfter = options.retryAfter;
    this.context = options.context;
    this.originalCause = options.cause;
  }
}

// ============================================================================
// Default Retry Predicate
// ============================================================================

/**
 * Default logic to determine if an error should be retried
 */
export function defaultShouldRetry(error: unknown): boolean {
  // Always retry RetryableError
  if (error instanceof RetryableError) {
    return true;
  }

  // Retry network errors
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (
      message.includes("network") ||
      message.includes("timeout") ||
      message.includes("econnrefused") ||
      message.includes("econnreset") ||
      message.includes("socket hang up") ||
      message.includes("fetch failed")
    ) {
      return true;
    }
  }

  // Retry errors with isRetriable flag
  if (
    error &&
    typeof error === "object" &&
    "isRetriable" in error &&
    (error as { isRetriable: boolean }).isRetriable
  ) {
    return true;
  }

  return false;
}

// ============================================================================
// withRetry Function
// ============================================================================

/**
 * Execute an async function with exponential backoff retry logic
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   () => fetchData(url),
 *   {
 *     maxRetries: 5,
 *     baseDelay: 500,
 *     shouldRetry: (err) => err instanceof NetworkError,
 *     onRetry: (err, attempt) => console.log(`Retry ${attempt}...`)
 *   }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    jitter = true,
    shouldRetry = defaultShouldRetry,
    onRetry,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      if (attempt >= maxRetries || !shouldRetry(error, attempt)) {
        throw error;
      }

      // Calculate delay with exponential backoff
      let delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);

      // Check if RetryableError specifies a delay
      if (error instanceof RetryableError && error.retryAfter) {
        delay = error.retryAfter;
      }

      // Add jitter (±25%)
      if (jitter) {
        const jitterFactor = 0.75 + Math.random() * 0.5;
        delay = Math.floor(delay * jitterFactor);
      }

      logger.debug("Retrying operation", {
        attempt: attempt + 1,
        maxRetries,
        delayMs: delay,
        error: error instanceof Error ? error.message : String(error),
      });

      // Invoke callback if provided
      if (onRetry) {
        onRetry(error, attempt + 1, delay);
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Retry with simple defaults (3 retries, 1s base delay)
 */
export async function retrySimple<T>(fn: () => Promise<T>): Promise<T> {
  return withRetry(fn);
}

/**
 * Retry with aggressive settings for critical operations
 */
export async function retryAggressive<T>(fn: () => Promise<T>): Promise<T> {
  return withRetry(fn, {
    maxRetries: 5,
    baseDelay: 500,
    maxDelay: 60000,
  });
}

/**
 * Retry with quick settings for fast failures
 */
export async function retryQuick<T>(fn: () => Promise<T>): Promise<T> {
  return withRetry(fn, {
    maxRetries: 2,
    baseDelay: 250,
    maxDelay: 2000,
  });
}
