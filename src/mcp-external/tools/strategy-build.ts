/**
 * Strategy Build Tool Handler
 *
 * Builds trading strategies from natural language descriptions.
 * Creates isolated agent instances for MCP tool calls (no state sharing with CLI).
 */

import Anthropic from "@anthropic-ai/sdk";
import { loadConfig } from "../../core/config.js";

// ============================================================================
// Types
// ============================================================================

export interface StrategyConfig {
  name: string;
  type: "momentum" | "mean_reversion" | "breakout" | "dca" | "grid";
  symbols: string[];
  indicators: {
    name: string;
    params: Record<string, number>;
  }[];
  riskControls: {
    maxLeverage: number;
    stopLossPct: number;
    takeProfitPct: number;
    maxPositionSizeUsd: number;
    maxDrawdownPct: number;
  };
  timeframes: string[];
  customPrompt?: string;
}

export interface StrategyBuildResult {
  success: boolean;
  strategy?: StrategyConfig;
  reasoning?: string;
  error?: string;
}

// ============================================================================
// Strategy Builder Prompt
// ============================================================================

const STRATEGY_BUILDER_SYSTEM_PROMPT = `You are a trading strategy builder. Your job is to convert natural language strategy descriptions into structured JSON configurations.

Output a valid JSON object with this structure:
{
  "name": "strategy name (snake_case)",
  "type": "momentum" | "mean_reversion" | "breakout" | "dca" | "grid",
  "symbols": ["BTC-USDT", "ETH-USDT"],
  "indicators": [
    {"name": "EMA", "params": {"period": 20}},
    {"name": "RSI", "params": {"period": 14}}
  ],
  "riskControls": {
    "maxLeverage": 10,
    "stopLossPct": 5,
    "takeProfitPct": 15,
    "maxPositionSizeUsd": 10000,
    "maxDrawdownPct": 20
  },
  "timeframes": ["1m", "5m", "15m"],
  "customPrompt": "optional additional trading rules"
}

Guidelines:
- Use sensible defaults for missing parameters
- For momentum strategies: use EMA crossovers, MACD, or RSI
- For mean reversion: use Bollinger Bands, RSI extremes
- For breakout: use ATR, volume, support/resistance
- Default stop loss: 5% for majors, 7% for alts
- Default leverage: 10x for BTC/ETH, 5x for alts
- Always include risk controls

Return ONLY the JSON object, no other text.`;

// ============================================================================
// Handler
// ============================================================================

/**
 * Handle strategy build request
 *
 * Creates an isolated agent instance to generate strategy configuration.
 * Does not share state with CLI operations.
 */
export async function handleStrategyBuild(
  prompt: string,
  symbol?: string
): Promise<StrategyBuildResult> {
  if (!prompt) {
    return {
      success: false,
      error: "Strategy description (prompt) is required",
    };
  }

  try {
    const config = loadConfig();

    if (!config.anthropicApiKey) {
      return {
        success: false,
        error:
          "ANTHROPIC_API_KEY not configured. Please set it in your .env file.",
      };
    }

    const anthropic = new Anthropic({
      apiKey: config.anthropicApiKey,
    });

    // Build the user prompt
    let userPrompt = `Build a trading strategy based on this description:\n\n${prompt}`;
    if (symbol) {
      userPrompt += `\n\nFocus on the ${symbol} trading pair.`;
    }

    // Call Claude to generate strategy
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: STRATEGY_BUILDER_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    // Extract the JSON from the response
    const content = response.content[0];
    if (content.type !== "text") {
      return {
        success: false,
        error: "Unexpected response format from Claude",
      };
    }

    // Parse the JSON response
    let strategyJson: string = content.text;

    // Try to extract JSON if wrapped in markdown code blocks
    const jsonMatch = strategyJson.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      strategyJson = jsonMatch[1].trim();
    }

    const strategy = JSON.parse(strategyJson) as StrategyConfig;

    // Validate required fields
    if (!strategy.name || !strategy.type || !strategy.symbols) {
      return {
        success: false,
        error: "Generated strategy is missing required fields",
      };
    }

    // Ensure symbols array is populated
    if (strategy.symbols.length === 0 && symbol) {
      strategy.symbols = [symbol.replace("/", "-")];
    }

    return {
      success: true,
      strategy,
      reasoning: `Generated ${strategy.type} strategy "${strategy.name}" for ${strategy.symbols.join(", ")} with ${strategy.indicators?.length || 0} indicators.`,
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return {
        success: false,
        error: "Failed to parse strategy JSON from Claude response",
      };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
