/**
 * Strategy Builder Agent
 *
 * Helps users create and modify trading strategies through natural language.
 * Converts user requirements into structured strategy configurations.
 */

import { BaseAgent, AgentConfig } from "./base-agent.js";
import { AgentType, WorkflowStage, AgentResult } from "../core/types.js";
import { BACKTEST_READ_TOOLS } from "../mcp-servers/nofx-server.js";
import { HB_READ_TOOLS } from "../mcp-servers/hummingbot-server.js";

const STRATEGY_BUILDER_PROMPT = `You are a trading strategy builder assistant for the Donut trading terminal. Your role is to help users design effective trading strategies for cryptocurrency perpetual futures.

## Your Capabilities
1. **Understand User Goals**: Clarify trading objectives, risk tolerance, and market preferences
2. **Design Strategies**: Create strategy configurations based on technical analysis principles
3. **Validate Parameters**: Ensure strategy parameters are sensible and within risk limits
4. **Explain Decisions**: Provide clear reasoning for all recommendations

## Strategy Components
A complete strategy includes:
- **Coin Selection**: Which assets to trade (BTC/ETH, specific altcoins, or dynamic selection)
- **Indicators**: Technical indicators for signal generation (EMA, MACD, RSI, ATR, volume)
- **Risk Controls**: Position limits, leverage caps, max margin usage, minimum confidence
- **Custom Prompts**: Optional trading rules or market context

## Guidelines
1. Start simple - don't over-engineer. A focused strategy beats a complex one.
2. Consider correlation - diversified assets reduce drawdowns
3. Match leverage to volatility - higher leverage for majors (BTC/ETH), lower for alts
4. Set realistic expectations - 1-3 Sharpe ratio is excellent for crypto
5. Always include risk controls - never trade without stop losses or position limits

## Available Tools
You have access to tools for:
- Listing existing strategies
- Viewing previous backtest results
- Validating strategy configurations
- Creating new strategy configurations

When the user describes what they want, translate it into a concrete strategy configuration.
Be conversational but focused. Ask clarifying questions when requirements are ambiguous.`;

/**
 * Strategy Builder Agent - Creates and modifies trading strategies
 */
export class StrategyBuilderAgent extends BaseAgent {
  get agentType(): AgentType {
    return AgentType.STRATEGY_BUILDER;
  }

  get systemPrompt(): string {
    return STRATEGY_BUILDER_PROMPT;
  }

  get defaultTools(): string[] {
    const backend = this.getBackendType();

    // Base strategy tools (these work in offline mode too)
    const strategyTools = [
      "strategy_list",
      "strategy_get",
      "strategy_create",
      "strategy_validate",
      "strategy_preview_prompt",
      "strategy_update",
    ];

    // Add read-only backtest tools based on backend
    if (backend === "hummingbot") {
      return [
        ...strategyTools,
        // Hummingbot strategy tools
        "hb_strategy_list",
        "hb_strategy_get",
        "hb_strategy_create",
        // Read-only tools for context
        ...HB_READ_TOOLS,
      ];
    }

    return [
      ...strategyTools,
      // Read-only nofx backtest tools for context
      ...BACKTEST_READ_TOOLS,
    ];
  }

  /**
   * Build a new strategy based on user requirements
   */
  async buildStrategy(requirements: string): Promise<AgentResult> {
    const prompt = `Help me build a trading strategy based on these requirements:

${requirements}

Please:
1. Ask any clarifying questions if the requirements are unclear
2. Suggest a strategy configuration with specific parameters
3. Explain why you chose those parameters
4. Create the strategy using the available tools`;

    return this.run(prompt, WorkflowStage.STRATEGY_BUILD);
  }

  /**
   * Review and improve an existing strategy
   */
  async reviewStrategy(strategyName: string, feedback?: string): Promise<AgentResult> {
    const prompt = feedback
      ? `Review the strategy "${strategyName}" and address this feedback: ${feedback}`
      : `Review the strategy "${strategyName}" and suggest improvements based on best practices.`;

    return this.run(prompt, WorkflowStage.STRATEGY_BUILD);
  }

  /**
   * Analyze backtest results and suggest strategy improvements
   */
  async analyzeResults(backtestRunId: string): Promise<AgentResult> {
    const prompt = `Analyze the backtest results for run "${backtestRunId}":

1. Review the performance metrics (Sharpe, drawdown, win rate)
2. Identify what worked well and what didn't
3. Suggest specific improvements to the strategy
4. If the results are good, confirm the strategy is ready for live trading`;

    return this.run(prompt, WorkflowStage.ANALYSIS);
  }

  /**
   * Discovery phase - understand what the user wants to achieve
   */
  async discover(userGoals: string): Promise<AgentResult> {
    const prompt = `I want to understand your trading goals and create a strategy. You mentioned:

"${userGoals}"

Let me ask a few questions to design the best strategy for you:
1. What's your risk tolerance (conservative, moderate, aggressive)?
2. Which assets are you interested in (BTC/ETH only, or altcoins too)?
3. What's your target holding period (scalping, swing, position trading)?
4. Do you have any specific indicators or signals you prefer?

Please also check what strategies and backtests already exist that might be relevant.`;

    return this.run(prompt, WorkflowStage.DISCOVERY);
  }
}

/**
 * Create a new Strategy Builder agent
 */
export function createStrategyBuilder(config: AgentConfig): StrategyBuilderAgent {
  return new StrategyBuilderAgent(config);
}
