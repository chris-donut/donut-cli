/**
 * Error Utilities - Centralized error handling for Donut CLI
 *
 * Custom error classes and utilities for consistent error handling
 * across the application.
 */

import chalk from "chalk";

// ============================================================================
// Custom Error Classes
// ============================================================================

/**
 * Base error class for all Donut CLI errors
 */
export class DonutError extends Error {
  public readonly code: string;
  public readonly context?: Record<string, unknown>;
  public readonly isRetriable: boolean;
  public readonly originalCause?: Error;

  constructor(
    message: string,
    options: {
      code?: string;
      context?: Record<string, unknown>;
      isRetriable?: boolean;
      cause?: Error;
    } = {}
  ) {
    super(message);
    this.name = "DonutError";
    this.code = options.code || "UNKNOWN_ERROR";
    this.context = options.context;
    this.isRetriable = options.isRetriable ?? false;
    this.originalCause = options.cause;

    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Configuration-related errors
 */
export class ConfigError extends DonutError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, {
      code: "CONFIG_ERROR",
      context,
      isRetriable: false,
    });
    this.name = "ConfigError";
  }
}

/**
 * API/Network errors (potentially retriable)
 */
export class ApiError extends DonutError {
  public readonly statusCode?: number;
  public readonly endpoint?: string;

  constructor(
    message: string,
    options: {
      statusCode?: number;
      endpoint?: string;
      context?: Record<string, unknown>;
      cause?: Error;
    } = {}
  ) {
    const isRetriable =
      options.statusCode !== undefined &&
      (options.statusCode >= 500 || options.statusCode === 429);

    super(message, {
      code: "API_ERROR",
      context: options.context,
      isRetriable,
      cause: options.cause,
    });
    this.name = "ApiError";
    this.statusCode = options.statusCode;
    this.endpoint = options.endpoint;
  }
}

/**
 * Validation errors
 */
export class ValidationError extends DonutError {
  public readonly field?: string;
  public readonly value?: unknown;

  constructor(
    message: string,
    options: {
      field?: string;
      value?: unknown;
      context?: Record<string, unknown>;
    } = {}
  ) {
    super(message, {
      code: "VALIDATION_ERROR",
      context: options.context,
      isRetriable: false,
    });
    this.name = "ValidationError";
    this.field = options.field;
    this.value = options.value;
  }
}

/**
 * Session-related errors
 */
export class SessionError extends DonutError {
  public readonly sessionId?: string;

  constructor(
    message: string,
    options: {
      sessionId?: string;
      context?: Record<string, unknown>;
      cause?: Error;
    } = {}
  ) {
    super(message, {
      code: "SESSION_ERROR",
      context: options.context,
      isRetriable: false,
      cause: options.cause,
    });
    this.name = "SessionError";
    this.sessionId = options.sessionId;
  }
}

/**
 * Agent execution errors
 */
export class AgentError extends DonutError {
  public readonly agentType?: string;

  constructor(
    message: string,
    options: {
      agentType?: string;
      context?: Record<string, unknown>;
      cause?: Error;
      isRetriable?: boolean;
    } = {}
  ) {
    super(message, {
      code: "AGENT_ERROR",
      context: options.context,
      isRetriable: options.isRetriable ?? true,
      cause: options.cause,
    });
    this.name = "AgentError";
    this.agentType = options.agentType;
  }
}

/**
 * Risk management errors
 */
export class RiskError extends DonutError {
  public readonly riskType?: string;
  public readonly limit?: number;
  public readonly actual?: number;

  constructor(
    message: string,
    options: {
      riskType?: string;
      limit?: number;
      actual?: number;
      context?: Record<string, unknown>;
    } = {}
  ) {
    super(message, {
      code: "RISK_ERROR",
      context: options.context,
      isRetriable: false,
    });
    this.name = "RiskError";
    this.riskType = options.riskType;
    this.limit = options.limit;
    this.actual = options.actual;
  }
}

/**
 * Feature not implemented
 */
