/**
 * Chat Handler with SSE Streaming
 *
 * Integrates Claude Agent SDK with Server-Sent Events for real-time
 * streaming responses to the web UI.
 */

import { ServerResponse } from "http";
import { query, Options } from "@anthropic-ai/claude-agent-sdk";
import { loadConfig, validateApiKeys } from "../core/config.js";
import { AgentType, WorkflowStage, getAllowedTools } from "../core/types.js";
import { createHummingbotMcpServer } from "../mcp-servers/hummingbot-server.js";
import { createDonutAgentsMcpServer } from "../mcp-servers/donut-agents-server.js";
import { createDonutBackendMcpServer } from "../mcp-servers/donut-backend-server.js";
import { WebSessionStore, WebSession } from "./session-store.js";

// ============================================================================
// Types
// ============================================================================

interface AgentMessage {
  type: "system" | "tool_use" | "tool_result" | "result" | "text" | "assistant";
  subtype?: "init" | "success" | "error";
  session_id?: string;
  result?: string;
  tool_name?: string;
  tool_input?: unknown;
  text?: string;
  message?: {
    content?: Array<{ type: string; text?: string }>;
  };
}

export interface ChatRequest {
  sessionId: string;
  message: string;
  agentType?: string;
}

// ============================================================================
// Agent Configuration (mirrored from TUI)
// ============================================================================

const SYSTEM_PROMPTS: Record<string, string> = {
  [AgentType.STRATEGY_BUILDER]: `You are a Strategy Builder assistant for a crypto trading terminal.
Your role is to help users design and configure trading strategies.
Be concise but thorough. Ask clarifying questions when needed.
When you have enough information, summarize the strategy configuration.`,

  [AgentType.BACKTEST_ANALYST]: `You are a Backtest Analyst assistant for a crypto trading terminal.
Your role is to help users run backtests and analyze the results.
Provide clear insights about performance metrics, risk, and potential improvements.
Be data-driven and objective in your analysis.`,

  [AgentType.CHART_ANALYST]: `You are a Chart Analyst assistant for a crypto trading terminal.
Your role is to analyze charts and identify technical patterns.
Explain your analysis clearly and provide actionable insights.`,

  [AgentType.EXECUTION_ASSISTANT]: `You are an Execution Assistant for a crypto trading terminal.
Your role is to help users execute trades safely and efficiently.
Always confirm trade details before execution.`,
};

const AGENT_TOOLS: Record<string, string[]> = {
  [AgentType.STRATEGY_BUILDER]: [
    "hb_strategy_list",
    "hb_strategy_get",
    "hb_strategy_create",
    "hb_market_candles",
    "agents_list_traders",
    "agents_get_analytics",
  ],
  [AgentType.BACKTEST_ANALYST]: [
    "hb_backtest_start",
    "hb_backtest_status",
    "hb_backtest_stop",
    "hb_backtest_metrics",
    "hb_backtest_equity",
    "hb_backtest_trades",
    "hb_backtest_list",
    "agents_get_analytics",
    "agents_get_trades",
  ],
  [AgentType.CHART_ANALYST]: [
    "hb_market_candles",
    "hb_market_prices",
    "solana_get_token_price",
    "solana_get_trending_tokens",
  ],
  [AgentType.EXECUTION_ASSISTANT]: [
    "hb_bot_list",
    "hb_bot_start",
    "hb_bot_stop",
    "agents_control_trader",
    "agents_get_positions",
    "solana_get_swap_quote",
    "solana_execute_swap",
    "solana_get_portfolio",
  ],
};

// Agent display configuration for the UI
export const AGENT_DISPLAY: Record<
  string,
  { emoji: string; name: string; color: string }
> = {
  [AgentType.STRATEGY_BUILDER]: {
    emoji: "📊",
    name: "Strategy Builder",
    color: "#00BFFF",
  },
  [AgentType.BACKTEST_ANALYST]: {
    emoji: "📈",
    name: "Backtest Analyst",
    color: "#FF00FF",
  },
  [AgentType.CHART_ANALYST]: {
    emoji: "📉",
    name: "Chart Analyst",
    color: "#FFFF00",
  },
  [AgentType.EXECUTION_ASSISTANT]: {
    emoji: "⚡",
    name: "Execution Assistant",
    color: "#00FF00",
  },
};

// ============================================================================
// MCP Server Builder
// ============================================================================

type McpServerInstance =
  | ReturnType<typeof createHummingbotMcpServer>
  | ReturnType<typeof createDonutAgentsMcpServer>
  | ReturnType<typeof createDonutBackendMcpServer>;

function buildMcpServers(
  config: ReturnType<typeof loadConfig>
): Record<string, { type: "sdk"; name: string; instance: McpServerInstance }> {
  const servers: Record<
    string,
    { type: "sdk"; name: string; instance: McpServerInstance }
  > = {};

  if (config.donutAgentsUrl) {
    servers["donut-agents"] = {
      type: "sdk",
      name: "donut-agents",
      instance: createDonutAgentsMcpServer({
        baseUrl: config.donutAgentsUrl,
        authToken: config.donutAgentsAuthToken,
      }),
    };
  }

  if (config.donutBackendUrl) {
    servers["donut-backend"] = {
      type: "sdk",
      name: "donut-backend",
      instance: createDonutBackendMcpServer({
        baseUrl: config.donutBackendUrl,
        authToken: config.donutBackendAuthToken,
      }),
    };
  }

  if (config.hummingbotUrl) {
    servers["hummingbot"] = {
      type: "sdk",
      name: "hummingbot",
      instance: createHummingbotMcpServer({
        baseUrl: config.hummingbotUrl,
        username: config.hummingbotUsername,
        password: config.hummingbotPassword,
      }),
    };
  }

  return servers;
}

