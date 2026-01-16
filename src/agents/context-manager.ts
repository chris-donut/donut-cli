/**
 * Context Manager for Agent Memory Efficiency
 *
 * Manages context window usage by:
 * - Tracking token usage estimates
 * - Summarizing large tool results
 * - Compacting old messages when needed
 *
 * This prevents agents from running out of context in long sessions.
 */

import { createLogger } from "../core/logger.js";

const logger = createLogger("context-manager");

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for context management
 */
export interface ContextManagerConfig {
  /** Maximum tokens to allow before compaction (default: 100000) */
  maxTokens?: number;
  /** Threshold at which to start summarizing (default: 0.8 = 80%) */
  summarizeThreshold?: number;
  /** Maximum tokens for tool result before summarizing (default: 2000) */
  toolResultMaxTokens?: number;
  /** Target token count after compaction (default: 0.6 = 60% of max) */
  compactionTarget?: number;
}

/**
 * A message in the context history
 */
export interface ContextMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  timestamp: number;
  tokenEstimate: number;
  toolName?: string;
  /** Whether this message has been summarized */
  isSummary?: boolean;
  /** Original content before summarization */
  originalContent?: string;
}

/**
 * Context usage statistics
 */
export interface ContextUsage {
  totalTokens: number;
  messageCount: number;
  percentUsed: number;
  needsCompaction: boolean;
  oldestMessageAge: number;
}

// ============================================================================
// Token Estimation
// ============================================================================

/**
 * Estimate token count for a string
 * Uses a simple heuristic: ~4 characters per token for English text
 * This is a rough estimate - actual tokenization varies by model
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  // Simple heuristic: ~4 characters per token for English text
  // Adjust for common patterns
  const baseEstimate = Math.ceil(text.length / 4);

  // Code and JSON tend to have more tokens per character
  const hasCode = text.includes("```") || text.includes("{");
  const multiplier = hasCode ? 1.2 : 1.0;

  return Math.ceil(baseEstimate * multiplier);
}

// ============================================================================
// Context Manager Class
// ============================================================================

/**
 * Manages context window for agent conversations
 *
 * @example
 * ```typescript
 * const contextManager = new ContextManager({ maxTokens: 100000 });
 *
 * // Add messages
 * contextManager.addMessage({
 *   role: "user",
 *   content: "What's the BTC price?",
 * });
 *
 * // Add tool result (will be summarized if too large)
 * const summarized = contextManager.addToolResult(
 *   "get_candles",
 *   largeJsonResult
 * );
 *
 * // Check if compaction needed
 * if (contextManager.needsCompaction()) {
 *   await contextManager.compact();
 * }
 * ```
 */
export class ContextManager {
  private messages: ContextMessage[] = [];
  private config: Required<ContextManagerConfig>;

  constructor(config: ContextManagerConfig = {}) {
    this.config = {
      maxTokens: config.maxTokens ?? 100000,
      summarizeThreshold: config.summarizeThreshold ?? 0.8,
      toolResultMaxTokens: config.toolResultMaxTokens ?? 2000,
      compactionTarget: config.compactionTarget ?? 0.6,
    };
  }

  /**
   * Add a message to the context
   */
  addMessage(
    role: "user" | "assistant" | "tool",
    content: string,
    toolName?: string
  ): ContextMessage {
    const tokenEstimate = estimateTokens(content);
    const message: ContextMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      role,
      content,
      timestamp: Date.now(),
      tokenEstimate,
      toolName,
    };

    this.messages.push(message);

    logger.debug("Message added to context", {
      role,
      tokens: tokenEstimate,
      totalTokens: this.getTotalTokens(),
    });

