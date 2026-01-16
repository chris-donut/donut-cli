/**
 * Agent Metrics and Observability
 *
 * Provides comprehensive execution metrics for agent runs including:
 * - Iteration and tool call counts
 * - Timing information (total duration, per-tool averages)
 * - Token usage estimates
 * - Success/error tracking
 *
 * These metrics enable performance monitoring, debugging, and optimization.
 */

import { createLogger } from "../core/logger.js";
import { AgentType, WorkflowStage } from "../core/types.js";

const logger = createLogger("agent-metrics");

// ============================================================================
// Types
// ============================================================================

/**
 * Metrics for a single tool execution
 */
export interface ToolCallMetric {
  toolName: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  success: boolean;
  error?: string;
  inputSize?: number;
  outputSize?: number;
}

/**
 * Aggregated metrics per tool
 */
export interface ToolMetrics {
  toolName: string;
  callCount: number;
  successCount: number;
  errorCount: number;
  totalDurationMs: number;
  averageDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
}

/**
 * Comprehensive agent execution metrics
 */
export interface AgentMetrics {
  // Identity
  agentType: AgentType;
  sessionId?: string;
  stage: WorkflowStage;

  // Timing
  startTime: number;
  endTime?: number;
  totalDurationMs: number;

  // Iteration tracking
  totalIterations: number;
  maxIterations: number;
  iterationLimitReached: boolean;

  // Tool execution
  toolCalls: ToolCallMetric[];
  toolMetrics: Map<string, ToolMetrics>;
  totalToolCalls: number;
  successfulToolCalls: number;
  failedToolCalls: number;

  // Token estimates
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  contextTokensUsed: number;
  contextTokensMax: number;

  // Reasoning
  reasoningSteps: number;

  // Status
  success: boolean;
  aborted: boolean;
  error?: string;
}

/**
 * Configuration for metrics collection
 */
export interface MetricsConfig {
  /** Whether to track detailed per-call metrics (default: true) */
  trackDetailedCalls?: boolean;
  /** Whether to estimate token usage (default: true) */
  estimateTokens?: boolean;
}

// ============================================================================
// Metrics Collector Class
// ============================================================================

/**
 * Collects and aggregates metrics during agent execution
 *
 * @example
 * ```typescript
 * const collector = new MetricsCollector("orchestrator", "RESEARCHING");
 *
 * // Track tool calls
 * collector.startToolCall("get_candles");
 * // ... tool executes ...
 * collector.endToolCall("get_candles", true);
 *
 * // Get final metrics
 * const metrics = collector.finalize(true);
 * console.log(formatMetricsReport(metrics));
 * ```
 */
export class MetricsCollector {
  private metrics: AgentMetrics;
  private activeToolCalls: Map<string, ToolCallMetric> = new Map();
  private config: Required<MetricsConfig>;

  constructor(
    agentType: AgentType,
    stage: WorkflowStage,
    config: MetricsConfig = {}
  ) {
    this.config = {
      trackDetailedCalls: config.trackDetailedCalls ?? true,
      estimateTokens: config.estimateTokens ?? true,
    };

    this.metrics = {
      agentType,
      stage,
      startTime: Date.now(),
      totalDurationMs: 0,
      totalIterations: 0,
      maxIterations: 25, // Will be updated from agent config
      iterationLimitReached: false,
      toolCalls: [],
      toolMetrics: new Map(),
      totalToolCalls: 0,
      successfulToolCalls: 0,
      failedToolCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      contextTokensUsed: 0,
      contextTokensMax: 100000, // Default, updated from context manager
      reasoningSteps: 0,
      success: false,
      aborted: false,
    };
  }

  // ============================================================================
  // Session Management
  // ============================================================================

  /**
   * Set the session ID for this metrics collection
   */
  setSessionId(sessionId: string): void {
    this.metrics.sessionId = sessionId;
  }

