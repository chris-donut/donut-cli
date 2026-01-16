/**
 * Base Agent Class - Core agent functionality with dependency injection
 *
 * This implements the multi-stage workflow pattern with session continuity
 * via the `resume` parameter. Uses dependency injection for testability
 * and flexibility.
 */

import { query, Options } from "@anthropic-ai/claude-agent-sdk";
import {
  AgentType,
  WorkflowStage,
  AgentResult,
  TerminalConfig,
  getAllowedTools,
  ToolExecutionContext,
  isHighRiskTool,
} from "../core/types.js";
import {
  AgentDependencies,
  Logger,
  RiskManager,
  McpServerProvider,
  SessionProvider,
  McpServerConfig,
} from "../core/dependencies.js";
import {
  ReasoningScratchpad,
  ReasoningTrace,
  ReasoningStep,
} from "./reasoning.js";
import { eventBus } from "../core/events.js";
import {
  ContextManager,
  ContextUsage,
  formatContextUsage,
} from "./context-manager.js";
import {
  ConsoleLogger,
  createDefaultDependencies,
  DefaultMcpServerProvider,
  RiskManagerAdapter,
  SessionManagerAdapter,
} from "../core/providers.js";
import { SessionManager } from "../core/session.js";

// ============================================================================
// Agent Configuration
// ============================================================================

/**
 * Configuration for agent creation
 * Supports both legacy (direct config) and new (dependency injection) styles
 */
export interface AgentConfig {
  terminalConfig: TerminalConfig;
  sessionManager: SessionManager;

  /**
   * Optional dependency overrides for testing or custom implementations
   */
  dependencies?: Partial<AgentDependencies>;

  /**
   * Maximum iterations before graceful degradation (default: 25)
   * Agent will generate progress summary instead of failing
   */
  maxIterations?: number;
}

// ============================================================================
// Message Types
// ============================================================================

/**
 * Message types from Claude Agent SDK query
 */
interface AgentMessage {
  type: "system" | "tool_use" | "tool_result" | "result" | "text";
  subtype?: "init" | "success" | "error";
  session_id?: string;
  result?: string;
  tool_name?: string;
  tool_input?: unknown;
  text?: string;
}

// ============================================================================
// Base Agent
// ============================================================================

/**
 * Base class for all trading terminal agents
 *
 * Provides:
 * - Session management with resume capability
 * - MCP server integration via injected provider
 * - Tool filtering by workflow stage
 * - Streaming message processing
 * - Risk management hooks
 *
 * Dependencies are injected for testability and flexibility.
 */
export abstract class BaseAgent {
  protected readonly config: AgentConfig;
  protected readonly riskManager: RiskManager;
  protected readonly mcpProvider: McpServerProvider;
  protected readonly sessionProvider: SessionProvider;

  private readonly _baseLogger: Logger;
  private _logger?: Logger;

  protected sessionId?: string;
  protected blockedTools: Set<string> = new Set();

  /** ReAct-style reasoning scratchpad for transparent decision making */
  protected readonly scratchpad: ReasoningScratchpad = new ReasoningScratchpad();

  /** Context manager for efficient memory usage */
  protected readonly contextManager: ContextManager = new ContextManager();

  /** Current iteration count for the run */
  protected iterationCount: number = 0;

  /** Maximum iterations before graceful degradation */
  protected readonly maxIterations: number;

  /** Warning threshold (percentage of maxIterations) */
  protected readonly iterationWarningThreshold: number = 0.8;

  constructor(config: AgentConfig) {
    this.config = config;

    // Create default dependencies if not provided
    const deps = createDefaultDependencies(
      config.terminalConfig,
      config.sessionManager,
      config.dependencies
    );

    // Store base logger - child logger created lazily to access agentType
    this._baseLogger = deps.logger;
    this.riskManager = deps.riskManager;
    this.mcpProvider = deps.mcpProvider;
    this.sessionProvider = deps.sessionProvider;

    // Initialize iteration limit (default 25, can be overridden)
    this.maxIterations = config.maxIterations ?? 25;
  }