    return message;
  }

  /**
   * Add a tool result, summarizing if necessary
   * Returns true if the result was summarized
   */
  addToolResult(toolName: string, result: unknown): { summarized: boolean; message: ContextMessage } {
    const resultString = typeof result === "string" ? result : JSON.stringify(result, null, 2);
    const tokenEstimate = estimateTokens(resultString);

    let content = resultString;
    let summarized = false;
    let originalContent: string | undefined;

    // Summarize if too large
    if (tokenEstimate > this.config.toolResultMaxTokens) {
      originalContent = resultString;
      content = this.summarizeToolResult(toolName, resultString);
      summarized = true;

      logger.info("Tool result summarized", {
        toolName,
        originalTokens: tokenEstimate,
        summarizedTokens: estimateTokens(content),
      });
    }

    const message = this.addMessage("tool", content, toolName);
    message.isSummary = summarized;
    message.originalContent = originalContent;

    return { summarized, message };
  }

  /**
   * Summarize a large tool result
   * This is a local summarization without LLM - for LLM summarization,
   * override this method or use compactWithLLM()
   */
  protected summarizeToolResult(toolName: string, result: string): string {
    // Try to parse as JSON and extract key fields
    try {
      const parsed = JSON.parse(result);

      // Handle arrays (e.g., candle data, trade history)
      if (Array.isArray(parsed)) {
        const count = parsed.length;
        const sample = parsed.slice(0, 3);
        return `[${toolName}] Array of ${count} items. Sample: ${JSON.stringify(sample, null, 2)}...`;
      }

      // Handle objects with known patterns
      if (typeof parsed === "object" && parsed !== null) {
        // Extract key summary fields
        const summary: Record<string, unknown> = {};
        const summaryKeys = [
          "success", "status", "message", "error",
          "total", "count", "balance", "pnl",
          "price", "volume", "timestamp",
        ];

        for (const key of summaryKeys) {
          if (key in parsed) {
            summary[key] = parsed[key];
          }
        }

        if (Object.keys(summary).length > 0) {
          return `[${toolName}] Summary: ${JSON.stringify(summary, null, 2)}`;
        }

        // Just show keys if no known fields
        const keys = Object.keys(parsed);
        return `[${toolName}] Object with keys: ${keys.join(", ")}`;
      }
    } catch {
      // Not JSON, truncate text
    }

    // Fallback: truncate with indication
    const maxChars = this.config.toolResultMaxTokens * 4; // Rough token-to-char
    if (result.length > maxChars) {
      return `[${toolName}] ${result.slice(0, maxChars)}... (truncated, ${result.length} chars total)`;
    }

    return result;
  }

  /**
   * Get total token estimate for context
   */
  getTotalTokens(): number {
    return this.messages.reduce((sum, msg) => sum + msg.tokenEstimate, 0);
  }

  /**
   * Get context usage statistics
   */
  getUsage(): ContextUsage {
    const totalTokens = this.getTotalTokens();
    const percentUsed = totalTokens / this.config.maxTokens;
    const oldestMessage = this.messages[0];

    return {
      totalTokens,
      messageCount: this.messages.length,
      percentUsed,
      needsCompaction: percentUsed >= this.config.summarizeThreshold,
      oldestMessageAge: oldestMessage ? Date.now() - oldestMessage.timestamp : 0,
    };
  }

  /**
   * Check if context needs compaction
   */
  needsCompaction(): boolean {
    return this.getUsage().needsCompaction;
  }

  /**
   * Compact context by removing oldest messages
   * Returns number of messages removed
   */
  compact(): number {
    const usage = this.getUsage();
    if (!usage.needsCompaction) {
      return 0;
    }

    const targetTokens = this.config.maxTokens * this.config.compactionTarget;
    let removedCount = 0;

    // Remove oldest messages until under target
    while (this.getTotalTokens() > targetTokens && this.messages.length > 1) {
      const removed = this.messages.shift();
      if (removed) {
        removedCount++;
        logger.debug("Message removed during compaction", {
          id: removed.id,
          role: removed.role,
          tokens: removed.tokenEstimate,
        });
      }
    }

    logger.info("Context compacted", {
      removedMessages: removedCount,
      newTotalTokens: this.getTotalTokens(),
      newMessageCount: this.messages.length,
    });

    return removedCount;
  }

  /**
   * Get all messages in context
   */
  getMessages(): ContextMessage[] {
    return [...this.messages];
  }

  /**
   * Get recent messages (for display)
   */
  getRecentMessages(count: number = 10): ContextMessage[] {
    return this.messages.slice(-count);
  }

  /**
   * Clear all messages
   */
  clear(): void {
    this.messages = [];
    logger.debug("Context cleared");
  }

  /**
   * Get configuration
   */
  getConfig(): Required<ContextManagerConfig> {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ContextManagerConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format context usage for display
 */
export function formatContextUsage(usage: ContextUsage): string {
  const percentStr = (usage.percentUsed * 100).toFixed(1);
  const ageMinutes = Math.floor(usage.oldestMessageAge / 60000);

  return [
    `Context Usage: ${percentStr}% (${usage.totalTokens.toLocaleString()} tokens)`,
    `Messages: ${usage.messageCount}`,
    `Oldest message: ${ageMinutes}m ago`,
    usage.needsCompaction ? "⚠️ Compaction recommended" : "✓ Context healthy",
  ].join("\n");
}