  /**
   * Set the max iterations from agent config
   */
  setMaxIterations(maxIterations: number): void {
    this.metrics.maxIterations = maxIterations;
  }

  // ============================================================================
  // Iteration Tracking
  // ============================================================================

  /**
   * Record an iteration
   */
  recordIteration(): void {
    this.metrics.totalIterations++;
  }

  /**
   * Mark that iteration limit was reached
   */
  markIterationLimitReached(): void {
    this.metrics.iterationLimitReached = true;
  }

  // ============================================================================
  // Tool Call Tracking
  // ============================================================================

  /**
   * Start tracking a tool call
   */
  startToolCall(toolName: string, inputSize?: number): void {
    const metric: ToolCallMetric = {
      toolName,
      startTime: Date.now(),
      success: false, // Default until ended
      inputSize,
    };

    this.activeToolCalls.set(toolName, metric);
    this.metrics.totalToolCalls++;

    logger.debug("Tool call started", { toolName, inputSize });
  }

  /**
   * End tracking a tool call
   */
  endToolCall(
    toolName: string,
    success: boolean,
    outputSize?: number,
    error?: string
  ): void {
    const metric = this.activeToolCalls.get(toolName);
    if (!metric) {
      logger.warn("Ending untracked tool call", { toolName });
      return;
    }

    metric.endTime = Date.now();
    metric.durationMs = metric.endTime - metric.startTime;
    metric.success = success;
    metric.outputSize = outputSize;
    metric.error = error;

    // Update counters
    if (success) {
      this.metrics.successfulToolCalls++;
    } else {
      this.metrics.failedToolCalls++;
    }

    // Store detailed metric if configured
    if (this.config.trackDetailedCalls) {
      this.metrics.toolCalls.push(metric);
    }

    // Update aggregated metrics
    this.updateToolMetrics(metric);

    // Clean up active call
    this.activeToolCalls.delete(toolName);

    logger.debug("Tool call ended", {
      toolName,
      success,
      durationMs: metric.durationMs,
    });
  }

  /**
   * Update aggregated metrics for a tool
   */
  private updateToolMetrics(call: ToolCallMetric): void {
    const existing = this.metrics.toolMetrics.get(call.toolName);
    const duration = call.durationMs ?? 0;

    if (existing) {
      existing.callCount++;
      if (call.success) {
        existing.successCount++;
      } else {
        existing.errorCount++;
      }
      existing.totalDurationMs += duration;
      existing.averageDurationMs = existing.totalDurationMs / existing.callCount;
      existing.minDurationMs = Math.min(existing.minDurationMs, duration);
      existing.maxDurationMs = Math.max(existing.maxDurationMs, duration);
    } else {
      this.metrics.toolMetrics.set(call.toolName, {
        toolName: call.toolName,
        callCount: 1,
        successCount: call.success ? 1 : 0,
        errorCount: call.success ? 0 : 1,
        totalDurationMs: duration,
        averageDurationMs: duration,
        minDurationMs: duration,
        maxDurationMs: duration,
      });
    }
  }

  // ============================================================================
  // Token Tracking
  // ============================================================================

  /**
   * Add input tokens (from prompt)
   */
  addInputTokens(count: number): void {
    this.metrics.inputTokens += count;
    this.metrics.totalTokens = this.metrics.inputTokens + this.metrics.outputTokens;
  }

  /**
   * Add output tokens (from response)
   */
  addOutputTokens(count: number): void {
    this.metrics.outputTokens += count;
    this.metrics.totalTokens = this.metrics.inputTokens + this.metrics.outputTokens;
  }

  /**
   * Update context usage from context manager
   */
  updateContextUsage(used: number, max: number): void {
    this.metrics.contextTokensUsed = used;
    this.metrics.contextTokensMax = max;
  }

  // ============================================================================
  // Reasoning Tracking
  // ============================================================================

  /**
   * Record a reasoning step
   */
  recordReasoningStep(): void {
    this.metrics.reasoningSteps++;
  }

