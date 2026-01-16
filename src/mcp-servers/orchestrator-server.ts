/**
 * Orchestrator MCP Server - Exposes multi-agent coordination tools to Claude Agent SDK
 *
 * Provides tools for:
 * - Spawning subagents (spawn_agent)
 * - Checking task status (get_agent_status)
 * - Synthesizing results from multiple agents (synthesize_results)
 *
 * Part of Phase 2: Multi-Agent Foundation
 */

import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import {
  AgentType,
  WorkflowStage,
  TaskStatus,
  SubagentTask,
  SynthesisRecord,
} from "../core/types.js";
import { OrchestratorAgent } from "../agents/orchestrator-agent.js";
import { AgentConfig } from "../agents/base-agent.js";

// Global orchestrator instance (initialized when server is created)
let orchestratorInstance: OrchestratorAgent | null = null;

/**
 * Initialize the orchestrator with config
 */
export function initializeOrchestrator(config: AgentConfig): OrchestratorAgent {
  orchestratorInstance = new OrchestratorAgent(config);
  return orchestratorInstance;
}

/**
 * Get the orchestrator instance, throwing if not initialized
 */
function getOrchestrator(): OrchestratorAgent {
  if (!orchestratorInstance) {
    throw new Error(
      "Orchestrator not initialized. Call initializeOrchestrator first."
    );
  }
  return orchestratorInstance;
}

/**
 * Set an existing orchestrator instance (for integration with external initialization)
 */
export function setOrchestratorInstance(orchestrator: OrchestratorAgent): void {
  orchestratorInstance = orchestrator;
}

// ============================================================================
// Tool Definitions
// ============================================================================

/**
 * Spawn a subagent to handle a specific task
 */
export const spawnAgentTool = tool(
  "spawn_agent",
  `Spawn a subagent to handle a specific task. Returns a task ID for tracking.

Available agents:
- STRATEGY_BUILDER: Create trading strategies, select indicators, configure risk controls
- BACKTEST_ANALYST: Run backtests, analyze performance metrics, compare strategies
- SENTIMENT_ANALYST: Gather sentiment from Twitter, Discord, Telegram (when available)

The subagent will execute the prompt and return results when complete.`,
  {
    agentType: z
      .nativeEnum(AgentType)
      .describe("Type of agent to spawn"),
    prompt: z
      .string()
      .min(1)
      .describe("Task-specific prompt for the agent to execute"),
    stage: z
      .nativeEnum(WorkflowStage)
      .default(WorkflowStage.DISCOVERY)
      .describe("Workflow stage context for tool permissions"),
    metadata: z
      .record(z.unknown())
      .optional()
      .describe("Optional metadata to attach to the task"),
  },
  async (args) => {
    const orchestrator = getOrchestrator();

    // Validate agent type is available
    if (!orchestrator.hasAgent(args.agentType)) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: false,
                error: `Agent type ${args.agentType} is not available. Available agents: STRATEGY_BUILDER, BACKTEST_ANALYST`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    try {
      const task = await orchestrator.spawnAgent(
        args.agentType,
        args.prompt,
        args.stage,
        args.metadata
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: true,
                taskId: task.taskId,
                agentType: task.agentType,
                status: task.status,
                result: task.result,
                error: task.error,
                startedAt: task.startedAt,
                completedAt: task.completedAt,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: false,
                error: error instanceof Error ? error.message : String(error),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }
);

/**
 * Get the status of a spawned agent task
 */
export const getAgentStatusTool = tool(
  "get_agent_status",
  `Check the status of a spawned agent task by task ID.

Returns the task status (PENDING, IN_PROGRESS, COMPLETED, FAILED, CANCELLED),
result if completed, and error if failed.`,
  {
    taskId: z.string().uuid().describe("Task ID returned from spawn_agent"),
  },
  async (args) => {
    const orchestrator = getOrchestrator();
    const task = orchestrator.getTaskStatus(args.taskId);

    if (!task) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: false,
                error: `Task ${args.taskId} not found`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              success: true,
              taskId: task.taskId,
              agentType: task.agentType,
              status: task.status,
              stage: task.stage,
              result: task.result,
              error: task.error,
              startedAt: task.startedAt,
              completedAt: task.completedAt,
              metadata: task.metadata,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

/**
 * Synthesize results from multiple completed agent tasks
 */
export const synthesizeResultsTool = tool(
  "synthesize_results",
  `Combine results from multiple completed agent tasks into a unified summary.

Use this after spawning multiple agents to get a consolidated view of their findings.
Only completed tasks will have their results included; failed tasks will be noted.`,
  {
    taskIds: z
      .array(z.string().uuid())
      .min(1)
      .describe("Array of task IDs to synthesize"),
  },
  async (args) => {
    const orchestrator = getOrchestrator();

    try {
      const synthesis = orchestrator.synthesizeResults(args.taskIds);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: true,
                synthesisId: synthesis.synthesisId,
                taskCount: args.taskIds.length,
                combinedResult: synthesis.combinedResult,
                timestamp: synthesis.timestamp,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: false,
                error: error instanceof Error ? error.message : String(error),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }
);

/**
 * List all tasks with optional status filter
 */
export const listTasksTool = tool(
  "list_tasks",
  `List all orchestrator tasks with optional status filtering.

Useful for reviewing what agents have been spawned and their outcomes.`,
  {
    status: z
      .nativeEnum(TaskStatus)
      .optional()
      .describe("Filter by task status (optional)"),
    limit: z
      .number()
      .int()
      .positive()
      .default(20)
      .describe("Maximum number of tasks to return"),
  },
  async (args) => {
    const orchestrator = getOrchestrator();
    const session = orchestrator.getOrchestratorSession();

    let tasks = [...session.activeTasks, ...session.completedTasks];

    // Filter by status if specified
    if (args.status) {
      tasks = tasks.filter((t) => t.status === args.status);
    }

    // Sort by start time (most recent first) and limit
    tasks = tasks
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .slice(0, args.limit);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              success: true,
              taskCount: tasks.length,
              tasks: tasks.map((t) => ({
                taskId: t.taskId,
                agentType: t.agentType,
                status: t.status,
                stage: t.stage,
                promptPreview: t.prompt.slice(0, 100) + (t.prompt.length > 100 ? "..." : ""),
                startedAt: t.startedAt,
                completedAt: t.completedAt,
                hasResult: !!t.result,
                hasError: !!t.error,
              })),
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ============================================================================
// MCP Server Factory
// ============================================================================

/**
 * Create the Orchestrator MCP server
 *
 * Note: initializeOrchestrator must be called before using the server,
 * or setOrchestratorInstance must be used to provide an existing instance.
 */
export function createOrchestratorMcpServer() {
  return createSdkMcpServer({
    name: "orchestrator",
    version: "0.1.0",
    tools: [
      spawnAgentTool,
      getAgentStatusTool,
      synthesizeResultsTool,
      listTasksTool,
    ],
  });
}

/**
 * All orchestrator tool names
 */
export const ORCHESTRATOR_TOOLS = [
  "spawn_agent",
  "get_agent_status",
  "synthesize_results",
  "list_tasks",
] as const;

/**
 * Read-only orchestrator tools
 */
export const ORCHESTRATOR_READ_TOOLS = [
  "get_agent_status",
  "list_tasks",
] as const;

/**
 * Write orchestrator tools (can modify state)
 */
export const ORCHESTRATOR_WRITE_TOOLS = [
  "spawn_agent",
  "synthesize_results",
] as const;