  /**
   * Get logger with agent context (lazy initialization)
   */
  protected get logger(): Logger {
    if (!this._logger) {
      this._logger = this._baseLogger.child({ agent: this.agentType });
    }
    return this._logger;
  }

  // ============================================================================
  // Abstract Properties (implemented by subclasses)
  // ============================================================================

  /**
   * The type of this agent (for identification and logging)
   */
  abstract get agentType(): AgentType;

  /**
   * System prompt that defines this agent's role and capabilities
   */
  abstract get systemPrompt(): string;

  /**
   * Default tools this agent can use (may be filtered by stage)
   * Can be overridden in subclasses or use provider's defaults
   */
  get defaultTools(): string[] {
    return this.mcpProvider.getDefaultTools(this.agentType);
  }

  // ============================================================================
  // Protected Helpers
  // ============================================================================

  /**
   * Build the options object for the Claude Agent SDK query
   */
  protected buildOptions(
    stage: WorkflowStage,
    additionalTools?: string[]
  ): Options {
    // Get tools allowed for this stage
    const stageTools = getAllowedTools(stage, "all");

    // Combine with default tools and any additional tools
    const allTools = [
      ...new Set([
        ...this.defaultTools.filter((t) => stageTools.includes(t)),
        ...(additionalTools || []),
      ]),
    ];

    const options: Options = {
      mcpServers: this.mcpProvider.getMcpServers() as Record<string, McpServerConfig>,
      allowedTools: allTools,
      maxTurns: this.config.terminalConfig.maxTurns,
      systemPrompt: this.systemPrompt,
    };

    // Resume from previous session if we have one
    if (this.sessionId) {
      options.resume = this.sessionId;
    }

    return options;
  }

