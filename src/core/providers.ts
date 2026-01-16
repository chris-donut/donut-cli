/**
 * Provider Implementations
 *
 * Adapters that implement the dependency interfaces defined in dependencies.ts.
 * These wrap existing implementations to conform to the DI contracts.
 */

import chalk from "chalk";
import {
  Logger,
  LogLevel,
  RiskManager,
  RiskCheckResult,
  McpServerProvider,
  McpServerConfig,
  SessionProvider,
  SessionState,
  EventEmitter,
  ConfigProvider,
} from "./dependencies.js";
import { AgentType, WorkflowStage } from "./types.js";
import { SessionManager } from "./session.js";
import { EventBus, getEventBus } from "./event-bus.js";

// ============================================================================
// Console Logger Provider
// ============================================================================

/**
 * Simple console-based logger implementation
 */
export class ConsoleLogger implements Logger {
  private context: Record<string, unknown>;
  private minLevel: LogLevel;

  private static readonly LEVEL_ORDER: LogLevel[] = ["debug", "info", "warn", "error"];

  constructor(
    context: Record<string, unknown> = {},
    minLevel: LogLevel = "info"
  ) {
    this.context = context;
    this.minLevel = minLevel;
  }

  private shouldLog(level: LogLevel): boolean {
    const minIndex = ConsoleLogger.LEVEL_ORDER.indexOf(this.minLevel);
    const levelIndex = ConsoleLogger.LEVEL_ORDER.indexOf(level);
    return levelIndex >= minIndex;
  }

  private formatContext(ctx?: Record<string, unknown>): string {
    const merged = { ...this.context, ...ctx };
    if (Object.keys(merged).length === 0) return "";
    return chalk.gray(` ${JSON.stringify(merged)}`);
  }

  private formatTimestamp(): string {
    return chalk.gray(`[${new Date().toISOString()}]`);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog("debug")) return;
    console.log(
      `${this.formatTimestamp()} ${chalk.blue("DEBUG")} ${message}${this.formatContext(context)}`
    );
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog("info")) return;
    console.log(
      `${this.formatTimestamp()} ${chalk.green("INFO")} ${message}${this.formatContext(context)}`
    );
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog("warn")) return;
    console.log(
      `${this.formatTimestamp()} ${chalk.yellow("WARN")} ${message}${this.formatContext(context)}`
    );
  }

  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    if (!this.shouldLog("error")) return;
    const errorContext = error
      ? { ...context, error: error.message, stack: error.stack }
      : context;
    console.error(
      `${this.formatTimestamp()} ${chalk.red("ERROR")} ${message}${this.formatContext(errorContext)}`
    );
  }

  child(context: Record<string, unknown>): Logger {
    return new ConsoleLogger({ ...this.context, ...context }, this.minLevel);
  }
}

// ============================================================================
// Default Risk Manager Provider
// ============================================================================

/**
 * Default risk manager with configurable limits
 */
export class DefaultRiskManager implements RiskManager {
  private limits: {
    maxPositionSize: number;
    maxDailyLoss: number;
    maxDrawdown: number;
  };

  private blockedTools: Set<string>;
  private warningTools: Map<string, string>;

  constructor(options: {
    maxPositionSize?: number;
    maxDailyLoss?: number;
    maxDrawdown?: number;
    blockedTools?: string[];
    warningTools?: Record<string, string>;
  } = {}) {
    this.limits = {
      maxPositionSize: options.maxPositionSize ?? 100000,
      maxDailyLoss: options.maxDailyLoss ?? 5000,
      maxDrawdown: options.maxDrawdown ?? 0.2,
    };
    this.blockedTools = new Set(options.blockedTools ?? []);
    this.warningTools = new Map(Object.entries(options.warningTools ?? {}));
  }

  checkToolExecution(
    toolName: string,
    _params: Record<string, unknown>,
    _agentType: AgentType
  ): RiskCheckResult {
    const warnings: string[] = [];

    // Check if tool is blocked
    if (this.blockedTools.has(toolName)) {
      return {
        allowed: false,
        warnings: [],
        reason: `Tool '${toolName}' is blocked by risk policy`,
      };
    }

    // Check for warning tools
    const warning = this.warningTools.get(toolName);
    if (warning) {
      warnings.push(warning);
    }

    return { allowed: true, warnings };
  }

  checkTrade(trade: {
    symbol: string;
    side: "buy" | "sell";
    size: number;
    price?: number;
  }): RiskCheckResult {
    const warnings: string[] = [];

    // Check position size
    if (trade.size > this.limits.maxPositionSize) {
      return {
        allowed: false,
        warnings: [],
        reason: `Trade size $${trade.size} exceeds max position size $${this.limits.maxPositionSize}`,
      };
    }

    // Warning if position is more than 50% of max
    if (trade.size > this.limits.maxPositionSize * 0.5) {
      warnings.push(
        `Large position: ${((trade.size / this.limits.maxPositionSize) * 100).toFixed(1)}% of max`
      );
    }

    return { allowed: true, warnings };
  }

