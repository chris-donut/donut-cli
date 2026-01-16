/**
 * Structured Logging System with Pino
 *
 * Provides production-ready logging with:
 * - Fast JSON output via Pino for log aggregation
 * - LOG_LEVEL environment variable support
 * - Component tagging for filtering
 * - Pretty console output for development
 * - Child loggers for scoped context
 */

import pino, { Logger as PinoLogger, LoggerOptions } from "pino";

// ============================================================================
// Types
// ============================================================================

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

export interface LogEntry {
  timestamp: string;
  level: string;
  component: string;
  message: string;
  meta?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export interface LoggerConfig {
  level: LogLevel;
  jsonOutput: boolean;
  includeTimestamp: boolean;
  includeStack: boolean;
}

// ============================================================================
// Configuration
// ============================================================================

const LOG_LEVEL_MAP: Record<string, LogLevel> = {
  debug: LogLevel.DEBUG,
  info: LogLevel.INFO,
  warn: LogLevel.WARN,
  error: LogLevel.ERROR,
  silent: LogLevel.SILENT,
};

const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: "DEBUG",
  [LogLevel.INFO]: "INFO",
  [LogLevel.WARN]: "WARN",
  [LogLevel.ERROR]: "ERROR",
  [LogLevel.SILENT]: "SILENT",
};

const PINO_LEVEL_MAP: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: "debug",
  [LogLevel.INFO]: "info",
  [LogLevel.WARN]: "warn",
  [LogLevel.ERROR]: "error",
  [LogLevel.SILENT]: "silent",
};

/**
 * Get default configuration from environment
 */
function getDefaultConfig(): LoggerConfig {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase() || "info";
  const level = LOG_LEVEL_MAP[envLevel] ?? LogLevel.INFO;

  return {
    level,
    jsonOutput: process.env.LOG_FORMAT === "json" || process.env.NODE_ENV === "production",
    includeTimestamp: process.env.LOG_TIMESTAMPS !== "false",
    includeStack: process.env.LOG_STACK !== "false",
  };
}

// Global configuration
let globalConfig: LoggerConfig = getDefaultConfig();

/**
 * Update global logger configuration
 */
export function configureLogger(config: Partial<LoggerConfig>): void {
  globalConfig = { ...globalConfig, ...config };
}

/**
 * Set log level globally
 */
export function setLogLevel(level: LogLevel | string): void {
  if (typeof level === "string") {
    globalConfig.level = LOG_LEVEL_MAP[level.toLowerCase()] ?? LogLevel.INFO;
  } else {
    globalConfig.level = level;
  }
}

// ============================================================================
// Pino Configuration
// ============================================================================

function createPinoOptions(config: LoggerConfig): LoggerOptions {
  const pinoLevel = PINO_LEVEL_MAP[config.level];

  if (!config.jsonOutput) {
    // Pretty output for development
    return {
      level: pinoLevel,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:HH:MM:ss",
          ignore: "pid,hostname",
        },
      },
    };
  }

  // JSON output for production
  return {
    level: pinoLevel,
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };
}

// ============================================================================
// Logger Class
// ============================================================================

/**
 * Structured logger with Pino backend
 *
 * @example
 * ```typescript
 * const logger = new Logger("OrchestratorAgent");
 * logger.info("Starting orchestration", { taskCount: 5 });
 * logger.error("Failed to execute", error, { context: "some-context" });
 *
 * // Create child logger
 * const childLogger = logger.child("subtask");
 * childLogger.debug("Processing item", { itemId: 123 });
 * ```
 */
export class Logger {
  private component: string;
  private config: LoggerConfig;
  private pino: PinoLogger;

  constructor(component: string, config?: Partial<LoggerConfig>) {
    this.component = component;
    this.config = { ...globalConfig, ...config };
    this.pino = pino(createPinoOptions(this.config)).child({ component });
  }

  /**
   * Log debug message (for development/troubleshooting)
   */
  debug(message: string, meta?: Record<string, unknown>): void {
    if (meta) {
      this.pino.debug(meta, message);
    } else {
      this.pino.debug(message);
    }
  }

  /**
   * Log info message (normal operations)
   */
  info(message: string, meta?: Record<string, unknown>): void {
    if (meta) {
      this.pino.info(meta, message);
    } else {
      this.pino.info(message);
    }
  }

  /**
   * Log warning message (potential issues)
   */
  warn(message: string, meta?: Record<string, unknown>): void {
    if (meta) {
      this.pino.warn(meta, message);
    } else {
      this.pino.warn(message);
    }
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error | unknown, meta?: Record<string, unknown>): void {
    const errorMeta = error instanceof Error
      ? { ...meta, err: { message: error.message, stack: this.config.includeStack ? error.stack : undefined } }
      : error
        ? { ...meta, err: String(error) }
        : meta;

    if (errorMeta) {
      this.pino.error(errorMeta, message);
    } else {
      this.pino.error(message);
    }
  }

  /**
   * Create a child logger with additional context
   */
  child(subComponent: string): Logger {
    const childLogger = new Logger(`${this.component}:${subComponent}`, this.config);
    return childLogger;
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

// Default logger instance for quick usage
const defaultLogger = new Logger("donut");

/**
 * Quick debug log
 */
export function debug(message: string, meta?: Record<string, unknown>): void {
  defaultLogger.debug(message, meta);
}

/**
 * Quick info log
 */
export function info(message: string, meta?: Record<string, unknown>): void {
  defaultLogger.info(message, meta);
}

/**
 * Quick warning log
 */
export function warn(message: string, meta?: Record<string, unknown>): void {
  defaultLogger.warn(message, meta);
}

/**
 * Quick error log
 */
export function logError(message: string, error?: Error | unknown, meta?: Record<string, unknown>): void {
  defaultLogger.error(message, error, meta);
}

/**
 * Create a logger for a specific component
 */
export function createLogger(component: string): Logger {
  return new Logger(component);
}

// ============================================================================
// Exports
// ============================================================================

export default Logger;
