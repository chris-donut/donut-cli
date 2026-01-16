/**
 * Default Provider Implementations
 *
 * Concrete implementations of the dependency interfaces.
 * These wrap existing functionality while enabling DI patterns.
 */

import { AgentType, TerminalConfig, ToolExecutionContext } from "./types.js";
import {
  BackendType,
  McpServerConfig,
  McpServerProvider,
  RiskCheckResult,
  RiskManager,
  SessionProvider,
} from "./dependencies.js";
import { SessionManager } from "./session.js";
import { getRiskManager as getGlobalRiskManager } from "../hooks/risk-hook.js";
import { createNofxMcpServer, BACKTEST_TOOLS, BACKTEST_READ_TOOLS } from "../mcp-servers/nofx-server.js";
import { createHummingbotMcpServer, HB_BACKTEST_TOOLS, HB_READ_TOOLS } from "../mcp-servers/hummingbot-server.js";
import { getHummingbotClient, getNofxClient } from "../integrations/client-factory.js";

// ============================================================================
// Risk Manager Adapter
// ============================================================================

/**
 * Adapter that wraps the existing RiskManager class to implement the interface
 */
export class RiskManagerAdapter implements RiskManager {
  private manager: ReturnType<typeof getGlobalRiskManager>;

  constructor(manager?: ReturnType<typeof getGlobalRiskManager>) {
    this.manager = manager ?? getGlobalRiskManager();
  }

  async preToolUseHook(context: ToolExecutionContext): Promise<RiskCheckResult> {
    return this.manager.preToolUseHook(context);
  }

  async postToolUseHook(
    context: ToolExecutionContext,
    result: unknown
  ): Promise<void> {
    await this.manager.postToolUseHook(context, result);
  }
}

// ============================================================================
// Session Provider Adapter
// ============================================================================

/**
 * Adapter that wraps SessionManager to implement SessionProvider interface
 */
export class SessionManagerAdapter implements SessionProvider {
  private sessionManager: SessionManager;

  constructor(sessionManager: SessionManager) {
    this.sessionManager = sessionManager;
  }

  getAgentSession(agentType: AgentType): string | undefined {
    return this.sessionManager.getAgentSession(agentType);
  }

  async updateAgentSession(agentType: AgentType, sessionId: string): Promise<void> {
    await this.sessionManager.updateAgentSession(agentType, sessionId);
  }

  getSessionData(): Record<string, unknown> {
    return this.sessionManager.getState() as unknown as Record<string, unknown>;
  }
}

// ============================================================================
// MCP Server Provider Implementation
// ============================================================================

/**
 * Default MCP server provider that creates servers based on terminal config
 */
export class DefaultMcpServerProvider implements McpServerProvider {
  private config: TerminalConfig;
  private cachedServers?: Record<string, McpServerConfig>;

  constructor(config: TerminalConfig) {
    this.config = config;
  }

  getBackendType(): BackendType {
    if (this.config.hummingbotUrl) return "hummingbot";
    if (this.config.nofxApiUrl) return "nofx";
    return "none";
  }

  getMcpServers(): Record<string, McpServerConfig> {
    // Cache MCP servers to avoid recreating them
    if (this.cachedServers) {
      return this.cachedServers;
    }

    const servers: Record<string, McpServerConfig> = {};

    // Prefer Hummingbot if configured
    if (this.config.hummingbotUrl) {
      servers["hummingbot"] = {
        type: "sdk",
        name: "hummingbot",
        instance: createHummingbotMcpServer({
          baseUrl: this.config.hummingbotUrl,
        }),
      };
    }
    // Fall back to nofx if configured
    else if (this.config.nofxApiUrl) {
      servers["nofx-backtest"] = {
        type: "sdk",
        name: "nofx-backtest",
        instance: createNofxMcpServer({
          baseUrl: this.config.nofxApiUrl,
          authToken: this.config.nofxAuthToken,
        }),
      };
    }

    this.cachedServers = servers;
    return servers;
  }

  getDefaultTools(agentType: AgentType): string[] {
    const backend = this.getBackendType();

    switch (agentType) {
      case AgentType.STRATEGY_BUILDER:
        return this.getStrategyBuilderTools(backend);

      case AgentType.BACKTEST_ANALYST:
        return this.getBacktestAnalystTools(backend);

      case AgentType.CHART_ANALYST:
        return this.getChartAnalystTools(backend);

      case AgentType.EXECUTION_ASSISTANT:
        return this.getExecutionAssistantTools(backend);

      case AgentType.ORCHESTRATOR:
        return this.getOrchestratorTools(backend);

      default:
        return [];
    }
  }

  private getStrategyBuilderTools(backend: BackendType): string[] {
    const strategyTools = [
      "strategy_list",
      "strategy_get",
      "strategy_create",
      "strategy_validate",
      "strategy_preview_prompt",
      "strategy_update",
    ];

    if (backend === "hummingbot") {
      return [
        ...strategyTools,
        "hb_strategy_list",
        "hb_strategy_get",
        "hb_strategy_create",
        ...HB_READ_TOOLS,
      ];
    }

    return [...strategyTools, ...BACKTEST_READ_TOOLS];
  }

  private getBacktestAnalystTools(backend: BackendType): string[] {
    if (backend === "hummingbot") {
      return [...HB_BACKTEST_TOOLS];
    }
    return [...BACKTEST_TOOLS];
  }

  private getChartAnalystTools(backend: BackendType): string[] {
    // Chart analyst primarily uses market data tools
    if (backend === "hummingbot") {
      return [
        "hb_market_candles",
        "hb_market_trades",
        "hb_market_orderbook",
        ...HB_READ_TOOLS,
      ];
    }
    return [...BACKTEST_READ_TOOLS];
  }

  private getExecutionAssistantTools(backend: BackendType): string[] {
    // Execution assistant needs bot control and trading tools
    if (backend === "hummingbot") {
      return [
        "hb_bot_list",
        "hb_bot_start",
        "hb_bot_stop",
        "hb_bot_status",
        "hb_market_candles",
        ...HB_READ_TOOLS,
      ];
    }
    return [...BACKTEST_READ_TOOLS];
  }

  private getOrchestratorTools(backend: BackendType): string[] {
    // Orchestrator has access to all read tools for coordination
    if (backend === "hummingbot") {
      return [...HB_READ_TOOLS, ...HB_BACKTEST_TOOLS.filter(t => !t.includes("start"))];
    }
    return [...BACKTEST_READ_TOOLS];
  }

  async healthCheck(): Promise<boolean> {
    const backend = this.getBackendType();

    try {
      if (backend === "hummingbot") {
        const client = getHummingbotClient(this.config);
        return await client.healthCheck();
      }
      if (backend === "nofx") {
        const client = getNofxClient(this.config);
        return await client.healthCheck();
      }
      return false;
    } catch {
      return false;
    }
  }
}

// ============================================================================
// Dependency Container Factory
// ============================================================================

import { AgentDependencies, ConsoleLogger, Logger } from "./dependencies.js";

/**
 * Create default dependencies from terminal config and session manager
 */
export function createDefaultDependencies(
  config: TerminalConfig,
  sessionManager: SessionManager,
  overrides?: Partial<AgentDependencies>
): AgentDependencies {
  return {
    logger: overrides?.logger ?? new ConsoleLogger({ source: "agent" }),
    riskManager: overrides?.riskManager ?? new RiskManagerAdapter(),
    mcpProvider: overrides?.mcpProvider ?? new DefaultMcpServerProvider(config),
    sessionProvider: overrides?.sessionProvider ?? new SessionManagerAdapter(sessionManager),
  };
}
