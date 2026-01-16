/**
 * Dependency Injection Interfaces
 *
 * Defines contracts for services that agents and tools depend on.
 * Enables loose coupling, testability, and flexible implementations.
 *
 * Pattern: Constructor injection with interface dependencies
 * Inspired by: Dexter agent architecture
 */

import { AgentType, WorkflowStage } from "./types.js";

// ============================================================================
// Logger Interface
// ============================================================================

/**
 * Log levels for structured logging
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Logger interface for consistent logging across components
 */
export interface Logger {
  /** Log debug message */
  debug(message: string, context?: Record<string, unknown>): void;

  /** Log info message */
  info(message: string, context?: Record<string, unknown>): void;

  /** Log warning message */
  warn(message: string, context?: Record<string, unknown>): void;

  /** Log error message */
  error(message: string, error?: Error, context?: Record<string, unknown>): void;

  /** Create child logger with additional context */
  child(context: Record<string, unknown>): Logger;
}

// ============================================================================
// Risk Manager Interface
// ============================================================================

/**
 * Risk check result
 */
export interface RiskCheckResult {
  allowed: boolean;
  warnings: string[];
  reason?: string;
}

/**
 * Risk manager interface for trade validation
 */
export interface RiskManager {
  /** Check if a tool execution is allowed */
  checkToolExecution(
    toolName: string,
    params: Record<string, unknown>,
    agentType: AgentType
  ): RiskCheckResult;

  /** Check if a trade is within risk limits */
  checkTrade(trade: {
    symbol: string;
    side: "buy" | "sell";
    size: number;
    price?: number;
  }): RiskCheckResult;

  /** Get current risk limits */
  getLimits(): {
    maxPositionSize: number;
    maxDailyLoss: number;
    maxDrawdown: number;
  };
}

// ============================================================================
// MCP Server Provider Interface
// ============================================================================

/**
 * MCP server configuration
 */
export interface McpServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

/**
 * Provider for MCP server configurations
 */
export interface McpServerProvider {
  /** Get MCP servers for a given workflow stage */
  getServersForStage(stage: WorkflowStage): McpServerConfig[];

  /** Get all available MCP server names */
  getAvailableServers(): string[];

  /** Check if a specific server is available */
  isServerAvailable(serverName: string): boolean;
}

// ============================================================================
// Session Provider Interface
// ============================================================================

/**
 * Session state for persistence
 */
export interface SessionState {
  sessionId: string;
  currentStage: WorkflowStage;
  agentSessions: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Provider for session management
 */
export interface SessionProvider {
  /** Get current session state */
  getState(): SessionState;

  /** Update session state */
  updateState(updates: Partial<SessionState>): void;

  /** Save session to persistent storage */
  save(): Promise<void>;

  /** Get session ID */
  getSessionId(): string;

  /** Get or set agent session ID for continuity */
  getAgentSessionId(agentType: AgentType): string | undefined;
  setAgentSessionId(agentType: AgentType, sessionId: string): void;
}

// ============================================================================
// Event Emitter Interface
// ============================================================================

/**
 * Event emitter for decoupled communication
 */
export interface EventEmitter {
  /** Emit an event */
  emit(eventType: string, payload: Record<string, unknown>): void;

  /** Subscribe to an event */
  on(eventType: string, handler: (payload: Record<string, unknown>) => void): string;

  /** Unsubscribe from an event */
  off(subscriptionId: string): void;
}

// ============================================================================
// Configuration Provider Interface
// ============================================================================

/**
 * Configuration provider for runtime settings
 */
export interface ConfigProvider {
  /** Get a configuration value */
  get<T>(key: string): T | undefined;

  /** Get a configuration value with default */
  getOrDefault<T>(key: string, defaultValue: T): T;

  /** Check if a configuration key exists */
  has(key: string): boolean;

  /** Get all configuration as object */
  getAll(): Record<string, unknown>;
}

// ============================================================================
// Dependencies Container
// ============================================================================

/**
 * Container for all injectable dependencies
 */
export interface Dependencies {
  logger: Logger;
  riskManager?: RiskManager;
  mcpProvider: McpServerProvider;
  sessionProvider: SessionProvider;
  eventEmitter?: EventEmitter;
  config?: ConfigProvider;
}

/**
 * Partial dependencies for optional injection
 */
export type PartialDependencies = Partial<Dependencies>;
