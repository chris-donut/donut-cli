/**
 * Backtest Analyst Agent
 *
 * Runs backtests and analyzes results to validate trading strategies.
 * Provides insights into strategy performance and suggests improvements.
 */

import { BaseAgent, AgentConfig } from "./base-agent.js";
import { AgentType, WorkflowStage, BacktestConfig, AgentResult } from "../core/types.js";

const BACKTEST_ANALYST_PROMPT = `You are a backtest analyst for the Donut trading terminal. Your role is to run backtests and provide insightful analysis of trading strategy performance.

## Your Capabilities
1. **Run Backtests**: Configure and execute backtests with appropriate parameters
2. **Monitor Progress**: Track backtest execution and handle any issues
3. **Analyze Results**: Interpret performance metrics and identify patterns
4. **Provide Insights**: Explain what the results mean and suggest improvements

## Key Metrics to Analyze
- **Total Return**: Absolute and percentage return over the period
- **Sharpe Ratio**: Risk-adjusted return (> 1.0 is good, > 2.0 is excellent)
- **Max Drawdown**: Largest peak-to-trough decline (< 20% is conservative)
- **Win Rate**: Percentage of profitable trades (> 50% with proper risk/reward)
- **Profit Factor**: Gross profits / Gross losses (> 1.5 is good)
- **Trade Count**: Number of trades executed (affects statistical significance)

## Analysis Guidelines
1. **Context Matters**: Compare to benchmark (buy & hold, market return)
2. **Statistical Significance**: More trades = more reliable results
3. **Risk-Adjusted Returns**: Sharpe ratio matters more than raw return
4. **Drawdown Analysis**: Evaluate if drawdowns are acceptable for user's risk tolerance
5. **Symbol Analysis**: Identify which assets performed best/worst and why
6. **Decision Quality**: Review AI decisions to understand what patterns worked

## Reporting
When presenting results:
1. Start with the executive summary (pass/fail, key metrics)
2. Highlight strengths and weaknesses
3. Provide actionable recommendations
4. Include relevant data visualizations (equity curve shape, trade distribution)

Be thorough but concise. Focus on insights that lead to better strategies.`;

/**
 * Backtest Analyst Agent - Runs and analyzes backtests
 *
 * Uses dependency injection for MCP servers and tools.
 * The default tools are provided by the McpServerProvider based on backend type.
 */
export class BacktestAnalystAgent extends BaseAgent {
  get agentType(): AgentType {
    return AgentType.BACKTEST_ANALYST;
  }

  get systemPrompt(): string {
    return BACKTEST_ANALYST_PROMPT;
  }

  // Note: defaultTools is inherited from BaseAgent and uses McpServerProvider
  // No need to override unless we want custom tool selection

  /**
   * Start a new backtest run
   */
  async runBacktest(config: Partial<BacktestConfig>, description?: string): Promise<AgentResult> {
    const configDescription = description || "the specified strategy";
    const backend = this.getBackendType();

    // Use the appropriate tool name based on backend
    const startTool = backend === "hummingbot" ? "hb_backtest_start" : "backtest_start";

    const prompt = `Run a backtest for ${configDescription} with these parameters:

${JSON.stringify(config, null, 2)}

Please:
1. Start the backtest with the ${startTool} tool
2. Monitor the progress until completion
3. Once complete, retrieve and analyze the results
4. Provide a comprehensive analysis of the performance`;

    return this.run(prompt, WorkflowStage.BACKTEST);
  }

  /**
   * Check status of a running backtest
   */
  async checkStatus(runId: string): Promise<AgentResult> {
    const prompt = `Check the status of backtest run "${runId}":

1. Get the current status and progress
2. If still running, report the progress percentage and current equity
3. If completed, analyze the final results
4. If failed, explain what went wrong`;

    return this.run(prompt, WorkflowStage.BACKTEST);
  }

  /**
   * Analyze completed backtest results
   */
  async analyzeResults(runId: string): Promise<AgentResult> {
    const prompt = `Provide a comprehensive analysis of backtest run "${runId}":

1. Get the performance metrics (Sharpe, drawdown, win rate, etc.)
2. Review the equity curve for patterns
3. Analyze the trade history (best/worst trades, by symbol)
4. Review the AI decisions (what reasoning led to good/bad trades)
5. Summarize findings with actionable recommendations

Be thorough - this analysis will determine if the strategy goes live.`;

    return this.run(prompt, WorkflowStage.ANALYSIS);
  }

  /**
   * Compare multiple backtest runs
   */
  async compareRuns(runIds: string[]): Promise<AgentResult> {
    const prompt = `Compare these backtest runs: ${runIds.join(", ")}

For each run:
1. Get the performance metrics
2. Note the configuration differences

Then provide:
- A comparison table of key metrics
- Which strategy performed best and why
- What factors contributed to the differences
- Recommendations for which approach to use`;

    return this.run(prompt, WorkflowStage.ANALYSIS);
  }

  /**
   * List and summarize recent backtests
   */
  async listRecent(limit: number = 10): Promise<AgentResult> {
    const backend = this.getBackendType();
    const listTool = backend === "hummingbot" ? "hb_backtest_list" : "backtest_list_runs";

    const prompt = `List the ${limit} most recent backtest runs and provide a summary:

1. Use ${listTool} to get recent runs
2. For each run, note the state, symbols, and time period
3. For completed runs, get the key metrics
4. Highlight any runs that performed particularly well or poorly
5. Suggest which runs deserve deeper analysis`;

    return this.run(prompt, WorkflowStage.DISCOVERY);
  }
}

/**
 * Create a new Backtest Analyst agent
 */
export function createBacktestAnalyst(config: AgentConfig): BacktestAnalystAgent {
  return new BacktestAnalystAgent(config);
}
