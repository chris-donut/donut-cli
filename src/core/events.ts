/**
 * Tool Event System Foundation
 *
 * Provides typed event infrastructure for tool execution monitoring:
 * - EventBus class with typed event subscription
 * - ToolEvent union type for tool lifecycle events
 * - Support for one-time and persistent listeners
 * - Global singleton for application-wide event coordination
 */

import { createLogger } from "./logger.js";

const logger = createLogger("events");

// ============================================================================
// Event Types
// ============================================================================

/**
 * Base event interface - all events extend this
 */
export interface BaseEvent {
  type: string;
  timestamp: number;
}

/**
 * Tool execution start event
 */
export interface ToolStartEvent extends BaseEvent {
  type: "tool:start";
  tool: string;
  args: Record<string, unknown>;
  requestId: string;
}

/**
 * Tool execution end event
 */
export interface ToolEndEvent extends BaseEvent {
  type: "tool:end";
  tool: string;
  result: unknown;
  durationMs: number;
  requestId: string;
}

/**
 * Tool execution error event
 */
export interface ToolErrorEvent extends BaseEvent {
  type: "tool:error";
  tool: string;
  error: string;
  durationMs: number;
  requestId: string;
}

/**
 * Agent thinking event (for TUI display)
 */
export interface AgentThinkingEvent extends BaseEvent {
  type: "agent:thinking";
  agentName: string;
  thought: string;
}

/**
 * Agent response streaming event
 */
export interface AgentStreamEvent extends BaseEvent {
  type: "agent:stream";
  agentName: string;
  chunk: string;
}

/**
 * Agent metrics event (emitted at end of run)
 */
export interface AgentMetricsEvent extends BaseEvent {
  type: "agent:metrics";
  agentName: string;
  metrics: {
    agentType: string;
    sessionId?: string;
    stage: string;
    totalDurationMs: number;
    totalIterations: number;
    totalToolCalls: number;
    successfulToolCalls: number;
    failedToolCalls: number;
    totalTokens: number;
    reasoningSteps: number;
    success: boolean;
    aborted: boolean;
    error?: string;
  };
}

/**
 * Union type of all tool-related events
 */
export type ToolEvent = ToolStartEvent | ToolEndEvent | ToolErrorEvent;

/**
 * Union type of all agent-related events
 */
export type AgentEvent = AgentThinkingEvent | AgentStreamEvent | AgentMetricsEvent;

/**
 * Union type of all events
 */
export type AppEvent = ToolEvent | AgentEvent;

/**
 * Extract event type string from event
 */
export type EventType = AppEvent["type"];

/**
 * Map from event type string to event interface
 */
export type EventMap = {
  "tool:start": ToolStartEvent;
  "tool:end": ToolEndEvent;
  "tool:error": ToolErrorEvent;
  "agent:thinking": AgentThinkingEvent;
  "agent:stream": AgentStreamEvent;
  "agent:metrics": AgentMetricsEvent;
};

// ============================================================================
// Event Handler Types
// ============================================================================

export type EventHandler<T extends AppEvent> = (event: T) => void | Promise<void>;

export type AnyEventHandler = EventHandler<AppEvent>;

// ============================================================================
// EventBus Class
// ============================================================================

/**
 * Typed event bus for application-wide event coordination
 *
 * @example
 * ```typescript
 * // Subscribe to tool start events
 * eventBus.on("tool:start", (event) => {
 *   console.log(`Tool ${event.tool} started`);
 * });
 *
 * // One-time subscription
 * eventBus.once("tool:end", (event) => {
 *   console.log(`Tool completed in ${event.durationMs}ms`);
 * });
 *
 * // Emit an event
 * eventBus.emit({
 *   type: "tool:start",
 *   tool: "get_price",
 *   args: { symbol: "BTC-USDT" },
 *   requestId: "req_123",
 *   timestamp: Date.now(),
 * });
 * ```
 */
export class EventBus {
  private handlers: Map<EventType, Set<AnyEventHandler>> = new Map();
  private onceHandlers: Map<EventType, Set<AnyEventHandler>> = new Map();