// ============================================================================
// SSE Helpers
// ============================================================================

function sseWrite(
  res: ServerResponse,
  event: string,
  data: Record<string, unknown>
): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// ============================================================================
// Chat Handler
// ============================================================================

export class ChatHandler {
  private sessionStore: WebSessionStore;
  private config: ReturnType<typeof loadConfig> | null = null;
  private configError: string | null = null;

  constructor(sessionStore: WebSessionStore) {
    this.sessionStore = sessionStore;
    this.initConfig();
  }

  private initConfig(): void {
    try {
      this.config = loadConfig();
      validateApiKeys(this.config);
    } catch (error) {
      this.configError =
        error instanceof Error ? error.message : "Failed to load config";
      console.warn("Chat disabled:", this.configError);
    }
  }

  /**
   * Check if chat is available
   */
  isAvailable(): boolean {
    return this.config !== null && this.configError === null;
  }

  /**
   * Get the reason chat is unavailable
   */
  getUnavailableReason(): string | null {
    return this.configError;
  }

  /**
   * Stream a chat response via SSE
   */
  async streamChat(
    res: ServerResponse,
    request: ChatRequest
  ): Promise<void> {
    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.flushHeaders();

    // Check if chat is available
    if (!this.config) {
      sseWrite(res, "error", {
        message: this.configError || "Chat not available",
      });
      sseWrite(res, "done", {});
      res.end();
      return;
    }

    // Get or create session
    let session: WebSession | null = null;
    if (request.sessionId) {
      session = await this.sessionStore.getSession(request.sessionId);
    }

    if (!session) {
      session = await this.sessionStore.createSession();
    }

    // Send init event with session info
    sseWrite(res, "system", {
      type: "init",
      sessionId: session.sessionId,
    });

    // Save user message
    await this.sessionStore.addMessage(session.sessionId, {
      role: "user",
      content: request.message,
    });

    // Determine agent type
    const agentType = (request.agentType ||
      session.currentAgentType ||
      AgentType.STRATEGY_BUILDER) as AgentType;
    const agentDisplay = AGENT_DISPLAY[agentType] || AGENT_DISPLAY[AgentType.STRATEGY_BUILDER];

    // Send agent start event
    sseWrite(res, "system", {
      type: "agent_start",
      agentType,
      display: agentDisplay,
    });

    // Prepare agent options
    const systemPrompt = SYSTEM_PROMPTS[agentType] || SYSTEM_PROMPTS[AgentType.STRATEGY_BUILDER];
    const tools = AGENT_TOOLS[agentType] || [];
    const stageTools = getAllowedTools(WorkflowStage.STRATEGY_BUILD, "all");
    const allowedTools = tools.filter((t) => stageTools.includes(t));

    const options: Options = {
      mcpServers: buildMcpServers(
        this.config
      ) as unknown as Options["mcpServers"],
      allowedTools,
      maxTurns: this.config.maxTurns,
      systemPrompt,
    };

    // Resume from previous agent session if available
    if (session.agentSessionId) {
      options.resume = session.agentSessionId;
    }

    let fullResponse = "";
    let newAgentSessionId: string | undefined;
    const toolUses: Array<{
      toolName: string;
      status: "pending" | "success" | "error";
      input?: unknown;
      output?: unknown;
    }> = [];

    try {
      // Stream agent response
      for await (const message of query({
        prompt: request.message,
        options,
      }) as AsyncIterable<AgentMessage>) {
        switch (message.type) {
          case "system":
            if (message.subtype === "init" && message.session_id) {
              newAgentSessionId = message.session_id;
            }
            break;

          case "text":
            if (message.text) {
              sseWrite(res, "text", { text: message.text });
              fullResponse += message.text;
            }
            break;

          case "assistant":
            if (message.message?.content) {
              for (const block of message.message.content) {
                if (block.type === "text" && block.text) {
                  sseWrite(res, "text", { text: block.text });
                  fullResponse += block.text;
                }
              }
            }
            break;

          case "tool_use":
            if (message.tool_name) {
              sseWrite(res, "tool_use", {
                toolName: message.tool_name,
                toolInput: message.tool_input,
                status: "pending",
              });
              toolUses.push({
                toolName: message.tool_name,
                status: "pending",
                input: message.tool_input,
              });
            }
            break;

          case "tool_result":
            // Update last tool use status
            if (toolUses.length > 0) {
              const lastTool = toolUses[toolUses.length - 1];
              lastTool.status = "success";
              sseWrite(res, "tool_use", {
                toolName: lastTool.toolName,
                status: "success",
              });
            }
            break;

          case "result":
            if (message.subtype === "error") {
              sseWrite(res, "error", {
                message: message.result || "Unknown error",
              });
              // Update last tool as error if applicable
              if (toolUses.length > 0) {
                toolUses[toolUses.length - 1].status = "error";
              }
            }
            break;
        }
      }

      // Save assistant response
      await this.sessionStore.addMessage(session.sessionId, {
        role: "assistant",
        content: fullResponse,
        agentType,
        toolUse: toolUses.length > 0 ? toolUses : undefined,
      });

      // Update agent session ID if we got a new one
      if (newAgentSessionId) {
        await this.sessionStore.updateAgentSession(
          session.sessionId,
          newAgentSessionId,
          agentType
        );
      }

      // Send completion event
      sseWrite(res, "system", { type: "agent_end" });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error occurred";
      sseWrite(res, "error", { message });
    }

    // End stream
    sseWrite(res, "done", {});
    res.end();
  }
}
