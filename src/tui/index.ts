/**
 * Interactive TUI - Main entry point
 *
 * A Claude Code-like interactive terminal experience for
 * interacting with Donut CLI agents.
 */

import readline from "readline";
import { query, Options } from "@anthropic-ai/claude-agent-sdk";
import { loadConfig, validateApiKeys } from "../core/config.js";
import { SessionManager } from "../core/session.js";
import { AgentType, WorkflowStage, getAllowedTools } from "../core/types.js";
import { createHummingbotMcpServer } from "../mcp-servers/hummingbot-server.js";
import { createDonutAgentsMcpServer } from "../mcp-servers/donut-agents-server.js";
import { createDonutBackendMcpServer } from "../mcp-servers/donut-backend-server.js";

import { INTERACTIVE_BANNER, PROMPT, MUTED, SUCCESS, ERROR } from "./theme.js";
import { parseInput, getCommand, CommandResult } from "./commands.js";
import {
  displayUserMessage,
  displayAgentStart,
  displayAgentEnd,
  displayError,
  displayHelp,
  displayGoodbye,
  clearScreen,
  displaySessionStatus,
  displaySessionsList,
  displayInfo,
  streamText,
  displayToolUse,
  SessionStatusInfo,
  SessionListItem,
} from "./display.js";

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

interface TuiState {
  sessionManager: SessionManager;
  config: ReturnType<typeof loadConfig>;
  currentAgent?: AgentType;
  agentSessionId?: string;
}

// ============================================================================
// Agent System Prompts
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

// ============================================================================
// Agent Default Tools
// ============================================================================

const AGENT_TOOLS: Record<string, string[]> = {
  [AgentType.STRATEGY_BUILDER]: [
    // Hummingbot strategy tools
    "hb_strategy_list",
    "hb_strategy_get",
    "hb_strategy_create",
    "hb_market_candles",
    // Donut Agents tools
    "agents_list_traders",
    "agents_get_analytics",
  ],
  [AgentType.BACKTEST_ANALYST]: [
    // Hummingbot backtest tools
    "hb_backtest_start",
    "hb_backtest_status",
    "hb_backtest_stop",
    "hb_backtest_metrics",
    "hb_backtest_equity",
    "hb_backtest_trades",
    "hb_backtest_list",
    // Donut Agents analytics
    "agents_get_analytics",
    "agents_get_trades",
  ],
  [AgentType.CHART_ANALYST]: [
    // Hummingbot market data
    "hb_market_candles",
    "hb_market_prices",
    // Solana token prices
    "solana_get_token_price",
    "solana_get_trending_tokens",
  ],
  [AgentType.EXECUTION_ASSISTANT]: [
    // Hummingbot bot control
    "hb_bot_list",
    "hb_bot_start",
    "hb_bot_stop",
    // Donut Agents trader control
    "agents_control_trader",
    "agents_get_positions",
    // Solana swap execution
    "solana_get_swap_quote",
    "solana_execute_swap",
    "solana_get_portfolio",
  ],
};

// ============================================================================
// REPL Implementation
// ============================================================================

/**
 * Create a promise-based readline question
 */
