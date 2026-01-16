/**
 * ReAct-Style Reasoning Loop Types
 *
 * Implements the Reasoning + Acting pattern where agents explicitly
 * document their thinking before taking actions. This provides:
 * - Transparent decision making
 * - Debuggable agent behavior
 * - Audit trail for trading decisions
 *
 * Based on the ReAct paper: https://arxiv.org/abs/2210.03629
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * A single step in the agent's reasoning process
 */
export interface ReasoningStep {
  /** Unique ID for this step */
  id: string;
  /** Timestamp when this step occurred */
  timestamp: number;
  /** The agent's thought/reasoning about what to do */
  thought: string;
  /** The action taken (tool name) - undefined if pure reasoning */
  action?: string;
  /** The input/arguments for the action */
  actionInput?: Record<string, unknown>;
  /** The observation/result from the action */
  observation?: string;
  /** Reflection on what was learned from this step */
  reflection?: string;
  /** Duration of this step in milliseconds */
  durationMs?: number;
}

/**
 * Status of the reasoning trace
 */
export type ReasoningStatus =
  | "thinking"      // Agent is reasoning
  | "acting"        // Agent is executing an action
  | "observing"     // Agent is processing results
  | "reflecting"    // Agent is learning from results
  | "complete"      // Reasoning cycle complete
  | "error";        // Error occurred

/**
 * The complete reasoning trace for an agent run
 */
export interface ReasoningTrace {
  /** Agent type that produced this trace */
  agentType: string;
  /** Session ID for continuity */
  sessionId?: string;
  /** All reasoning steps in order */
  steps: ReasoningStep[];
  /** Current status */
  status: ReasoningStatus;
  /** Total duration of the reasoning process */
  totalDurationMs: number;
  /** Summary of the reasoning process */
  summary?: string;
}

// ============================================================================
// Scratchpad
// ============================================================================

/**
 * Scratchpad for maintaining reasoning state during agent execution
 *
 * @example
 * ```typescript
 * const scratchpad = new ReasoningScratchpad();
 *
 * // Start a new reasoning step
 * scratchpad.startThinking("I need to check the current BTC price");
 *
 * // Record the action
 * scratchpad.recordAction("get_price", { symbol: "BTC-USDT" });
 *
 * // Record the observation
 * scratchpad.recordObservation("BTC price is $45,230");
 *
 * // Add reflection
 * scratchpad.addReflection("Price is within expected range");
 *
 * // Get the trace
 * const trace = scratchpad.getTrace("analyst", "session-123");
 * ```
 */
export class ReasoningScratchpad {
  private steps: ReasoningStep[] = [];
  private currentStep?: ReasoningStep;
  private status: ReasoningStatus = "complete";
  private startTime: number = Date.now();

  /**
   * Start a new thinking step
   */
  startThinking(thought: string): void {
    // Finalize previous step if exists
    this.finalizeCurrentStep();

    this.currentStep = {
      id: `step_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      timestamp: Date.now(),
      thought,
    };
    this.status = "thinking";
  }

  /**
   * Record an action being taken
   */
  recordAction(action: string, input?: Record<string, unknown>): void {
    if (!this.currentStep) {
      this.startThinking(`Taking action: ${action}`);
    }

    this.currentStep!.action = action;
    this.currentStep!.actionInput = input;
    this.status = "acting";
  }

  /**
   * Record the observation from an action
   */
  recordObservation(observation: string): void {
    if (!this.currentStep) {
      this.startThinking("Processing observation");
    }

    this.currentStep!.observation = observation;
    this.status = "observing";
  }

  /**
   * Add reflection to the current step
   */
  addReflection(reflection: string): void {
    if (this.currentStep) {
      this.currentStep.reflection = reflection;
      this.status = "reflecting";
    }
  }

  /**
   * Complete the current step and add it to the trace
   */
  completeStep(): void {
    this.finalizeCurrentStep();
    this.status = "complete";
  }

  /**
   * Mark an error occurred
   */
  markError(error: string): void {
    if (this.currentStep) {
      this.currentStep.observation = `Error: ${error}`;
    }
    this.finalizeCurrentStep();
    this.status = "error";
  }

  /**
   * Get the current step (if any)
   */
  getCurrentStep(): ReasoningStep | undefined {
    return this.currentStep;
  }

  /**
   * Get all completed steps
   */
  getSteps(): ReasoningStep[] {
    return [...this.steps];
  }

  /**
   * Get the current status
   */
  getStatus(): ReasoningStatus {
    return this.status;
  }

  /**
   * Get the complete reasoning trace
   */
  getTrace(agentType: string, sessionId?: string): ReasoningTrace {
    // Include current step if not finalized
    const allSteps = this.currentStep
      ? [...this.steps, this.currentStep]
      : [...this.steps];

    return {
      agentType,
      sessionId,
      steps: allSteps,
      status: this.status,
      totalDurationMs: Date.now() - this.startTime,
      summary: this.generateSummary(allSteps),
    };
  }

  /**
   * Reset the scratchpad for a new run
   */
  reset(): void {
    this.steps = [];
    this.currentStep = undefined;
    this.status = "complete";
    this.startTime = Date.now();
  }

  /**
   * Finalize the current step and add to steps array
   */
  private finalizeCurrentStep(): void {
    if (this.currentStep) {
      this.currentStep.durationMs = Date.now() - this.currentStep.timestamp;
      this.steps.push(this.currentStep);
      this.currentStep = undefined;
    }
  }

  /**
   * Generate a summary of the reasoning process
   */
  private generateSummary(steps: ReasoningStep[]): string {
    if (steps.length === 0) return "No reasoning steps recorded";

    const actionCount = steps.filter((s) => s.action).length;
    const thoughtCount = steps.length;

    return `${thoughtCount} reasoning steps, ${actionCount} actions taken`;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a simple reasoning step for logging
 */
export function createReasoningStep(
  thought: string,
  action?: string,
  actionInput?: Record<string, unknown>
): ReasoningStep {
  return {
    id: `step_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    timestamp: Date.now(),
    thought,
    action,
    actionInput,
  };
}

/**
 * Format a reasoning trace for display
 */
export function formatReasoningTrace(trace: ReasoningTrace): string {
  const lines: string[] = [
    `=== Reasoning Trace for ${trace.agentType} ===`,
    `Status: ${trace.status}`,
    `Duration: ${trace.totalDurationMs}ms`,
    `Steps: ${trace.steps.length}`,
    "",
  ];

  for (const step of trace.steps) {
    lines.push(`[${new Date(step.timestamp).toISOString()}] ${step.id}`);
    lines.push(`  Thought: ${step.thought}`);

    if (step.action) {
      lines.push(`  Action: ${step.action}`);
      if (step.actionInput) {
        lines.push(`  Input: ${JSON.stringify(step.actionInput)}`);
      }
    }

    if (step.observation) {
      const obs = step.observation.length > 100
        ? step.observation.slice(0, 100) + "..."
        : step.observation;
      lines.push(`  Observation: ${obs}`);
    }

    if (step.reflection) {
      lines.push(`  Reflection: ${step.reflection}`);
    }

    lines.push("");
  }

  if (trace.summary) {
    lines.push(`Summary: ${trace.summary}`);
  }

  return lines.join("\n");
}
