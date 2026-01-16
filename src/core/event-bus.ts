/**
 * Event Bus - Decoupled Communication System
 *
 * Provides pub/sub messaging for loose coupling between components:
 * - Agent-to-agent communication
 * - Tool execution notifications
 * - Risk alerts and trade notifications
 * - UI updates and progress tracking
 *
 * Features:
 * - Type-safe event definitions
 * - Async event handlers
 * - Event filtering and prioritization
 * - Memory-efficient with automatic cleanup
 */

import { AgentType, WorkflowStage } from "./types.js";

// ============================================================================
// Event Types
// ============================================================================

/**
 * Event priority levels
 */
export enum EventPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3,
}

/**
 * Base event interface
 */
export interface BaseEvent {
  type: string;
  timestamp: Date;
  source: string;
  priority?: EventPriority;
  metadata?: Record<string, unknown>;
}

/**
 * Agent lifecycle events
 */
export interface AgentStartedEvent extends BaseEvent {
  type: "agent:started";
  agentType: AgentType;
  sessionId?: string;
  stage: WorkflowStage;
}

export interface AgentCompletedEvent extends BaseEvent {
  type: "agent:completed";
  agentType: AgentType;
  sessionId?: string;
  success: boolean;
  result?: string;
  error?: string;
}

export interface AgentMessageEvent extends BaseEvent {
  type: "agent:message";
  agentType: AgentType;
  messageType: "text" | "tool_use" | "tool_result";
  content: string;
}

/**
 * Tool execution events
 */
export interface ToolExecutingEvent extends BaseEvent {
  type: "tool:executing";
  toolName: string;
  agentType: AgentType;
  params: Record<string, unknown>;
}

export interface ToolCompletedEvent extends BaseEvent {
  type: "tool:completed";
  toolName: string;
  agentType: AgentType;
  success: boolean;
  duration: number;
  result?: unknown;
  error?: string;
}

export interface ToolBlockedEvent extends BaseEvent {
  type: "tool:blocked";
  toolName: string;
  agentType: AgentType;
  reason: string;
}

/**
 * Risk management events
 */
export interface RiskWarningEvent extends BaseEvent {
  type: "risk:warning";
  warning: string;
  toolName: string;
  severity: "low" | "medium" | "high";
}

export interface RiskBlockedEvent extends BaseEvent {
  type: "risk:blocked";
  toolName: string;
  reason: string;
  params: Record<string, unknown>;
}

/**
 * Trade events
 */
export interface TradeRequestedEvent extends BaseEvent {
  type: "trade:requested";
  tradeId: string;
  symbol: string;
  side: "buy" | "sell";
  size: number;
  price?: number;
}

export interface TradeApprovedEvent extends BaseEvent {
  type: "trade:approved";
  tradeId: string;
  approvedBy: "user" | "system";
}

export interface TradeRejectedEvent extends BaseEvent {
  type: "trade:rejected";
  tradeId: string;
  reason: string;
  rejectedBy: "user" | "system" | "risk";
}

export interface TradeExecutedEvent extends BaseEvent {
  type: "trade:executed";
  tradeId: string;
  symbol: string;
  side: "buy" | "sell";
  executedSize: number;
  executedPrice: number;
  pnl?: number;
}

/**
 * Backtest events
 */
export interface BacktestStartedEvent extends BaseEvent {
  type: "backtest:started";
  runId: string;
  symbols: string[];
  timeframe: { start: string; end: string };
}

export interface BacktestProgressEvent extends BaseEvent {
  type: "backtest:progress";
  runId: string;
  progress: number;
  currentEquity?: number;
}

export interface BacktestCompletedEvent extends BaseEvent {
  type: "backtest:completed";
  runId: string;
  success: boolean;
  metrics?: {
    sharpe?: number;
    maxDrawdown?: number;
    totalReturn?: number;
  };
}

/**
 * Notification events
 */
export interface NotificationEvent extends BaseEvent {
  type: "notification:send";
  channel: "telegram" | "discord" | "webhook";
  message: string;
  level: "info" | "warning" | "error" | "success";
}

/**
 * System events
 */
export interface SystemErrorEvent extends BaseEvent {
  type: "system:error";
  error: string;
  stack?: string;
  fatal: boolean;
}

export interface SystemShutdownEvent extends BaseEvent {
  type: "system:shutdown";
  reason: "user" | "error" | "signal";
}

/**
 * Union of all event types
 */
export type DonutEvent =
  | AgentStartedEvent
  | AgentCompletedEvent
  | AgentMessageEvent
  | ToolExecutingEvent
  | ToolCompletedEvent
  | ToolBlockedEvent
  | RiskWarningEvent
  | RiskBlockedEvent
  | TradeRequestedEvent
  | TradeApprovedEvent
  | TradeRejectedEvent
  | TradeExecutedEvent
  | BacktestStartedEvent
  | BacktestProgressEvent
  | BacktestCompletedEvent
  | NotificationEvent
  | SystemErrorEvent
  | SystemShutdownEvent;

