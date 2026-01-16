/**
 * Orchestrator Agent - Multi-agent coordination and task delegation
 *
 * The Orchestrator is the central coordinator for the trading terminal.
 * It decomposes complex user requests into subtasks and delegates them
 * to specialized agents (StrategyBuilder, BacktestAnalyst, SentimentAnalyst).
 *
 * Part of Phase 2: Multi-Agent Foundation
 */

import { randomUUID } from "crypto";
import { BaseAgent, AgentConfig } from "./base-agent.js";
import { StrategyBuilderAgent, createStrategyBuilder } from "./strategy-builder.js";
import { BacktestAnalystAgent, createBacktestAnalyst } from "./backtest-analyst.js";
import { SentimentAnalystAgent, createSentimentAnalyst } from "./sentiment-analyst.js";
import {
  AgentType,
  WorkflowStage,
  AgentResult,
  SubagentTask,
  TaskStatus,
  OrchestratorSession,
  SynthesisRecord,
} from "../core/types.js";

const ORCHESTRATOR_PROMPT = `You are the Orchestrator Agent for the Donut trading terminal - a multi-agent crypto trading system.

## Your Role
You coordinate multiple specialized agents to accomplish complex trading workflows. You decompose user requests into discrete subtasks and delegate them to the appropriate specialist agents.

## Available Subagents
1. **StrategyBuilder** (STRATEGY_BUILDER): Creates and modifies trading strategies
   - Use for: Strategy design, indicator selection, parameter tuning, risk control setup
   - Strengths: Natural language to strategy config, best practices, validation

2. **BacktestAnalyst** (BACKTEST_ANALYST): Runs backtests and analyzes performance
   - Use for: Historical simulation, performance metrics, equity curve analysis
   - Strengths: Comprehensive analysis, statistical significance, actionable insights

3. **SentimentAnalyst** (SENTIMENT_ANALYST): Gathers market sentiment from social sources
   - Use for: Twitter sentiment, Discord monitoring, Telegram channels, community signals
   - Strengths: Real-time sentiment, trend detection, narrative analysis

## Workflow Coordination

### Sequential Workflows (wait for results before proceeding)
- Strategy Creation → Backtest → Analysis → Execution Decision
- Discovery → Multiple Backtests → Compare → Select Best

### Parallel Information Gathering
- Sentiment + Technical Analysis → Combined Trading Decision
- Multiple Asset Analysis → Portfolio Construction

## Task Delegation Guidelines
1. **Decompose Clearly**: Break complex requests into specific, actionable subtasks
2. **Delegate Appropriately**: Match tasks to agent specialties
3. **Synthesize Results**: Combine outputs from multiple agents into coherent insights
4. **Maintain Context**: Pass relevant information between agent calls
5. **Handle Failures**: If an agent fails, explain what went wrong and suggest alternatives

## Available Tools
- spawn_agent: Delegate a task to a subagent
- get_agent_status: Check if a delegated task has completed
- synthesize_results: Combine results from multiple agent tasks
- get_sentiment_data: Fetch market sentiment (via SentimentAnalyst)

## Example Workflows

### "Create a BTC momentum strategy and backtest it"
1. spawn_agent(STRATEGY_BUILDER, "Design a BTC momentum strategy with EMA crossovers")
2. Wait for strategy creation to complete
3. spawn_agent(BACKTEST_ANALYST, "Backtest the newly created strategy for 3 months")
4. synthesize_results([strategy_task, backtest_task])
5. Present combined analysis to user

### "What's the sentiment around ETH right now?"
1. spawn_agent(SENTIMENT_ANALYST, "Get current sentiment for ETH across all sources")
2. Summarize sentiment data with confidence levels

When the user provides a complex request, think about which agents can help and in what order.
Be proactive about gathering context that will help make better decisions.`;

/**
 * Agent registry entry for lazy initialization
 */
interface AgentEntry {
  type: AgentType;
  instance?: BaseAgent;
  factory: (config: AgentConfig) => BaseAgent;
}

/**
 * Orchestrator Agent - Coordinates multiple specialist agents
 */
export class OrchestratorAgent extends BaseAgent {
  private orchestratorSession: OrchestratorSession;
  private agentRegistry: Map<AgentType, AgentEntry>;