  /**
   * Subscribe to events of a specific type
   */
  on<T extends EventType>(type: T, handler: EventHandler<EventMap[T]>): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler as AnyEventHandler);

    logger.debug("Event handler registered", { type, totalHandlers: this.handlers.get(type)!.size });

    // Return unsubscribe function
    return () => this.off(type, handler);
  }

  /**
   * Subscribe to a single occurrence of an event
   */
  once<T extends EventType>(type: T, handler: EventHandler<EventMap[T]>): () => void {
    if (!this.onceHandlers.has(type)) {
      this.onceHandlers.set(type, new Set());
    }
    this.onceHandlers.get(type)!.add(handler as AnyEventHandler);

    logger.debug("One-time event handler registered", { type });

    // Return unsubscribe function
    return () => {
      const handlers = this.onceHandlers.get(type);
      if (handlers) {
        handlers.delete(handler as AnyEventHandler);
      }
    };
  }

  /**
   * Unsubscribe from events
   */
  off<T extends EventType>(type: T, handler: EventHandler<EventMap[T]>): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      handlers.delete(handler as AnyEventHandler);
      logger.debug("Event handler unregistered", { type, remainingHandlers: handlers.size });
    }
  }

  /**
   * Emit an event to all subscribers
   */
  async emit<T extends AppEvent>(event: T): Promise<void> {
    const type = event.type as EventType;

    logger.debug("Emitting event", { type, tool: "tool" in event ? event.tool : undefined });

    // Call persistent handlers
    const handlers = this.handlers.get(type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          await handler(event);
        } catch (error) {
          logger.error("Event handler error", {
            type,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    // Call and remove one-time handlers
    const onceHandlers = this.onceHandlers.get(type);
    if (onceHandlers && onceHandlers.size > 0) {
      const handlersToCall = [...onceHandlers];
      onceHandlers.clear();

      for (const handler of handlersToCall) {
        try {
          await handler(event);
        } catch (error) {
          logger.error("One-time event handler error", {
            type,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  /**
   * Remove all handlers for a specific event type
   */
  removeAllListeners(type?: EventType): void {
    if (type) {
      this.handlers.delete(type);
      this.onceHandlers.delete(type);
      logger.debug("All handlers removed for event type", { type });
    } else {
      this.handlers.clear();
      this.onceHandlers.clear();
      logger.debug("All event handlers removed");
    }
  }

  /**
   * Get the number of listeners for an event type
   */
  listenerCount(type: EventType): number {
    const handlers = this.handlers.get(type)?.size ?? 0;
    const onceHandlers = this.onceHandlers.get(type)?.size ?? 0;
    return handlers + onceHandlers;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

/**
 * Global event bus instance for application-wide event coordination
 */
export const eventBus = new EventBus();

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Helper to create a tool start event
 */
export function createToolStartEvent(
  tool: string,
  args: Record<string, unknown>,
  requestId: string
): ToolStartEvent {
  return {
    type: "tool:start",
    tool,
    args,
    requestId,
    timestamp: Date.now(),
  };
}

/**
 * Helper to create a tool end event
 */
export function createToolEndEvent(
  tool: string,
  result: unknown,
  durationMs: number,
  requestId: string
): ToolEndEvent {
  return {
    type: "tool:end",
    tool,
    result,
    durationMs,
    requestId,
    timestamp: Date.now(),
  };
}

/**
 * Helper to create a tool error event
 */
export function createToolErrorEvent(
  tool: string,
  error: string,
  durationMs: number,
  requestId: string
): ToolErrorEvent {
  return {
    type: "tool:error",
    tool,
    error,
    durationMs,
    requestId,
    timestamp: Date.now(),
  };
}

/**
 * Wrap a tool execution with event emission
 *
 * @example
 * ```typescript
 * const result = await withToolEvents(
 *   "get_price",
 *   { symbol: "BTC-USDT" },
 *   async () => {
 *     return await priceService.getPrice("BTC-USDT");
 *   }
 * );
 * ```
 */
export async function withToolEvents<T>(
  tool: string,
  args: Record<string, unknown>,
  fn: () => Promise<T>
): Promise<T> {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const startTime = Date.now();

  // Emit start event
  await eventBus.emit(createToolStartEvent(tool, args, requestId));

  try {
    const result = await fn();
    const durationMs = Date.now() - startTime;

    // Emit end event
    await eventBus.emit(createToolEndEvent(tool, result, durationMs, requestId));

    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;

    // Emit error event
    await eventBus.emit(
      createToolErrorEvent(
        tool,
        error instanceof Error ? error.message : String(error),
        durationMs,
        requestId
      )
    );

    throw error;
  }
}