function askQuestion(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

/**
 * MCP Server instance type union
 */
type McpServerInstance =
  | ReturnType<typeof createHummingbotMcpServer>
  | ReturnType<typeof createDonutAgentsMcpServer>
  | ReturnType<typeof createDonutBackendMcpServer>;

/**
 * Build MCP server configuration based on available backends
 */
function buildMcpServers(config: ReturnType<typeof loadConfig>): Record<string, {
  type: "sdk";
  name: string;
  instance: McpServerInstance;
}> {
  const servers: Record<string, {
    type: "sdk";
    name: string;
    instance: McpServerInstance;
  }> = {};

  // Donut Agents Backend (AI trading agents - port 8080)
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

  // Donut Backend (Solana DeFi - port 3000)
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

  // Hummingbot API (multi-exchange trading - port 8000)
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

/**
 * Run an agent with a prompt and stream the response
 */
async function runAgent(
  state: TuiState,
  agentType: AgentType,
  prompt: string
): Promise<{ success: boolean; sessionId?: string }> {
  const systemPrompt = SYSTEM_PROMPTS[agentType];
  const tools = AGENT_TOOLS[agentType] || [];

  // Get allowed tools for the current stage
  const stageTools = getAllowedTools(
    state.sessionManager.getState()?.currentStage || "STRATEGY_BUILD",
    "all"
  );

  const allowedTools = tools.filter((t) => stageTools.includes(t));

  const options: Options = {
    // Type assertion needed due to SDK version mismatch
    mcpServers: buildMcpServers(state.config) as unknown as Options["mcpServers"],
    allowedTools,
    maxTurns: state.config.maxTurns,
    systemPrompt,
  };

  // Resume from previous session if available
  if (state.agentSessionId) {
    options.resume = state.agentSessionId;
  }

  displayAgentStart(agentType);

  let success = true;
  let newSessionId: string | undefined;

  try {
    for await (const message of query({ prompt, options }) as AsyncIterable<AgentMessage>) {
      // Handle different message types
      switch (message.type) {
        case "system":
          if (message.subtype === "init" && message.session_id) {
            newSessionId = message.session_id;
          }
          break;

        case "text":
          if (message.text) {
            streamText(message.text);
          }
          break;

        case "assistant":
          // Handle assistant messages with content array
          if (message.message?.content) {
            for (const block of message.message.content) {
              if (block.type === "text" && block.text) {
                streamText(block.text);
              }
            }
          }
          break;

        case "tool_use":
          if (message.tool_name) {
            displayToolUse(message.tool_name);
          }
          break;

        case "result":
          if (message.subtype === "error") {
            success = false;
            if (message.result) {
              displayError(message.result);
            }
          }
          break;
      }
    }
  } catch (error) {
    success = false;
    displayError(error instanceof Error ? error.message : String(error));
  }

  displayAgentEnd();

  return { success, sessionId: newSessionId };
}

/**
 * Handle direct commands (not agent-related)
 */
async function handleDirectCommand(
  state: TuiState,
  command: string
): Promise<void> {
  switch (command) {
    case "help":
      displayHelp();
      break;

    case "clear":
      clearScreen();
      console.log(INTERACTIVE_BANNER);
      break;

    case "status": {
      const sessionState = state.sessionManager.getState();
      if (!sessionState) {
        displayInfo("No active session. Start one with: donut start");
        return;
      }

      const statusInfo: SessionStatusInfo = {
        sessionId: sessionState.sessionId,
        stage: sessionState.currentStage,
        createdAt: sessionState.createdAt,
        updatedAt: sessionState.updatedAt,
        strategyName: sessionState.activeStrategy?.name,
        backtestRunId: sessionState.activeBacktestRunId || undefined,
        pendingTrades: sessionState.pendingTrades.length,
      };
      displaySessionStatus(statusInfo);
      break;
    }

    case "sessions": {
      const sessions = await state.sessionManager.listSessions();
      const items: SessionListItem[] = sessions.map((id) => ({
        id,
        stage: "Unknown",
        createdAt: new Date(),
      }));
      displaySessionsList(items);
      break;
    }

    default:
      if (command.startsWith("resume:")) {
        const sessionId = command.slice(7);
        try {
          await state.sessionManager.loadSession(sessionId);
          displayInfo(`Resumed session: ${sessionId}`);
        } catch {
          displayError(`Failed to resume session: ${sessionId}`);
        }
      } else {
        displayInfo(`Unknown command: ${command}`);
      }
  }
}

/**
 * Process user input and return whether to continue
 */
async function processInput(
  state: TuiState,
  input: string
): Promise<boolean> {
  const trimmed = input.trim();

  if (!trimmed) {
    return true; // Continue on empty input
  }

  const { isCommand, command, args } = parseInput(trimmed);

  if (isCommand) {
    const cmd = getCommand(command);

    if (!cmd) {
      displayError(`Unknown command: /${command}`);
      displayInfo("Type /help to see available commands.");
      return true;
    }

    const result: CommandResult = await cmd.handler(args);

    if (!result.continue) {
      return false; // Exit the loop
    }

    switch (result.action) {
      case "agent":
        if (result.agentType && result.prompt) {
          displayUserMessage(trimmed);
          // Map string agent type to enum
          const agentTypeMap: Record<string, AgentType> = {
            "STRATEGY_BUILDER": AgentType.STRATEGY_BUILDER,
            "BACKTEST_ANALYST": AgentType.BACKTEST_ANALYST,
            "CHART_ANALYST": AgentType.CHART_ANALYST,
            "EXECUTION_ASSISTANT": AgentType.EXECUTION_ASSISTANT,
          };
          const agentType = agentTypeMap[result.agentType] || AgentType.STRATEGY_BUILDER;
          state.currentAgent = agentType;
          const { sessionId } = await runAgent(state, agentType, result.prompt);
          if (sessionId) {
            state.agentSessionId = sessionId;
          }
        }
        break;

      case "direct":
        if (result.message) {
          await handleDirectCommand(state, result.message);
        }
        break;

      case "none":
        if (result.message) {
          console.log(result.message);
        }
        break;

      case "exit":
        return false;
    }
  } else {
    // Regular message - send to current agent or default
    displayUserMessage(trimmed);

    const agentType = state.currentAgent || AgentType.STRATEGY_BUILDER;
    const { sessionId } = await runAgent(state, agentType, trimmed);

    if (sessionId) {
      state.agentSessionId = sessionId;
    }
  }

  return true;
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Start the interactive TUI mode
 */
export async function startInteractiveMode(): Promise<void> {
  // Display banner
  console.log(INTERACTIVE_BANNER);

  // Initialize
  let config;
  try {
    config = loadConfig();
    validateApiKeys(config);
  } catch (error) {
    displayError(error instanceof Error ? error.message : "Failed to load config");
    displayInfo("Make sure ANTHROPIC_API_KEY is set in your environment.");
    process.exit(1);
  }

  const sessionManager = new SessionManager(config.sessionDir);

  // Try to load most recent session
  try {
    const sessions = await sessionManager.listSessions();
    if (sessions.length > 0) {
      await sessionManager.loadSession(sessions[sessions.length - 1]);
      displayInfo(`Resumed session: ${sessions[sessions.length - 1].slice(0, 8)}...`);
    } else {
      await sessionManager.createSession();
      displayInfo("New session created.");
    }
  } catch {
    await sessionManager.createSession();
  }

  // Show backend status
  const backends: string[] = [];
  if (config.donutAgentsUrl) {
    backends.push(`Agents (${config.donutAgentsUrl})`);
  }
  if (config.donutBackendUrl) {
    backends.push(`Solana (${config.donutBackendUrl})`);
  }
  if (config.hummingbotUrl) {
    backends.push(`Hummingbot (${config.hummingbotUrl})`);
  }

  if (backends.length > 0) {
    displayInfo(`Backends: ${backends.join(", ")}`);
  } else {
    displayInfo("No backends configured - some features may be limited");
  }

  console.log();

  // Create state
  const state: TuiState = {
    sessionManager,
    config,
  };

  // Create readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  // Handle Ctrl+C gracefully
  rl.on("SIGINT", () => {
    displayGoodbye();
    rl.close();
    process.exit(0);
  });

  // Main REPL loop
  let running = true;
  while (running) {
    try {
      const input = await askQuestion(rl, PROMPT);
      running = await processInput(state, input);
    } catch (error) {
      // Handle readline close (Ctrl+D)
      if ((error as NodeJS.ErrnoException).code === "ERR_USE_AFTER_CLOSE") {
        break;
      }
      displayError(error instanceof Error ? error.message : String(error));
    }
  }

  displayGoodbye();
  rl.close();
}

// Export for use in main CLI
export { startInteractiveMode as default };