  // ============================================================================
  // Finalization
  // ============================================================================

  /**
   * Mark as aborted
   */
  markAborted(): void {
    this.metrics.aborted = true;
  }

  /**
   * Set error information
   */
  setError(error: string): void {
    this.metrics.error = error;
  }

  /**
   * Finalize metrics and return the complete snapshot
   */
  finalize(success: boolean): AgentMetrics {
    this.metrics.endTime = Date.now();
    this.metrics.totalDurationMs = this.metrics.endTime - this.metrics.startTime;
    this.metrics.success = success;

    logger.info("Agent metrics finalized", {
      agentType: this.metrics.agentType,
      success,
      totalDurationMs: this.metrics.totalDurationMs,
      totalIterations: this.metrics.totalIterations,
      totalToolCalls: this.metrics.totalToolCalls,
    });

    return { ...this.metrics };
  }

  /**
   * Get current metrics snapshot (without finalizing)
   */
  getSnapshot(): AgentMetrics {
    return {
      ...this.metrics,
      totalDurationMs: Date.now() - this.metrics.startTime,
    };
  }
}

// ============================================================================
// Formatting Functions
// ============================================================================

/**
 * Format metrics as a human-readable report
 */
export function formatMetricsReport(metrics: AgentMetrics): string {
  const lines: string[] = [];

  // Header
  lines.push("═══════════════════════════════════════════════════");
  lines.push(`  Agent Metrics Report: ${metrics.agentType}`);
  lines.push("═══════════════════════════════════════════════════");
  lines.push("");

  // Status
  const statusIcon = metrics.success ? "✓" : metrics.aborted ? "⚠" : "✗";
  const statusText = metrics.success
    ? "Completed successfully"
    : metrics.aborted
    ? "Aborted by user"
    : `Failed: ${metrics.error || "Unknown error"}`;
  lines.push(`Status: ${statusIcon} ${statusText}`);
  lines.push(`Stage: ${metrics.stage}`);
  if (metrics.sessionId) {
    lines.push(`Session: ${metrics.sessionId.slice(0, 16)}...`);
  }
  lines.push("");

  // Timing
  lines.push("─── Timing ───────────────────────────────────────");
  lines.push(`Total Duration: ${formatDuration(metrics.totalDurationMs)}`);
  lines.push("");

  // Iterations
  lines.push("─── Iterations ───────────────────────────────────");
  lines.push(`Iterations: ${metrics.totalIterations}/${metrics.maxIterations}`);
  if (metrics.iterationLimitReached) {
    lines.push("⚠ Iteration limit reached");
  }
  lines.push(`Reasoning Steps: ${metrics.reasoningSteps}`);
  lines.push("");

  // Tool Calls
  lines.push("─── Tool Calls ───────────────────────────────────");
  lines.push(`Total Calls: ${metrics.totalToolCalls}`);
  lines.push(`Successful: ${metrics.successfulToolCalls}`);
  lines.push(`Failed: ${metrics.failedToolCalls}`);
  const successRate =
    metrics.totalToolCalls > 0
      ? ((metrics.successfulToolCalls / metrics.totalToolCalls) * 100).toFixed(1)
      : "N/A";
  lines.push(`Success Rate: ${successRate}%`);
  lines.push("");

  // Per-Tool Breakdown
  if (metrics.toolMetrics.size > 0) {
    lines.push("─── Per-Tool Breakdown ───────────────────────────");
    const sortedTools = Array.from(metrics.toolMetrics.values()).sort(
      (a, b) => b.totalDurationMs - a.totalDurationMs
    );

    for (const tool of sortedTools) {
      const toolSuccessRate = ((tool.successCount / tool.callCount) * 100).toFixed(0);
      lines.push(
        `  ${tool.toolName}: ${tool.callCount} calls, ` +
          `avg ${formatDuration(tool.averageDurationMs)}, ` +
          `${toolSuccessRate}% success`
      );
    }
    lines.push("");
  }

  // Token Usage
  lines.push("─── Token Usage ──────────────────────────────────");
  lines.push(`Input Tokens: ${metrics.inputTokens.toLocaleString()}`);
  lines.push(`Output Tokens: ${metrics.outputTokens.toLocaleString()}`);
  lines.push(`Total Tokens: ${metrics.totalTokens.toLocaleString()}`);
  const contextPercent = (
    (metrics.contextTokensUsed / metrics.contextTokensMax) *
    100
  ).toFixed(1);
  lines.push(
    `Context Usage: ${metrics.contextTokensUsed.toLocaleString()}/${metrics.contextTokensMax.toLocaleString()} (${contextPercent}%)`
  );
  lines.push("");

  lines.push("═══════════════════════════════════════════════════");

  return lines.join("\n");
}

