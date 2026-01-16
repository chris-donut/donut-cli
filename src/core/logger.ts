/**
 * Structured Logging System for donut-cli
 *
 * Provides consistent, filterable logging with:
 * - Log levels (debug, info, warn, error)
 * - Component tagging for easy filtering
 * - Structured JSON output for production
 * - Pretty console output for development
 * - Configurable via environment variables
 */

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

const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: "\x1b[36m", // Cyan
  [LogLevel.INFO]: "\x1b[32m",  // Green
  [LogLevel.WARN]: "\x1b[33m",  // Yellow
  [LogLevel.ERROR]: "\x1b[31m", // Red
  [LogLevel.SILENT]: "",
};

const RESET_COLOR = "\x1b[0m";
const DIM_COLOR = "\x1b[2m";

/**
 * Get default configuration from environment
 */
function getDefaultConfig(): LoggerConfig {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase() || "info";
  const level = LOG_LEVEL_MAP[envLevel] ?? LogLevel.INFO;

  return {
    level,
    jsonOutput: process.env.LOG_FORMAT === "json",
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
// Logger Class
// ============================================================================

/**
 * Structured logger with component tagging
 *
 * @example
 * ```typescript
 * const logger = new Logger("OrchestratorAgent");
 * logger.info("Starting orchestration", { taskCount: 5 });
 * logger.error("Failed to execute", error, { context: "some-context" });
 * ```
 */
export class Logger {
  private component: string;
  private config: LoggerConfig;

  constructor(component: string, config?: Partial<LoggerConfig>) {
    this.component = component;
    this.config = { ...globalConfig, ...config };
  }

  /**
   * Log debug message (for development/troubleshooting)
   */
  debug(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, undefined, meta);
  }

  /**
   * Log info message (normal operations)
   */
  info(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, undefined, meta);
  }

  /**
   * Log warning message (potential issues)
   */
  warn(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, undefined, meta);
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error | unknown, meta?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, error, meta);
  }

  /**
   * Create a child logger with additional context
   */
  child(subComponent: string): Logger {
    return new Logger(`${this.component}:${subComponent}`, this.config);
  }

  /**
   * Internal logging method
   */
  private log(
    level: LogLevel,
    message: string,
    error?: Error | unknown,
    meta?: Record<string, unknown>
  ): void {
    // Check if level should be logged
    if (level < this.config.level) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LOG_LEVEL_NAMES[level],
      component: this.component,
      message,
    };

    if (meta && Object.keys(meta).length > 0) {
      entry.meta = meta;
    }

    if (error) {
      if (error instanceof Error) {
        entry.error = {
          name: error.name,
          message: error.message,
          stack: this.config.includeStack ? error.stack : undefined,
        };
      } else {
        entry.error = {
          name: "UnknownError",
          message: String(error),
        };
      }
    }

    this.output(level, entry);
  }

  /**
   * Output the log entry
   */
  private output(level: LogLevel, entry: LogEntry): void {
    if (this.config.jsonOutput) {
      this.outputJson(level, entry);
    } else {
      this.outputPretty(level, entry);
    }
  }

  /**
   * Output as JSON (for production/log aggregation)
   */
  private outputJson(level: LogLevel, entry: LogEntry): void {
    const output = JSON.stringify(entry);

    if (level >= LogLevel.ERROR) {
      console.error(output);
    } else if (level >= LogLevel.WARN) {
      console.warn(output);
    } else {
      console.log(output);
    }
  }

  /**
   * Output as pretty-printed console message
   */
  private outputPretty(level: LogLevel, entry: LogEntry): void {
    const color = LOG_LEVEL_COLORS[level];
    const levelName = LOG_LEVEL_NAMES[level].padEnd(5);

    let output = "";

    // Timestamp
    if (this.config.includeTimestamp) {
      const time = entry.timestamp.split("T")[1].slice(0, 8);
      output += `${DIM_COLOR}${time}${RESET_COLOR} `;
    }

    // Level and component
    output += `${color}${levelName}${RESET_COLOR} `;
    output += `${DIM_COLOR}[${this.component}]${RESET_COLOR} `;

    // Message
    output += entry.message;

    // Meta
    if (entry.meta) {
      const metaStr = Object.entries(entry.meta)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(" ");
      output += ` ${DIM_COLOR}${metaStr}${RESET_COLOR}`;
    }

    // Output
    if (level >= LogLevel.ERROR) {
      console.error(output);
      if (entry.error?.stack && this.config.includeStack) {
        console.error(DIM_COLOR + entry.error.stack + RESET_COLOR);
      }
    } else if (level >= LogLevel.WARN) {
      console.warn(output);
    } else {
      console.log(output);
    }
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