/**
 * Extract event type string for type-safe handlers
 */
export type EventType = DonutEvent["type"];

/**
 * Get event interface by type string
 */
export type EventByType<T extends EventType> = Extract<DonutEvent, { type: T }>;

// ============================================================================
// Event Handler Types
// ============================================================================

/**
 * Event handler function
 */
export type EventHandler<T extends DonutEvent = DonutEvent> = (
  event: T
) => void | Promise<void>;

/**
 * Handler subscription options
 */
export interface SubscriptionOptions {
  /** Only receive events matching this filter */
  filter?: (event: DonutEvent) => boolean;
  /** Minimum priority to receive */
  minPriority?: EventPriority;
  /** Automatically unsubscribe after N events */
  maxEvents?: number;
  /** Handler identifier for debugging */
  id?: string;
}

/**
 * Internal subscription record
 */
interface Subscription {
  id: string;
  eventType: EventType | "*";
  handler: EventHandler;
  options: SubscriptionOptions;
  eventCount: number;
}

// ============================================================================
// Event Bus Implementation
// ============================================================================

/**
 * Singleton event bus for application-wide messaging
 */
export class EventBus {
  private static instance: EventBus | null = null;

  private subscriptions: Map<string, Subscription> = new Map();
  private eventHistory: DonutEvent[] = [];
  private maxHistorySize: number = 1000;
  private nextSubscriptionId: number = 0;

  private constructor() {}

  /**
   * Get the singleton instance
   */
  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /**
   * Reset the singleton (for testing)
   */
  static reset(): void {
    EventBus.instance = null;
  }

  // ============================================================================
  // Publishing
  // ============================================================================

  /**
   * Publish an event to all subscribers
   */
  async emit<T extends DonutEvent>(event: Omit<T, "timestamp">): Promise<void> {
    const fullEvent = {
      ...event,
      timestamp: new Date(),
      priority: event.priority ?? EventPriority.NORMAL,
    } as T;

    // Store in history
    this.addToHistory(fullEvent);

    // Get matching handlers sorted by priority
    const handlers = this.getMatchingHandlers(fullEvent);

    // Execute handlers (high priority first)
    for (const sub of handlers) {
      try {
        await sub.handler(fullEvent);
        sub.eventCount++;

        // Auto-unsubscribe if max events reached
        if (sub.options.maxEvents && sub.eventCount >= sub.options.maxEvents) {
          this.subscriptions.delete(sub.id);
        }
      } catch (error) {
        console.error(
          `[EventBus] Handler ${sub.id} error:`,
          error instanceof Error ? error.message : error
        );
      }
    }
  }

  /**
   * Emit without waiting for handlers (fire and forget)
   */
  emitSync<T extends DonutEvent>(event: Omit<T, "timestamp">): void {
    this.emit(event).catch((err) => {
      console.error("[EventBus] Async emit error:", err);
    });
  }

  // ============================================================================
  // Subscribing
  // ============================================================================

  /**
   * Subscribe to events of a specific type
   */
  on<T extends EventType>(
    eventType: T,
    handler: EventHandler<EventByType<T>>,
    options?: SubscriptionOptions
  ): string {
    return this.subscribe(eventType, handler as EventHandler, options);
  }

  /**
   * Subscribe to all events
   */
  onAll(handler: EventHandler, options?: SubscriptionOptions): string {
    return this.subscribe("*", handler, options);
  }

  /**
   * Subscribe once (auto-unsubscribe after first event)
   */
  once<T extends EventType>(
    eventType: T,
    handler: EventHandler<EventByType<T>>,
    options?: Omit<SubscriptionOptions, "maxEvents">
  ): string {
    return this.subscribe(eventType, handler as EventHandler, {
      ...options,
      maxEvents: 1,
    });
  }

  /**
   * Unsubscribe a handler by ID
   */
  off(subscriptionId: string): boolean {
    return this.subscriptions.delete(subscriptionId);
  }

  /**
   * Remove all handlers for an event type
   */
  removeAllListeners(eventType?: EventType): void {
    if (eventType) {
      for (const [id, sub] of this.subscriptions) {
        if (sub.eventType === eventType) {
          this.subscriptions.delete(id);
        }
      }
    } else {
      this.subscriptions.clear();
    }
  }

  // ============================================================================
  // Querying
  // ============================================================================

  /**
   * Get recent events from history
   */
  getHistory(options?: {
    type?: EventType;
    limit?: number;
    since?: Date;
  }): DonutEvent[] {
    let events = [...this.eventHistory];

    if (options?.type) {
      events = events.filter((e) => e.type === options.type);
    }

    if (options?.since) {
      events = events.filter((e) => e.timestamp >= options.since!);
    }

    if (options?.limit) {
      events = events.slice(-options.limit);
    }

    return events;
  }