export class NotImplementedError extends DonutError {
  public readonly feature: string;

  constructor(feature: string) {
    super(`Feature not implemented: ${feature}`, {
      code: "NOT_IMPLEMENTED",
      isRetriable: false,
    });
    this.name = "NotImplementedError";
    this.feature = feature;
  }
}

// ============================================================================
// Error Formatting Utilities
// ============================================================================

/**
 * Format an error for display in the terminal
 */
export function formatError(error: unknown): string {
  if (error instanceof DonutError) {
    let msg = `${chalk.red("Error:")} ${error.message}`;
    if (error.code !== "UNKNOWN_ERROR") {
      msg += chalk.gray(` [${error.code}]`);
    }
    return msg;
  }

  if (error instanceof Error) {
    return `${chalk.red("Error:")} ${error.message}`;
  }

  return `${chalk.red("Error:")} ${String(error)}`;
}

/**
 * Format an error with full details (for debugging)
 */
export function formatErrorVerbose(error: unknown): string {
  if (error instanceof DonutError) {
    const lines = [
      chalk.red(`[${error.name}] ${error.message}`),
      chalk.gray(`  Code: ${error.code}`),
    ];

    if (error.isRetriable) {
      lines.push(chalk.yellow("  (Retriable)"));
    }

    if (error.context) {
      lines.push(chalk.gray(`  Context: ${JSON.stringify(error.context)}`));
    }

    if (error instanceof ApiError) {
      if (error.statusCode) {
        lines.push(chalk.gray(`  Status: ${error.statusCode}`));
      }
      if (error.endpoint) {
        lines.push(chalk.gray(`  Endpoint: ${error.endpoint}`));
      }
    }

    if (error.originalCause) {
      lines.push(chalk.gray(`  Caused by: ${(error.originalCause as Error).message}`));
    }

    if (error.stack) {
      lines.push(chalk.gray("\nStack trace:"));
      lines.push(chalk.gray(error.stack));
    }

    return lines.join("\n");
  }

  if (error instanceof Error) {
    return `${chalk.red(error.name)}: ${error.message}\n${chalk.gray(error.stack || "")}`;
  }

  return `${chalk.red("Unknown error:")} ${String(error)}`;
}

/**
 * Log an error to console with appropriate formatting
 */
export function logError(error: unknown, verbose = false): void {
  if (verbose) {
    console.error(formatErrorVerbose(error));
  } else {
    console.error(formatError(error));
  }
}

// ============================================================================
// Error Handling Utilities
// ============================================================================

/**
 * Extract error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Check if an error is retriable
 */
export function isRetriableError(error: unknown): boolean {
  if (error instanceof DonutError) {
    return error.isRetriable;
  }
  return false;
}

/**
 * Wrap an async function with error handling
 */
export function withErrorHandling<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  options: {
    onError?: (error: unknown) => void;
    rethrow?: boolean;
    verbose?: boolean;
  } = {}
): T {
  const { onError, rethrow = false, verbose = false } = options;

  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (onError) {
        onError(error);
      } else {
        logError(error, verbose);
      }

      if (rethrow) {
        throw error;
      }
      return undefined;
    }
  }) as T;
}

/**
 * Retry an async operation with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    onRetry?: (attempt: number, error: unknown) => void;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    onRetry,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry non-retriable errors
      if (!isRetriableError(error)) {
        throw error;
      }

      if (attempt < maxAttempts) {
        const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);

        if (onRetry) {
          onRetry(attempt, error);
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isDonutError(error: unknown): error is DonutError {
  return error instanceof DonutError;
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function isConfigError(error: unknown): error is ConfigError {
  return error instanceof ConfigError;
}

export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

export function isSessionError(error: unknown): error is SessionError {
  return error instanceof SessionError;
}

export function isAgentError(error: unknown): error is AgentError {
  return error instanceof AgentError;
}

export function isRiskError(error: unknown): error is RiskError {
  return error instanceof RiskError;
}
