/**
 * Thesis Analyst Agent - Monitors trading thesis health and validity
 *
 * Analyzes trading theses by:
 * - Checking key assumptions against current market data
 * - Monitoring invalidation signals
 * - Providing health scores and recommendations
 * - Suggesting conviction adjustments
 *
 * Part of Phase 4: Thesis Trading Layer
 */

import { BaseAgent, AgentConfig } from "./base-agent.js";
import {
  AgentType,
  WorkflowStage,
  AgentResult,
} from "../core/types.js";
import {
  TradingThesis,
  ThesisHealth,
  AssumptionStatus,
  getThesisDaysActive,
  isThesisOverdue,
} from "../thesis/types.js";

const THESIS_ANALYST_PROMPT = `You are the Thesis Analyst for the Donut trading terminal. Your role is to monitor and evaluate trading theses to help traders maintain discipline and adapt to changing market conditions.

## Your Capabilities
1. **Thesis Health Check**: Evaluate if a thesis remains valid based on current market conditions
2. **Assumption Validation**: Check each key assumption against available data
3. **Invalidation Monitoring**: Watch for signals that would disprove the thesis
4. **Recommendation Generation**: Suggest actions (hold, increase, reduce, close)

## Analysis Framework

### Assumption Checking
For each key assumption in a thesis:
- Gather relevant market data (prices, volumes, sentiment, news)
- Assess whether the assumption still holds
- Provide confidence level (0-1) in your assessment
- Document reasoning for future reference

### Health Score Calculation
The thesis health score (0-100) considers:
- **Assumption validity**: Each invalid assumption reduces health
- **Invalidation signals**: Triggered signals significantly reduce health
- **Time factors**: Overdue theses (past expected timeframe) get penalized
- **Position performance**: P&L relative to conviction level

### Recommendations
Based on health score and market conditions:
- **INCREASE** (health > 80%): Thesis strong, consider adding exposure
- **HOLD** (health 50-80%): Thesis intact, maintain current position
- **REDUCE** (health 30-50%): Thesis weakening, trim exposure
- **CLOSE** (health < 30%): Thesis broken, exit all positions

## Analysis Approach
1. Review thesis details: title, timeframe, conviction, assumptions
2. Check each assumption systematically
3. Monitor all invalidation signals
4. Calculate health score
5. Generate recommendation with clear reasoning

## Important Guidelines
- Be objective and evidence-based
- Don't let position P&L bias your thesis assessment
- A losing thesis can still be valid (just early)
- A winning thesis can become invalid (conditions changed)
- When in doubt, err on the side of caution
- Document all reasoning for learning and review

Use the thesis MCP tools (thesis_get, thesis_check) to retrieve thesis data.
Be thorough but concise in your analysis.`;

/**
 * Thesis Analyst Agent - Monitors thesis health and validity
 */
export class ThesisAnalystAgent extends BaseAgent {
  constructor(config: AgentConfig) {
    super(config);
  }

  get agentType(): AgentType {
    return AgentType.THESIS_ANALYST;
  }

  get systemPrompt(): string {
    return THESIS_ANALYST_PROMPT;
  }

  get defaultTools(): string[] {
    return [
      // Thesis tools
      "thesis_get",
      "thesis_list",
      "thesis_check",
      "thesis_update",
      // Market data tools
      "get_current_price",
      "get_candles",
      "get_open_interest",
      "get_funding_rate",
      // Sentiment tools (if available)
      "get_sentiment_data",
    ];
  }

  /**
   * Analyze a specific thesis
   */
  async analyzeThesis(thesisId: string): Promise<AgentResult> {
    const prompt = `Analyze the thesis with ID: ${thesisId}

Please:
1. Use thesis_get to retrieve the full thesis details
2. For each key assumption, check if it still holds using available market data
3. Check if any invalidation signals have been triggered
4. Calculate an overall health score
5. Provide a clear recommendation (increase/hold/reduce/close)
6. Document your reasoning

Format your response as a structured thesis health report.`;

    return this.run(prompt, WorkflowStage.ANALYSIS);
  }

  /**
   * Check all active theses
   */
  async checkAllTheses(): Promise<AgentResult> {
    const prompt = `Review all active trading theses.

Please:
1. Use thesis_list with status="active" to get all active theses
2. For each thesis, run thesis_check to get the current health
3. Identify any theses that need immediate attention (health < 50)
4. Provide a summary of:
   - Total active theses
   - Theses in good health (> 80)
   - Theses needing attention (< 50)
   - Any with triggered invalidation signals

Prioritize flagging any thesis that should be reviewed urgently.`;

    return this.run(prompt, WorkflowStage.REVIEW);
  }

  /**
   * Validate a specific assumption
   */
  async validateAssumption(
    thesisId: string,
    assumptionId: string
  ): Promise<AssumptionStatus> {
    const result = await this.run(
      `Validate assumption ${assumptionId} for thesis ${thesisId}.

1. Use thesis_get to retrieve the thesis and find this assumption
2. Gather relevant market data to test the assumption
3. Determine if the assumption is still valid (true/false/null if untestable)
4. Provide your confidence level (0-1)
5. Document your reasoning

Return a JSON object with: assumptionId, isValid, confidence, reasoning`,
      WorkflowStage.ANALYSIS
    );

    // Parse the response to extract AssumptionStatus
    // In a real implementation, this would parse the AI response
    return {
      assumptionId,
      description: "Parsed from thesis",
      isValid: null,
      confidence: 0.5,
      reasoning: result.result || "Analysis pending",
      lastChecked: new Date().toISOString(),
    };
  }

  /**
   * Generate a comprehensive thesis review
   */
  async generateThesisReview(thesisId: string): Promise<AgentResult> {
    const prompt = `Generate a comprehensive review for thesis ${thesisId}.

Include:
1. **Thesis Overview**: Title, conviction, timeframe, current status
2. **Assumption Analysis**: Status of each key assumption
3. **Invalidation Status**: Which signals are triggered (if any)
4. **Position Summary**: Linked positions and their P&L
5. **Market Context**: Current conditions relevant to this thesis
6. **Health Assessment**: Overall health score and breakdown
7. **Recommendation**: Clear action suggestion with reasoning
8. **Risk Factors**: What could go wrong from here

Be thorough but concise. This review will be used for decision-making.`;

    return this.run(prompt, WorkflowStage.REVIEW);
  }

  /**
   * Suggest conviction adjustment based on thesis health
   */
  async suggestConvictionAdjustment(thesisId: string): Promise<{
    currentConviction: number;
    suggestedConviction: number;
    reasoning: string;
  }> {
    const result = await this.run(
      `Analyze thesis ${thesisId} and suggest conviction adjustment.

1. Get current thesis details and health
2. Consider:
   - Assumption validity rate
   - Triggered invalidation signals
   - Position P&L vs expectations
   - Time elapsed vs timeframe
3. Suggest a new conviction level (0-100)
4. Explain your reasoning

Return JSON with: currentConviction, suggestedConviction, reasoning`,
      WorkflowStage.ANALYSIS
    );

    // In real implementation, parse AI response
    return {
      currentConviction: 70,
      suggestedConviction: 70,
      reasoning: result.result || "Analysis pending",
    };
  }
}

/**
 * Create thesis analyst agent with configuration
 */
export function createThesisAnalyst(config: AgentConfig): ThesisAnalystAgent {
  return new ThesisAnalystAgent(config);
}
