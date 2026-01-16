/**
 * Shared Utilities - Common helper functions used across the codebase
 */

import { z, ZodSchema, ZodError } from "zod";
import chalk from "chalk";
import { ConfigError, ValidationError } from "./errors.js";

// ============================================================================
// Configuration Loading Utilities
// ============================================================================

/**
 * Options for loadFromEnv
 */
interface LoadFromEnvOptions<T> {
  /** The Zod schema to validate against */
  schema: ZodSchema<T>;
  /** Environment variable prefix (e.g., "DONUT_" will look for DONUT_API_KEY) */
  prefix?: string;
  /** Mapping of schema keys to environment variable names */
  envMapping?: Record<string, string>;
  /** Default values to use if env vars are not set */
  defaults?: Partial<T>;
  /** Name of the configuration for error messages */
  configName?: string;
}

/**
 * Load configuration from environment variables with Zod validation
 */
export function loadFromEnv<T extends Record<string, unknown>>(
  options: LoadFromEnvOptions<T>
): T {
  const {
    schema,
    prefix = "",
    envMapping = {},
    defaults = {},
    configName = "configuration",
  } = options;

  // Get the shape of the schema if it's an object schema
  const shape =
    schema instanceof z.ZodObject ? (schema as z.ZodObject<z.ZodRawShape>).shape : {};

  // Build config object from environment
  const config: Record<string, unknown> = { ...defaults };

  for (const key of Object.keys(shape)) {
    // Check explicit mapping first, then try prefixed env var
    const envKey = envMapping[key] || `${prefix}${camelToScreamingSnake(key)}`;
    const envValue = process.env[envKey];

    if (envValue !== undefined) {
      // Try to parse as JSON for objects/arrays, otherwise use string
      try {
        config[key] = JSON.parse(envValue);
      } catch {
        config[key] = envValue;
      }
    }
  }

  // Validate with Zod
  const result = schema.safeParse(config);

  if (!result.success) {
    throw new ConfigError(
      formatZodError(result.error, configName),
      { errors: result.error.errors }
    );
  }

  return result.data;
}

/**
 * Format Zod errors into a human-readable message
 */
export function formatZodError(error: ZodError, context?: string): string {
  const prefix = context ? `Invalid ${context}:` : "Validation error:";
  const issues = error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "root";
    return `  - ${path}: ${issue.message}`;
  });
  return `${prefix}\n${issues.join("\n")}`;
}

/**
 * Convert camelCase to SCREAMING_SNAKE_CASE
 */
export function camelToScreamingSnake(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1_$2")
    .toUpperCase();
}

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Validate a value against a Zod schema, throwing ValidationError on failure
 */
export function validate<T>(
  schema: ZodSchema<T>,
  value: unknown,
  fieldName?: string
): T {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new ValidationError(formatZodError(result.error, fieldName), {
      field: fieldName,
      value,
    });
  }

  return result.data;
}

/**
 * Safe parse that returns null instead of throwing
 */
export function safeParse<T>(schema: ZodSchema<T>, value: unknown): T | null {
  const result = schema.safeParse(value);
  return result.success ? result.data : null;
}

// ============================================================================
// Date Utilities
// ============================================================================

/**
 * Serialize dates in an object to ISO strings
 */
export function serializeDates<T extends Record<string, unknown>>(obj: T): T {
  const result = { ...obj };

  for (const [key, value] of Object.entries(result)) {
    if (value instanceof Date) {
      (result as Record<string, unknown>)[key] = value.toISOString();
    } else if (Array.isArray(value)) {
      (result as Record<string, unknown>)[key] = value.map((item) =>
        item instanceof Date ? item.toISOString() : item
      );
    } else if (value && typeof value === "object") {
      (result as Record<string, unknown>)[key] = serializeDates(
        value as Record<string, unknown>
      );
    }
  }

  return result;
}

/**
 * Deserialize ISO date strings back to Date objects
 */
export function deserializeDates<T extends Record<string, unknown>>(
  obj: T,
  dateFields: string[]
): T {
  const result = { ...obj };

  for (const field of dateFields) {
    const value = result[field];
    if (typeof value === "string") {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        (result as Record<string, unknown>)[field] = date;
      }
    }
  }

  return result;
}

// ============================================================================
// String Utilities
// ============================================================================

/**
 * Truncate a string with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + "...";
}

/**
 * Pad a string to a fixed width
 */
export function padEnd(str: string, width: number, char = " "): string {
  return str.length >= width ? str : str + char.repeat(width - str.length);
}

/**
 * Format bytes to human readable size
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// ============================================================================
// Async Utilities
// ============================================================================

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute with timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage = "Operation timed out"
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

/**
 * Debounce a function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delayMs: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delayMs);
  };
}

// ============================================================================
// Object Utilities
// ============================================================================

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Pick specific keys from an object
 */
export function pick<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

/**
 * Omit specific keys from an object
 */
export function omit<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result as Omit<T, K>;
}

// ============================================================================
// Array Utilities
// ============================================================================

/**
 * Group array items by a key
 */
export function groupBy<T>(
  array: T[],
  keyFn: (item: T) => string
): Record<string, T[]> {
  return array.reduce(
    (groups, item) => {
      const key = keyFn(item);
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(item);
      return groups;
    },
    {} as Record<string, T[]>
  );
}

/**
 * Chunk an array into smaller arrays
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Get unique items from an array
 */
export function unique<T>(array: T[]): T[] {
  return [...new Set(array)];
}

/**
 * Get unique items by a key function
 */
export function uniqueBy<T>(array: T[], keyFn: (item: T) => unknown): T[] {
  const seen = new Set();
  return array.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
