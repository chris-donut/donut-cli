/**
 * Sentiment MCP Server - Exposes sentiment analysis tools to Claude Agent SDK
 *
 * Provides tools for:
 * - Fetching sentiment data from social sources (get_sentiment_data)
 * - Checking API configuration status (get_sentiment_config)
 *
 * When API credentials are not configured, returns mock data for testing.
 *
 * Part of Phase 2: Multi-Agent Foundation
 */

import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import {
  SentimentApiConfig,
  SentimentData,
  SentimentSource,
} from "../core/types.js";
import {
  SentimentAnalystAgent,
  createSentimentAnalyst,
} from "../agents/sentiment-analyst.js";
import { AgentConfig } from "../agents/base-agent.js";

// Global sentiment agent instance
let sentimentAgentInstance: SentimentAnalystAgent | null = null;

/**
 * Initialize the sentiment agent with config
 */
export function initializeSentimentAgent(
  agentConfig: AgentConfig,
  sentimentConfig?: Partial<SentimentApiConfig>
): SentimentAnalystAgent {
  sentimentAgentInstance = createSentimentAnalyst(agentConfig, sentimentConfig);
  return sentimentAgentInstance;
}

/**
 * Get the sentiment agent instance, throwing if not initialized
 */
function getSentimentAgent(): SentimentAnalystAgent {
  if (!sentimentAgentInstance) {
    throw new Error(
      "Sentiment agent not initialized. Call initializeSentimentAgent first."
    );
  }
  return sentimentAgentInstance;
}

/**
 * Set an existing sentiment agent instance
 */
export function setSentimentAgentInstance(agent: SentimentAnalystAgent): void {
  sentimentAgentInstance = agent;
}

// ============================================================================
// Tool Definitions
// ============================================================================

/**
 * Get sentiment data for a cryptocurrency symbol
 */
export const getSentimentDataTool = tool(
  "get_sentiment_data",
  `Fetch market sentiment data for a cryptocurrency symbol from social media sources.

Sources include Twitter, Discord, and Telegram (when API credentials are configured).
Returns mock data if credentials are not provided, clearly marked as such.

Each source returns:
- score: -1 (bearish) to +1 (bullish)
- confidence: 0 to 1 (based on sample size and source reliability)
- sampleSize: number of data points analyzed

The aggregate score is weighted by confidence and sample size.`,
  {
    symbol: z
      .string()
      .min(1)
      .describe("Cryptocurrency symbol (e.g., BTCUSDT, ETHUSDT)"),
    sources: z
      .array(z.enum(["twitter", "discord", "telegram", "mock", "all"]))
      .default(["all"])
      .describe("Specific sources to query (default: all available)"),
  },
  async (args) => {
    const agent = getSentimentAgent();

    try {
      // Convert "all" to undefined (fetch from all configured sources)
      const sourcesToFetch = args.sources.includes("all")
        ? undefined
        : (args.sources.filter((s) => s !== "all") as SentimentSource[]);

      const sentimentData = await agent.getSentimentData(
        args.symbol.toUpperCase(),
        sourcesToFetch
      );

      // Aggregate sentiment across sources
      const aggregate = agent.aggregateSentiment(sentimentData);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: true,
                symbol: args.symbol.toUpperCase(),
                aggregate: {
                  score: aggregate.score,
                  confidence: aggregate.confidence,
                  totalSamples: aggregate.totalSamples,
                  sourceCount: aggregate.sourceCount,
                  interpretation: interpretScore(aggregate.score),
                },
                sources: sentimentData.map((d) => ({
                  source: d.source,
                  score: d.score,
                  confidence: d.confidence,
                  sampleSize: d.sampleSize,
                  timestamp: d.timestamp,
                  isMock: d.source === "mock",
                })),
                timestamp: new Date().toISOString(),
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
                symbol: args.symbol.toUpperCase(),
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
 * Get sentiment API configuration status
 */
export const getSentimentConfigTool = tool(
  "get_sentiment_config",
  `Check the configuration status of sentiment data sources.

Shows which APIs have credentials configured and which fields are needed.
Useful for understanding why mock data might be returned.`,
  {},
  async () => {
    const agent = getSentimentAgent();
    const configStatus = agent.getConfigStatus();

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              success: true,
              configStatus,
              configuredSources: agent.getConfiguredSources(),
              instructions: {
                twitter:
                  "Set TWITTER_BEARER_TOKEN environment variable for Twitter API v2",
                discord:
                  "Set DISCORD_BOT_TOKEN and DISCORD_GUILD_IDS environment variables",
                telegram:
                  "Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_IDS environment variables",
              },
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
 * Compare sentiment across multiple symbols
 */
export const compareSentimentTool = tool(
  "compare_sentiment",
  `Compare sentiment scores across multiple cryptocurrency symbols.

Useful for identifying which assets have the most favorable sentiment
and for detecting relative sentiment strength.`,
  {
    symbols: z
      .array(z.string().min(1))
      .min(2)
      .max(10)
      .describe("List of symbols to compare (2-10)"),
  },
  async (args) => {
    const agent = getSentimentAgent();

    try {
      const results: Array<{
        symbol: string;
        aggregate: ReturnType<SentimentAnalystAgent["aggregateSentiment"]>;
        sources: SentimentData[];
      }> = [];

      for (const symbol of args.symbols) {
        const data = await agent.getSentimentData(symbol.toUpperCase());
        const aggregate = agent.aggregateSentiment(data);
        results.push({
          symbol: symbol.toUpperCase(),
          aggregate,
          sources: data,
        });
      }

      // Sort by sentiment score (highest first)
      results.sort((a, b) => b.aggregate.score - a.aggregate.score);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: true,
                comparison: results.map((r) => ({
                  symbol: r.symbol,
                  score: r.aggregate.score,
                  confidence: r.aggregate.confidence,
                  interpretation: interpretScore(r.aggregate.score),
                  totalSamples: r.aggregate.totalSamples,
                  sourceCount: r.aggregate.sourceCount,
                })),
                mostBullish: results[0]?.symbol,
                mostBearish: results[results.length - 1]?.symbol,
                timestamp: new Date().toISOString(),
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

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert sentiment score to human-readable interpretation
 */
function interpretScore(score: number): string {
  if (score >= 0.6) return "strongly bullish";
  if (score >= 0.3) return "bullish";
  if (score >= 0.1) return "slightly bullish";
  if (score > -0.1) return "neutral";
  if (score > -0.3) return "slightly bearish";
  if (score > -0.6) return "bearish";
  return "strongly bearish";
}

// ============================================================================
// MCP Server Factory
// ============================================================================

/**
 * Create the Sentiment MCP server
 */
export function createSentimentMcpServer() {
  return createSdkMcpServer({
    name: "sentiment",
    version: "0.1.0",
    tools: [getSentimentDataTool, getSentimentConfigTool, compareSentimentTool],
  });
}

/**
 * All sentiment tool names
 */
export const SENTIMENT_TOOLS = [
  "get_sentiment_data",
  "get_sentiment_config",
  "compare_sentiment",
] as const;

/**
 * Read-only sentiment tools (all are read-only)
 */
export const SENTIMENT_READ_TOOLS = [...SENTIMENT_TOOLS] as const;
