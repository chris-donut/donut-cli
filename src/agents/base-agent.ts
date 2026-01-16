/**
 * Base Agent Class - Core agent functionality with session management
 *
 * This implements the multi-stage workflow pattern from primodium/trading-agent
 * with session continuity via the `resume` parameter.
 */

import { query, Options } from "@anthropic-ai/claude-agent-sdk";
import {
  AgentType,
  WorkflowStage,
  AgentResult,
  TerminalConfig,
  getAllowedTools,
} from "../core/types.js";
import { SessionManager } from "../core/session.js";
import { createNofxMcpServer } from "../mcp-servers/nofx-server.js";
import { createHummingbotMcpServer } from "../mcp-servers/hummingbot-server.js";

export interface AgentConfig {
  terminalConfig: TerminalConfig;
  sessionManager: SessionManager;
}

export interface McpServerConfig {
  type: "sdk";
  name: string;
  instance: ReturnType<typeof createNofxMcpServer>;
}

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

/**
 * Base class for all trading terminal agents
 *
 * Provides:
 * - Session management with resume capability
 * - MCP server integration
 * - Tool filtering by workflow stage
 * - Streaming message processing
 */
export abstract class BaseAgent {
  protected config: AgentConfig;
  protected sessionManager: SessionManager;
  protected sessionId?: string;

  constructor(config: AgentConfig) {
    this.config = config;
    this.sessionManager = config.sessionManager;
  }

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
   */
  abstract get defaultTools(): string[];

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
      mcpServers: this.getMcpServers(),
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
   * Get MCP server configurations
   * Supports multiple backends: Hummingbot (preferred) or nofx (fallback)
   * Override in subclasses to add more servers
   */
  protected getMcpServers(): Record<string, McpServerConfig> {
    const { terminalConfig } = this.config;
    const servers: Record<string, McpServerConfig> = {};

    // Prefer Hummingbot if configured
    if (terminalConfig.hummingbotUrl) {
      servers["hummingbot"] = {
        type: "sdk",
        name: "hummingbot",
        instance: createHummingbotMcpServer({
          baseUrl: terminalConfig.hummingbotUrl,
        }),
      };
    }
    // Fall back to nofx if configured
    else if (terminalConfig.nofxApiUrl) {
      servers["nofx-backtest"] = {
        type: "sdk",
        name: "nofx-backtest",
        instance: createNofxMcpServer({
          baseUrl: terminalConfig.nofxApiUrl,
          authToken: terminalConfig.nofxAuthToken,
        }),
      };
    }

    return servers;
  }

  /**
   * Check which backend is configured
   */
  protected getBackendType(): "hummingbot" | "nofx" | "none" {
    const { terminalConfig } = this.config;
    if (terminalConfig.hummingbotUrl) return "hummingbot";
    if (terminalConfig.nofxApiUrl) return "nofx";
    return "none";
  }

  /**
   * Run the agent with a prompt in a specific workflow stage
   */
  async run(prompt: string, stage: WorkflowStage): Promise<AgentResult> {
    // Check for existing session to resume
    const existingSessionId = this.sessionManager.getAgentSession(this.agentType);
    if (existingSessionId) {
      this.sessionId = existingSessionId;
    }

    const options = this.buildOptions(stage);
    let result = "";
    let success = true;
    let errorMessage: string | undefined;

    try {
      // Process streaming messages from the agent
      for await (const message of query({ prompt, options }) as AsyncIterable<AgentMessage>) {
        await this.processMessage(message);

        // Capture session ID from init message
        if (message.type === "system" && message.subtype === "init" && message.session_id) {
          this.sessionId = message.session_id;
          await this.sessionManager.updateAgentSession(this.agentType, this.sessionId);
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
    }

    return {
      agentType: this.agentType,
      stage,
      success,
      result,
      sessionId: this.sessionId,
      timestamp: new Date(),
      error: errorMessage,
    };
  }

  /**
   * Process a message from the agent stream
   * Override in subclasses to add custom handling
   */
  protected async processMessage(message: AgentMessage): Promise<void> {
    // Log tool usage for debugging
    if (message.type === "tool_use") {
      console.log(`  [${this.agentType}] Using tool: ${message.tool_name}`);
    }

    // Log text responses
    if (message.type === "text" && message.text) {
      // Stream text to console (or could be piped elsewhere)
      process.stdout.write(message.text);
    }
  }

  /**
   * Reset the agent session (start fresh)
   */
  resetSession(): void {
    this.sessionId = undefined;
  }

  /**
   * Get the current session ID
   */
  getSessionId(): string | undefined {
    return this.sessionId;
  }
}

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