/**
 * Format metrics as a compact single-line summary
 */
export function formatMetricsSummary(metrics: AgentMetrics): string {
  const status = metrics.success ? "✓" : metrics.aborted ? "⚠" : "✗";
  const duration = formatDuration(metrics.totalDurationMs);
  const toolRate =
    metrics.totalToolCalls > 0
      ? `${metrics.successfulToolCalls}/${metrics.totalToolCalls}`
      : "0/0";

  return (
    `[${status}] ${metrics.agentType} | ` +
    `${duration} | ` +
    `${metrics.totalIterations} iters | ` +
    `${toolRate} tools | ` +
    `${metrics.totalTokens.toLocaleString()} tokens`
  );
}

/**
 * Format milliseconds as human-readable duration
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  }
}

// ============================================================================
// Metrics Aggregation
// ============================================================================

/**
 * Aggregate metrics from multiple agent runs
 */
export function aggregateMetrics(metricsList: AgentMetrics[]): {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  abortedRuns: number;
  averageDurationMs: number;
  totalToolCalls: number;
  totalTokens: number;
  toolBreakdown: Map<string, ToolMetrics>;
} {
  if (metricsList.length === 0) {
    return {
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      abortedRuns: 0,
      averageDurationMs: 0,
      totalToolCalls: 0,
      totalTokens: 0,
      toolBreakdown: new Map(),
    };
  }

  const toolBreakdown = new Map<string, ToolMetrics>();

  let totalDuration = 0;
  let totalToolCalls = 0;
  let totalTokens = 0;
  let successfulRuns = 0;
  let failedRuns = 0;
  let abortedRuns = 0;

  for (const metrics of metricsList) {
    totalDuration += metrics.totalDurationMs;
    totalToolCalls += metrics.totalToolCalls;
    totalTokens += metrics.totalTokens;

    if (metrics.success) {
      successfulRuns++;
    } else if (metrics.aborted) {
      abortedRuns++;
    } else {
      failedRuns++;
    }

    // Aggregate tool metrics
    for (const [toolName, toolMetric] of metrics.toolMetrics) {
      const existing = toolBreakdown.get(toolName);
      if (existing) {
        existing.callCount += toolMetric.callCount;
        existing.successCount += toolMetric.successCount;
        existing.errorCount += toolMetric.errorCount;
        existing.totalDurationMs += toolMetric.totalDurationMs;
        existing.averageDurationMs =
          existing.totalDurationMs / existing.callCount;
        existing.minDurationMs = Math.min(
          existing.minDurationMs,
          toolMetric.minDurationMs
        );
        existing.maxDurationMs = Math.max(
          existing.maxDurationMs,
          toolMetric.maxDurationMs
        );
      } else {
        toolBreakdown.set(toolName, { ...toolMetric });
      }
    }
  }

  return {
    totalRuns: metricsList.length,
    successfulRuns,
    failedRuns,
    abortedRuns,
    averageDurationMs: totalDuration / metricsList.length,
    totalToolCalls,
    totalTokens,
    toolBreakdown,
  };
}