  constructor(config: AgentConfig) {
    super(config);

    this.orchestratorSession = {
      activeTasks: [],
      completedTasks: [],
      synthesisHistory: [],
    };

    // Initialize agent registry with lazy factories
    this.agentRegistry = new Map([
      [
        AgentType.STRATEGY_BUILDER,
        {
          type: AgentType.STRATEGY_BUILDER,
          factory: (c) => createStrategyBuilder(c),
        },
      ],
      [
        AgentType.BACKTEST_ANALYST,
        {
          type: AgentType.BACKTEST_ANALYST,
          factory: (c) => createBacktestAnalyst(c),
        },
      ],
      [
        AgentType.SENTIMENT_ANALYST,
        {
          type: AgentType.SENTIMENT_ANALYST,
          factory: (c) => createSentimentAnalyst(c),
        },
      ],
    ]);
  }

  get agentType(): AgentType {
    return AgentType.ORCHESTRATOR;
  }

  get systemPrompt(): string {
    return ORCHESTRATOR_PROMPT;
  }

  get defaultTools(): string[] {
    // Orchestrator has access to delegation tools plus read-only tools from other agents
    return [
      // Orchestrator-specific tools (defined in orchestrator-server.ts)
      "spawn_agent",
      "get_agent_status",
      "synthesize_results",
      "get_sentiment_data",
      // Read-only tools for context gathering
      "strategy_list",
      "strategy_get",
      "backtest_list_runs",
      "backtest_get_metrics",
    ];
  }

  /**
   * Get or create an agent instance from the registry
   */
  private getAgent(agentType: AgentType): BaseAgent {
    const entry = this.agentRegistry.get(agentType);
    if (!entry) {
      throw new Error(`Agent type ${agentType} not found in registry`);
    }

    // Lazy initialization
    if (!entry.instance) {
      entry.instance = entry.factory(this.config);
    }

    return entry.instance;
  }

  /**
   * Check if an agent type is available in the registry
   */
  hasAgent(agentType: AgentType): boolean {
    return this.agentRegistry.has(agentType);
  }

  /**
   * Spawn a subagent to handle a specific task
   *
   * This is the core delegation method. It creates a task record,
   * invokes the subagent's run() method, and tracks the result.
   */
  async spawnAgent(
    agentType: AgentType,
    prompt: string,
    stage: WorkflowStage,
    metadata?: Record<string, unknown>
  ): Promise<SubagentTask> {
    // Create task record
    const task: SubagentTask = {
      taskId: randomUUID(),
      agentType,
      prompt,
      stage,
      status: TaskStatus.PENDING,
      startedAt: new Date().toISOString(),
      metadata,
    };

    this.orchestratorSession.activeTasks.push(task);

    try {
      // Mark as in progress
      task.status = TaskStatus.IN_PROGRESS;

      // Get the agent instance
      const agent = this.getAgent(agentType);

      console.log(`[Orchestrator] Spawning ${agentType} for: "${prompt.slice(0, 50)}..."`);

      // Direct method invocation - blocking call
      const result = await agent.run(prompt, stage);

      // Update task with result
      task.status = result.success ? TaskStatus.COMPLETED : TaskStatus.FAILED;
      task.result = result.result;
      task.error = result.error;
      task.completedAt = new Date().toISOString();

      console.log(`[Orchestrator] ${agentType} completed with status: ${task.status}`);
    } catch (error) {
      // Handle unexpected errors
      task.status = TaskStatus.FAILED;
      task.error = error instanceof Error ? error.message : String(error);
      task.completedAt = new Date().toISOString();

      console.error(`[Orchestrator] ${agentType} failed:`, task.error);
    }

    // Move to completed tasks
    this.orchestratorSession.activeTasks = this.orchestratorSession.activeTasks.filter(
      (t) => t.taskId !== task.taskId
    );
    this.orchestratorSession.completedTasks.push(task);

    return task;
  }

  /**
   * Get status of a specific task by ID
   */
  getTaskStatus(taskId: string): SubagentTask | undefined {
    return [
      ...this.orchestratorSession.activeTasks,
      ...this.orchestratorSession.completedTasks,
    ].find((t) => t.taskId === taskId);
  }

  /**
   * Get all tasks with a specific status
   */
  getTasksByStatus(status: TaskStatus): SubagentTask[] {
    return [
      ...this.orchestratorSession.activeTasks,
      ...this.orchestratorSession.completedTasks,
    ].filter((t) => t.status === status);
  }

