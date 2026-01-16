/**
 * Dependency Injection Interfaces
 *
 * Defines contracts for injectable dependencies used across the application.
 * This enables:
 * - Unit testing with mocks
 * - Swappable implementations
 * - Decoupled architecture
 */

import { AgentType, WorkflowStage, ToolExecutionContext } from "./types.js";

// ============================================================================
// Logger Interface
// ============================================================================

/**
 * Log levels for structured logging
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Logger interface for consistent output handling
 */
export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;

  /**
   * Write raw output without formatting (for streaming)
   */
  write(text: string): void;

  /**
   * Create a child logger with additional context
   */
  child(context: Record<string, unknown>): Logger;
}

// ============================================================================
// Risk Manager Interface
// ============================================================================

/**
 * Result of a risk check
 */
export interface RiskCheckResult {
  allowed: boolean;
  reason?: string;
  warnings: string[];
}

/**
 * Risk manager interface for pre/post execution checks
 */
export interface RiskManager {
  /**
   * Pre-execution risk check
   */
  preToolUseHook(context: ToolExecutionContext): Promise<RiskCheckResult>;

  /**
   * Post-execution tracking
   */
  postToolUseHook(
    context: ToolExecutionContext,
    result: unknown
  ): Promise<void>;
}

// ============================================================================
// MCP Server Provider Interface
// ============================================================================

/**
 * MCP server instance type (from Claude Agent SDK)
 */
export interface McpServerInstance {
  // The actual instance type depends on SDK implementation
  // This is intentionally flexible to allow different server types
  [key: string]: unknown;
}

/**
 * MCP server configuration for agents
 */
export interface McpServerConfig {
  type: "sdk";
  name: string;
  instance: McpServerInstance;
}

/**
 * Backend type for MCP server selection
 */
export type BackendType = "hummingbot" | "nofx" | "none";

/**
 * Provider interface for MCP servers
 * Allows different implementations for different backends
 */
export interface McpServerProvider {
  /**
   * Get the configured backend type
   */
  getBackendType(): BackendType;

  /**
   * Get MCP server configurations for the agent
   */
  getMcpServers(): Record<string, McpServerConfig>;

  /**
   * Get default tools for a specific agent and backend
   */
  getDefaultTools(agentType: AgentType): string[];

  /**
   * Check if the backend is healthy
   */
  healthCheck(): Promise<boolean>;
}

// ============================================================================
// Session Provider Interface
// ============================================================================

/**
 * Provider for session management
 */
export interface SessionProvider {
  /**
   * Get the agent session ID for resume
   */
  getAgentSession(agentType: AgentType): string | undefined;

  /**
   * Update the agent session ID
   */
  updateAgentSession(agentType: AgentType, sessionId: string): Promise<void>;

  /**
   * Get session data
   */
  getSessionData(): Record<string, unknown>;
}

// ============================================================================
// Agent Dependencies Container
// ============================================================================

/**
 * Container for all agent dependencies
 * Agents receive this instead of creating dependencies directly
 */
export interface AgentDependencies {
  logger: Logger;
  riskManager: RiskManager;
  mcpProvider: McpServerProvider;
  sessionProvider: SessionProvider;
}

// ============================================================================
// Default Implementations
// ============================================================================

/**
 * Console-based logger implementation
 */
export class ConsoleLogger implements Logger {
  private context: Record<string, unknown>;
  private minLevel: LogLevel;

  constructor(
    context: Record<string, unknown> = {},
    minLevel: LogLevel = "info"
  ) {
    this.context = context;
    this.minLevel = minLevel;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ["debug", "info", "warn", "error"];
    return levels.indexOf(level) >= levels.indexOf(this.minLevel);
  }

  private formatMessage(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>
  ): string {
    const timestamp = new Date().toISOString();
    const merged = { ...this.context, ...context };
    const contextStr =
      Object.keys(merged).length > 0 ? ` ${JSON.stringify(merged)}` : "";
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`;
  }

  debug(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog("debug")) {
      console.debug(this.formatMessage("debug", message, context));
    }
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog("info")) {
      console.info(this.formatMessage("info", message, context));
    }
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog("warn")) {
      console.warn(this.formatMessage("warn", message, context));
    }
  }

  error(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog("error")) {
      console.error(this.formatMessage("error", message, context));
    }
  }

  write(text: string): void {
    process.stdout.write(text);
  }

  child(context: Record<string, unknown>): Logger {
    return new ConsoleLogger({ ...this.context, ...context }, this.minLevel);
  }
}

/**
 * Silent logger for testing
 */
export class NullLogger implements Logger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
  write(): void {}
  child(): Logger {
    return this;
  }
}

/**
 * Buffered logger that captures output for testing
 */
export class BufferedLogger implements Logger {
  private logs: Array<{
    level: LogLevel;
    message: string;
    context?: Record<string, unknown>;
  }> = [];
  private output: string[] = [];

  debug(message: string, context?: Record<string, unknown>): void {
    this.logs.push({ level: "debug", message, context });
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.logs.push({ level: "info", message, context });
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.logs.push({ level: "warn", message, context });
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.logs.push({ level: "error", message, context });
  }

  write(text: string): void {
    this.output.push(text);
  }

  child(context: Record<string, unknown>): Logger {
    // For simplicity, return same instance (logs will include all children)
    return this;
  }

  /**
   * Get all captured logs
   */
  getLogs(): typeof this.logs {
    return [...this.logs];
  }

  /**
   * Get captured raw output
   */
  getOutput(): string {
    return this.output.join("");
  }

  /**
   * Clear captured data
   */
  clear(): void {
    this.logs = [];
    this.output = [];
  }
}