  getLimits(): { maxPositionSize: number; maxDailyLoss: number; maxDrawdown: number } {
    return { ...this.limits };
  }
}

// ============================================================================
// MCP Server Provider
// ============================================================================

/**
 * Provider for MCP server configurations
 */
export class DefaultMcpServerProvider implements McpServerProvider {
  private servers: Map<string, McpServerConfig>;
  private stageServers: Map<WorkflowStage, string[]>;

  constructor(options: {
    servers?: Record<string, McpServerConfig>;
    stageMapping?: Record<WorkflowStage, string[]>;
  } = {}) {
    this.servers = new Map(Object.entries(options.servers ?? {}));
    this.stageServers = new Map(
      Object.entries(options.stageMapping ?? {}).map(([stage, servers]) => [
        stage as WorkflowStage,
        servers,
      ])
    );
  }

  getServersForStage(stage: WorkflowStage): McpServerConfig[] {
    const serverNames = this.stageServers.get(stage) ?? [];
    return serverNames
      .map((name) => this.servers.get(name))
      .filter((config): config is McpServerConfig => config !== undefined);
  }

  getAvailableServers(): string[] {
    return Array.from(this.servers.keys());
  }

  isServerAvailable(serverName: string): boolean {
    return this.servers.has(serverName);
  }
}

// ============================================================================
// Session Provider Adapter
// ============================================================================

/**
 * Adapter that wraps SessionManager to implement SessionProvider interface
 */
export class SessionManagerAdapter implements SessionProvider {
  private manager: SessionManager;

  constructor(manager: SessionManager) {
    this.manager = manager;
  }

  getState(): SessionState {
    const state = this.manager.getState();
    return {
      sessionId: state.sessionId,
      currentStage: state.currentStage,
      agentSessions: state.agentSessionIds,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
      metadata: {
        hasActiveStrategy: !!state.activeStrategy,
        pendingTradesCount: state.pendingTrades.length,
        executedTradesCount: state.executedTrades.length,
      },
    };
  }

  updateState(updates: Partial<SessionState>): void {
    // This is a simplified adapter - full implementation would need
    // to map updates back to SessionManager methods
    if (updates.currentStage) {
      // Note: This is async in SessionManager, but sync in interface
      // In production, consider making interface async
      this.manager.transitionStage(
        updates.currentStage,
        "Updated via SessionProvider",
        "system"
      ).catch(console.error);
    }
  }

  async save(): Promise<void> {
    await this.manager.save();
  }

  getSessionId(): string {
    return this.manager.getState().sessionId;
  }

  getAgentSessionId(agentType: AgentType): string | undefined {
    return this.manager.getAgentSession(agentType);
  }

  setAgentSessionId(agentType: AgentType, sessionId: string): void {
    this.manager.updateAgentSession(agentType, sessionId).catch(console.error);
  }
}

// ============================================================================
// Event Bus Adapter
// ============================================================================

/**
 * Adapter that wraps EventBus to implement EventEmitter interface
 */
export class EventBusAdapter implements EventEmitter {
  private bus: EventBus;

  constructor(bus?: EventBus) {
    this.bus = bus ?? getEventBus();
  }

  emit(eventType: string, payload: Record<string, unknown>): void {
    // The event bus expects a specific event structure
    // We create a generic event that wraps the payload
    this.bus.emitSync({
      type: eventType as "system:error", // Type assertion for generic events
      source: "provider",
      ...payload,
    } as Parameters<typeof this.bus.emit>[0]);
  }

  on(eventType: string, handler: (payload: Record<string, unknown>) => void): string {
    return this.bus.onAll((event) => {
      if (event.type === eventType) {
        handler(event as unknown as Record<string, unknown>);
      }
    });
  }

  off(subscriptionId: string): void {
    this.bus.off(subscriptionId);
  }
}

// ============================================================================
// Config Provider Implementation
// ============================================================================

/**
 * Simple in-memory configuration provider
 */
export class InMemoryConfigProvider implements ConfigProvider {
  private config: Record<string, unknown>;

  constructor(config: Record<string, unknown> = {}) {
    this.config = { ...config };
  }

  get<T>(key: string): T | undefined {
    return this.getNestedValue(key) as T | undefined;
  }

  getOrDefault<T>(key: string, defaultValue: T): T {
    const value = this.get<T>(key);
    return value !== undefined ? value : defaultValue;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  getAll(): Record<string, unknown> {
    return { ...this.config };
  }

  private getNestedValue(key: string): unknown {
    const parts = key.split(".");
    let current: unknown = this.config;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      if (typeof current !== "object") return undefined;
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a default logger for an agent
 */
export function createAgentLogger(agentType: AgentType, level: LogLevel = "info"): Logger {
  return new ConsoleLogger({ agent: agentType }, level);
}

/**
 * Create a session provider from a SessionManager
 */
export function createSessionProvider(manager: SessionManager): SessionProvider {
  return new SessionManagerAdapter(manager);
}

/**
 * Create an event emitter from the global event bus
 */
export function createEventEmitter(): EventEmitter {
  return new EventBusAdapter();
}