  /**
   * Synthesize results from multiple completed tasks
   *
   * Combines the outputs from multiple agent tasks into a unified summary.
   * Only includes completed tasks; failed/pending tasks are noted but not included.
   */
  synthesizeResults(taskIds: string[]): SynthesisRecord {
    const tasks = taskIds
      .map((id) => this.getTaskStatus(id))
      .filter((t): t is SubagentTask => t !== undefined);

    const completedTasks = tasks.filter((t) => t.status === TaskStatus.COMPLETED);
    const failedTasks = tasks.filter((t) => t.status === TaskStatus.FAILED);

    // Build combined result
    let combinedResult = "";

    if (completedTasks.length > 0) {
      combinedResult += "## Completed Task Results\n\n";
      combinedResult += completedTasks
        .map((t) => `### ${t.agentType}\n${t.result || "No result"}`)
        .join("\n\n---\n\n");
    }

    if (failedTasks.length > 0) {
      combinedResult += "\n\n## Failed Tasks\n\n";
      combinedResult += failedTasks
        .map((t) => `- ${t.agentType}: ${t.error || "Unknown error"}`)
        .join("\n");
    }

    if (tasks.length === 0) {
      combinedResult = "No tasks found for the provided IDs.";
    }

    // Create synthesis record
    const record: SynthesisRecord = {
      synthesisId: randomUUID(),
      taskIds,
      combinedResult,
      timestamp: new Date().toISOString(),
    };

    this.orchestratorSession.synthesisHistory.push(record);

    return record;
  }

  /**
   * Get the orchestrator session state (for persistence or inspection)
   */
  getOrchestratorSession(): OrchestratorSession {
    return { ...this.orchestratorSession };
  }

  /**
   * Restore orchestrator session state (from persistence)
   */
  restoreOrchestratorSession(session: OrchestratorSession): void {
    this.orchestratorSession = {
      activeTasks: [...session.activeTasks],
      completedTasks: [...session.completedTasks],
      synthesisHistory: [...session.synthesisHistory],
    };
  }

  /**
   * Clear all tasks and history
   */
  clearSession(): void {
    this.orchestratorSession = {
      activeTasks: [],
      completedTasks: [],
      synthesisHistory: [],
    };
  }

  /**
   * Register a new agent type in the registry
   *
   * Allows dynamic extension with new agent types (e.g., SentimentAnalyst).
   */
  registerAgent(
    agentType: AgentType,
    factory: (config: AgentConfig) => BaseAgent
  ): void {
    this.agentRegistry.set(agentType, {
      type: agentType,
      factory,
    });
  }

  // ============================================================================
  // High-Level Workflow Methods
  // ============================================================================

  /**
   * Execute a full strategy creation and backtest workflow
   */
  async createAndBacktestStrategy(
    requirements: string,
    backtestPeriodDays: number = 90
  ): Promise<AgentResult> {
    const prompt = `Execute a complete strategy workflow:

1. First, spawn the STRATEGY_BUILDER agent to create a strategy based on:
   "${requirements}"

2. Once the strategy is created, spawn the BACKTEST_ANALYST agent to:
   - Run a ${backtestPeriodDays}-day backtest
   - Analyze the results

3. Synthesize the findings and provide:
   - Strategy summary
   - Backtest performance
   - Recommendation (go live or iterate)

Use the spawn_agent tool to delegate to each specialist.`;

    return this.run(prompt, WorkflowStage.DISCOVERY);
  }

  /**
   * Execute a market analysis workflow combining technical and sentiment
   */
  async analyzeMarket(symbols: string[]): Promise<AgentResult> {
    const symbolList = symbols.join(", ");
    const prompt = `Perform comprehensive market analysis for: ${symbolList}

1. Gather sentiment data for each symbol using get_sentiment_data
2. Review any existing strategies and backtests for these symbols
3. Combine technical indicators with sentiment signals
4. Provide trading recommendations with confidence levels

Focus on actionable insights, not just data.`;

    return this.run(prompt, WorkflowStage.DISCOVERY);
  }

  /**
   * Discovery phase - understand user goals and suggest workflows
   */
  async discover(userGoals: string): Promise<AgentResult> {
    const prompt = `Help me understand what the user wants to achieve:

"${userGoals}"

Based on this:
1. Identify the type of task (strategy creation, backtesting, analysis, trading)
2. Determine which specialist agents would be helpful
3. Suggest a workflow with specific steps
4. Ask any clarifying questions if needed

Don't start executing yet - present a plan first.`;

    return this.run(prompt, WorkflowStage.DISCOVERY);
  }
}

/**
 * Create a new Orchestrator agent
 */
export function createOrchestrator(config: AgentConfig): OrchestratorAgent {
  return new OrchestratorAgent(config);
}