  /**
   * Get the backend type from the MCP provider
   */
  protected getBackendType(): "hummingbot" | "nofx" | "none" {
    return this.mcpProvider.getBackendType();
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Run the agent with a prompt in a specific workflow stage
   */
  async run(prompt: string, stage: WorkflowStage): Promise<AgentResult> {
    // Check for existing session to resume
    const existingSessionId = this.sessionProvider.getAgentSession(this.agentType);
    if (existingSessionId) {
      this.sessionId = existingSessionId;
    }

    const options = this.buildOptions(stage);
    let result = "";
    let success = true;
    let errorMessage: string | undefined;

    this.blockedTools.clear();

    // Reset reasoning scratchpad and iteration count for new run
    this.scratchpad.reset();
    this.iterationCount = 0;
    this.scratchpad.startThinking(`Processing prompt: ${prompt.slice(0, 100)}...`);

    try {
      // Process streaming messages from the agent
      for await (const message of query({ prompt, options }) as AsyncIterable<AgentMessage>) {
        // Check iteration limit before processing
        if (this.checkIterationLimit()) {
          result = this.generateProgressSummary();
          break;
        }

        await this.processMessage(message, stage);

        // Capture session ID from init message
        if (message.type === "system" && message.subtype === "init" && message.session_id) {
          this.sessionId = message.session_id;
          await this.sessionProvider.updateAgentSession(this.agentType, this.sessionId);
        }

        // Capture final result
        if (message.type === "result" && message.subtype === "success" && message.result) {
          result = message.result;
        }

        // Handle errors
        if (message.type === "result" && message.subtype === "error") {
          success = false;
          errorMessage = message.result || "Unknown error";
        }
      }
    } catch (error) {
      success = false;
      errorMessage = error instanceof Error ? error.message : String(error);
      this.scratchpad.markError(errorMessage);
      this.logger.error("Agent run failed", {
        error: errorMessage,
        stage,
        prompt: prompt.slice(0, 100),
      });
    }

    // Complete final reasoning step
    this.scratchpad.completeStep();

    // Get the reasoning trace for inclusion in result
    const reasoningTrace = this.getReasoningTrace();
    this.logger.debug("Agent run completed", {
      success,
      reasoningSteps: reasoningTrace.steps.length,
      totalDurationMs: reasoningTrace.totalDurationMs,
    });

    return {
      agentType: this.agentType,
      stage,
      success,
      result,
      sessionId: this.sessionId,
      timestamp: new Date(),
      error: errorMessage,
      reasoningTrace, // Include trace in result for debugging
    };
  }

  /**
   * Process a message from the agent stream
   * Override in subclasses to add custom handling
   *
   * For high-risk tools, performs pre-execution risk checks via RiskManager.
   * Blocked trades are logged with the reason and marked in blockedTools set.
   */
  protected async processMessage(
    message: AgentMessage,
    stage: WorkflowStage
  ): Promise<void> {
    if (message.type === "tool_use" && message.tool_name) {
      await this.handleToolUse(message, stage);
    }

    if (message.type === "tool_result" && message.tool_name) {
      await this.handleToolResult(message, stage);
    }

    if (message.type === "text" && message.text) {
      this.logger.write(message.text);

      // Emit agent:thinking event for TUI display
      await eventBus.emit({
        type: "agent:thinking",
        agentName: this.agentType,
        thought: message.text.slice(0, 200),
        timestamp: Date.now(),
      });

      // Update scratchpad with thinking content
      this.scratchpad.addReflection(message.text.slice(0, 500));
    }
  }

  /**
   * Handle tool use messages with risk checking and reasoning tracking
   */
  private async handleToolUse(
    message: AgentMessage,
    stage: WorkflowStage
  ): Promise<void> {
    const toolName = message.tool_name!;
    const toolInput = (message.tool_input as Record<string, unknown>) ?? {};

    // Record action in reasoning scratchpad
    this.scratchpad.recordAction(toolName, toolInput);

    if (isHighRiskTool(toolName)) {
      const context: ToolExecutionContext = {
        toolName,
        params: toolInput,
        agentType: this.agentType,
        stage,
        sessionId: this.sessionId ?? "unknown",
      };

      const riskResult = await this.riskManager.preToolUseHook(context);

      if (riskResult.warnings.length > 0) {
        for (const warning of riskResult.warnings) {
          this.logger.warn(`Risk warning: ${warning}`, { tool: toolName });
        }
      }

      if (!riskResult.allowed) {
        this.logger.warn(`Tool blocked: ${toolName}`, { reason: riskResult.reason });
        this.blockedTools.add(toolName);
        this.scratchpad.recordObservation(`Blocked by risk manager: ${riskResult.reason}`);
        return;
      }
    }

    this.logger.info(`Using tool: ${toolName}`, { agent: this.agentType });
  }

  /**
   * Handle tool result messages with post-execution tracking and reasoning
   */
  private async handleToolResult(
    message: AgentMessage,
    stage: WorkflowStage
  ): Promise<void> {
    const toolName = message.tool_name!;
    const resultText = typeof message.result === "string"
      ? message.result
      : JSON.stringify(message.result);

    // Track tool result in context manager (may summarize if too large)
    const { summarized } = this.contextManager.addToolResult(toolName, message.result);
    if (summarized) {
      this.logger.debug("Tool result was summarized for context efficiency", { toolName });
    }

    // Check if context needs compaction
    if (this.contextManager.needsCompaction()) {
      const removed = this.contextManager.compact();
      this.logger.info("Context auto-compacted", {
        removedMessages: removed,
        usage: this.contextManager.getUsage(),
      });
    }

    // Record observation in reasoning scratchpad
    this.scratchpad.recordObservation(
      resultText.length > 500 ? resultText.slice(0, 500) + "..." : resultText
    );
    this.scratchpad.completeStep();

    // Start new thinking step for processing result
    this.scratchpad.startThinking(`Processing result from ${toolName}`);

    if (isHighRiskTool(toolName) && !this.blockedTools.has(toolName)) {
      const context: ToolExecutionContext = {
        toolName,
        params: {},
        agentType: this.agentType,
        stage,
        sessionId: this.sessionId ?? "unknown",
      };
      await this.riskManager.postToolUseHook(context, message.result);
    }
  }

  /**
   * Reset the agent session (start fresh)
   */
  resetSession(): void {
    this.sessionId = undefined;
    this.scratchpad.reset();
    this.contextManager.clear();
  }

  /**
   * Get the current session ID
   */
  getSessionId(): string | undefined {
    return this.sessionId;
  }

  /**
   * Get the reasoning trace for this agent run
   * Provides transparency into the agent's decision-making process
   */
  getReasoningTrace(): ReasoningTrace {
    return this.scratchpad.getTrace(this.agentType, this.sessionId);
  }

  /**
   * Get the current reasoning step (if any)
   */
  getCurrentReasoningStep(): ReasoningStep | undefined {
    return this.scratchpad.getCurrentStep();
  }

  /**
   * Get context usage statistics
   */
  getContextUsage(): ContextUsage {
    return this.contextManager.getUsage();
  }

  /**
   * Get formatted context usage for display
   */
  getFormattedContextUsage(): string {
    return formatContextUsage(this.contextManager.getUsage());
  }

  /**
   * Manually trigger context compaction if needed
   * Returns number of messages removed
   */
  compactContext(): number {
    if (this.contextManager.needsCompaction()) {
      const removed = this.contextManager.compact();
      this.logger.info("Context compacted manually", { removedMessages: removed });
      return removed;
    }
    return 0;
  }

  /**
   * Get current iteration count
   */
  getIterationCount(): number {
    return this.iterationCount;
  }

  /**
   * Get max iterations setting
   */
  getMaxIterations(): number {
    return this.maxIterations;
  }

  /**
   * Check if iteration limit has been reached
   */
  hasReachedIterationLimit(): boolean {
    return this.iterationCount >= this.maxIterations;
  }

  /**
   * Generate a progress summary when iteration limit is reached
   * This provides graceful degradation instead of hard failure
   */
  protected generateProgressSummary(): string {
    const trace = this.getReasoningTrace();
    const contextUsage = this.contextManager.getUsage();

    const completedActions = trace.steps
      .filter((s) => s.action)
      .map((s) => `- ${s.action}: ${s.observation?.slice(0, 100) || "completed"}`)
      .join("\n");

    const lastThought = trace.steps.length > 0
      ? trace.steps[trace.steps.length - 1].thought
      : "No reasoning recorded";

    return [
      "⚠️ Iteration limit reached - generating progress summary",
      "",
      `Iterations: ${this.iterationCount}/${this.maxIterations}`,
      `Reasoning steps: ${trace.steps.length}`,
      `Context usage: ${(contextUsage.percentUsed * 100).toFixed(1)}%`,
      "",
      "Completed actions:",
      completedActions || "- No actions completed",
      "",
      "Last thought:",
      lastThought,
      "",
      "Consider:",
      "- Breaking down the task into smaller steps",
      "- Increasing maxIterations if more time is needed",
      "- Providing more specific instructions",
    ].join("\n");
  }

  /**
   * Check and handle iteration limit during processing
   * Returns true if limit was reached and processing should stop
   */
  protected checkIterationLimit(): boolean {
    this.iterationCount++;

    // Check warning threshold
    const warningThreshold = Math.floor(this.maxIterations * this.iterationWarningThreshold);
    if (this.iterationCount === warningThreshold) {
      this.logger.warn("Approaching iteration limit", {
        current: this.iterationCount,
        max: this.maxIterations,
        remaining: this.maxIterations - this.iterationCount,
      });
    }

    // Check if limit reached
    if (this.iterationCount >= this.maxIterations) {
      this.logger.warn("Iteration limit reached", {
        iterations: this.iterationCount,
        maxIterations: this.maxIterations,
      });

      // Emit iteration limit event
      eventBus.emit({
        type: "agent:thinking",
        agentName: this.agentType,
        thought: `Iteration limit (${this.maxIterations}) reached - generating progress summary`,
        timestamp: Date.now(),
      });

      return true;
    }

    return false;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Helper to create a formatted agent result for errors
 */
export function createErrorResult(
  agentType: AgentType,
  stage: WorkflowStage,
  error: string
): AgentResult {
  return {
    agentType,
    stage,
    success: false,
    result: "",
    timestamp: new Date(),
    error,
  };
}

/**
 * Re-export McpServerConfig for backward compatibility
 */
export type { McpServerConfig } from "../core/dependencies.js";