  /**
   * Get count of handlers for an event type
   */
  listenerCount(eventType?: EventType): number {
    if (!eventType) {
      return this.subscriptions.size;
    }

    let count = 0;
    for (const sub of this.subscriptions.values()) {
      if (sub.eventType === eventType || sub.eventType === "*") {
        count++;
      }
    }
    return count;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private subscribe(
    eventType: EventType | "*",
    handler: EventHandler,
    options: SubscriptionOptions = {}
  ): string {
    const id = options.id ?? `sub_${this.nextSubscriptionId++}`;

    this.subscriptions.set(id, {
      id,
      eventType,
      handler,
      options,
      eventCount: 0,
    });

    return id;
  }

  private getMatchingHandlers(event: DonutEvent): Subscription[] {
    const handlers: Subscription[] = [];

    for (const sub of this.subscriptions.values()) {
      // Check event type match
      if (sub.eventType !== "*" && sub.eventType !== event.type) {
        continue;
      }

      // Check priority filter
      if (
        sub.options.minPriority !== undefined &&
        (event.priority ?? EventPriority.NORMAL) < sub.options.minPriority
      ) {
        continue;
      }

      // Check custom filter
      if (sub.options.filter && !sub.options.filter(event)) {
        continue;
      }

      handlers.push(sub);
    }

    // Sort by priority (handlers for higher priority events first)
    return handlers.sort(
      (a, b) =>
        (b.options.minPriority ?? EventPriority.NORMAL) -
        (a.options.minPriority ?? EventPriority.NORMAL)
    );
  }

  private addToHistory(event: DonutEvent): void {
    this.eventHistory.push(event);

    // Trim history if too large
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize / 2);
    }
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Get the global event bus instance
 */
export function getEventBus(): EventBus {
  return EventBus.getInstance();
}

/**
 * Emit an event (convenience function)
 */
export async function emit<T extends DonutEvent>(
  event: Omit<T, "timestamp">
): Promise<void> {
  return getEventBus().emit(event);
}

/**
 * Subscribe to an event type (convenience function)
 */
export function on<T extends EventType>(
  eventType: T,
  handler: EventHandler<EventByType<T>>,
  options?: SubscriptionOptions
): string {
  return getEventBus().on(eventType, handler, options);
}

// ============================================================================
// Event Factory Helpers
// ============================================================================

/**
 * Create an agent started event
 */
export function agentStarted(
  agentType: AgentType,
  stage: WorkflowStage,
  sessionId?: string
): Omit<AgentStartedEvent, "timestamp"> {
  return {
    type: "agent:started",
    source: agentType,
    agentType,
    stage,
    sessionId,
  };
}

/**
 * Create an agent completed event
 */
export function agentCompleted(
  agentType: AgentType,
  success: boolean,
  result?: string,
  error?: string,
  sessionId?: string
): Omit<AgentCompletedEvent, "timestamp"> {
  return {
    type: "agent:completed",
    source: agentType,
    agentType,
    success,
    result,
    error,
    sessionId,
  };
}

/**
 * Create a tool executing event
 */
export function toolExecuting(
  toolName: string,
  agentType: AgentType,
  params: Record<string, unknown>
): Omit<ToolExecutingEvent, "timestamp"> {
  return {
    type: "tool:executing",
    source: agentType,
    toolName,
    agentType,
    params,
  };
}

/**
 * Create a tool completed event
 */
export function toolCompleted(
  toolName: string,
  agentType: AgentType,
  success: boolean,
  duration: number,
  result?: unknown,
  error?: string
): Omit<ToolCompletedEvent, "timestamp"> {
  return {
    type: "tool:completed",
    source: agentType,
    toolName,
    agentType,
    success,
    duration,
    result,
    error,
  };
}

/**
 * Create a risk warning event
 */
export function riskWarning(
  warning: string,
  toolName: string,
  severity: "low" | "medium" | "high"
): Omit<RiskWarningEvent, "timestamp"> {
  return {
    type: "risk:warning",
    source: "risk-manager",
    warning,
    toolName,
    severity,
    priority:
      severity === "high"
        ? EventPriority.HIGH
        : severity === "medium"
        ? EventPriority.NORMAL
        : EventPriority.LOW,
  };
}

/**
 * Create a system error event
 */
export function systemError(
  error: string,
  fatal: boolean,
  stack?: string
): Omit<SystemErrorEvent, "timestamp"> {
  return {
    type: "system:error",
    source: "system",
    error,
    fatal,
    stack,
    priority: fatal ? EventPriority.CRITICAL : EventPriority.HIGH,
  };
}
