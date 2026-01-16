/**
 * Sentiment Analyst Agent - Social media sentiment analysis for crypto markets
 *
 * Gathers and analyzes market sentiment from:
 * - Twitter/X: Crypto influencers, hashtags, trending topics
 * - Discord: Trading communities, alpha channels
 * - Telegram: Signal groups, news channels
 *
 * When API credentials are not configured, returns mock data for testing.
 *
 * Part of Phase 2: Multi-Agent Foundation
 */

import { BaseAgent, AgentConfig } from "./base-agent.js";
import {
  AgentType,
  WorkflowStage,
  AgentResult,
  SentimentApiConfig,
  SentimentData,
  SentimentSource,
  SentimentApiConfigSchema,
} from "../core/types.js";

const SENTIMENT_ANALYST_PROMPT = `You are the Sentiment Analyst for the Donut trading terminal. Your role is to gather and analyze market sentiment from social media sources to inform trading decisions.

## Your Capabilities
1. **Twitter/X Sentiment**: Track crypto mentions, hashtags, influencer opinions
2. **Discord Monitoring**: Monitor trading communities, alpha channels, signal groups
3. **Telegram Analysis**: Analyze group discussions, news channels, project announcements

## Sentiment Analysis Guidelines
- **Score Range**: -1 (extremely bearish) to +1 (extremely bullish), 0 is neutral
- **Confidence**: 0 to 1 based on sample size and source reliability
- **Source Weighting**: Verified accounts and high-quality sources get more weight

## Analysis Approach
1. **Aggregate**: Combine signals from multiple sources
2. **Contextualize**: Consider market conditions and recent events
3. **Identify Trends**: Look for sentiment shifts and emerging narratives
4. **Flag Anomalies**: Detect coordinated manipulation or unusual activity

## Reporting Guidelines
When presenting sentiment analysis:
1. Lead with the overall sentiment score and confidence
2. Break down by source (Twitter, Discord, Telegram)
3. Highlight key narratives and influential opinions
4. Note any concerning patterns (FUD campaigns, coordinated pumps)
5. Provide actionable trading implications

## Data Sources Status
Check the get_sentiment_data tool for current API configuration status.
If credentials are not configured, mock data will be used for demonstration.

Be objective and data-driven. Sentiment is one input, not the whole picture.`;

/**
 * Sentiment Analyst Agent - Analyzes social media sentiment for crypto
 */
export class SentimentAnalystAgent extends BaseAgent {
  private sentimentConfig: SentimentApiConfig;

  constructor(config: AgentConfig, sentimentConfig?: Partial<SentimentApiConfig>) {
    super(config);

    // Load and validate sentiment config
    const parsed = SentimentApiConfigSchema.safeParse(sentimentConfig || {});
    if (parsed.success) {
      this.sentimentConfig = parsed.data;
    } else {
      this.sentimentConfig = { useMockData: true };
    }

    // Auto-detect if we should use mock data
    this.sentimentConfig.useMockData = this.sentimentConfig.useMockData || !this.hasAnyCredentials();
  }

  get agentType(): AgentType {
    return AgentType.SENTIMENT_ANALYST;
  }

  get systemPrompt(): string {
    return SENTIMENT_ANALYST_PROMPT;
  }

  get defaultTools(): string[] {
    return [
      "get_sentiment_data",
      // Read-only tools for context
      "strategy_list",
      "backtest_list_runs",
    ];
  }

  /**
   * Check if any API credentials are configured
   */
  private hasAnyCredentials(): boolean {
    return !!(
      this.sentimentConfig.twitter?.bearerToken ||
      this.sentimentConfig.discord?.botToken ||
      this.sentimentConfig.telegram?.botToken
    );
  }

  /**
   * Get list of configured sentiment sources
   */
  getConfiguredSources(): SentimentSource[] {
    const sources: SentimentSource[] = [];

    if (this.sentimentConfig.twitter?.bearerToken) {
      sources.push("twitter");
    }
    if (this.sentimentConfig.discord?.botToken) {
      sources.push("discord");
    }
    if (this.sentimentConfig.telegram?.botToken) {
      sources.push("telegram");
    }

    // Always include mock if no real sources
    if (sources.length === 0 || this.sentimentConfig.useMockData) {
      sources.push("mock");
    }

    return sources;
  }

  /**
   * Fetch sentiment data for a symbol
   *
   * Returns data from all configured sources, or mock data if no credentials.
   */
  async getSentimentData(
    symbol: string,
    sources?: SentimentSource[]
  ): Promise<SentimentData[]> {
    const configuredSources = this.getConfiguredSources();
    const requestedSources = sources || configuredSources;
    const results: SentimentData[] = [];

    for (const source of requestedSources) {
      // Skip if source not configured (except mock)
      if (source !== "mock" && !configuredSources.includes(source)) {
        continue;
      }

      try {
        let data: SentimentData;

        switch (source) {
          case "twitter":
            data = await this.fetchTwitterSentiment(symbol);
            break;
          case "discord":
            data = await this.fetchDiscordSentiment(symbol);
            break;
          case "telegram":
            data = await this.fetchTelegramSentiment(symbol);
            break;
          case "mock":
          default:
            data = this.generateMockSentiment(symbol);
            break;
        }

        results.push(data);
      } catch (error) {
        console.warn(`[SentimentAnalyst] Failed to fetch ${source} sentiment:`, error);
        // Fall back to mock for this source
        results.push({
          source,
          symbol,
          score: 0,
          confidence: 0,
          sampleSize: 0,
          timestamp: new Date().toISOString(),
          rawData: { error: error instanceof Error ? error.message : String(error) },
        });
      }
    }

    return results;
  }

  /**
   * Aggregate sentiment from multiple sources into a single score
   */
  aggregateSentiment(data: SentimentData[]): {
    score: number;
    confidence: number;
    totalSamples: number;
    sourceCount: number;
  } {
    if (data.length === 0) {
      return { score: 0, confidence: 0, totalSamples: 0, sourceCount: 0 };
    }

    // Weight by confidence and sample size
    let weightedSum = 0;
    let totalWeight = 0;
    let totalSamples = 0;

    for (const d of data) {
      const weight = d.confidence * Math.log10(d.sampleSize + 1);
      weightedSum += d.score * weight;
      totalWeight += weight;
      totalSamples += d.sampleSize;
    }

    const score = totalWeight > 0 ? weightedSum / totalWeight : 0;
    const avgConfidence = data.reduce((sum, d) => sum + d.confidence, 0) / data.length;

    return {
      score: Math.round(score * 100) / 100,
      confidence: Math.round(avgConfidence * 100) / 100,
      totalSamples,
      sourceCount: data.length,
    };
  }

  // ============================================================================
  // Source-Specific Fetch Methods (Placeholders)
  // ============================================================================

  /**
   * Fetch Twitter sentiment (placeholder - implement with Twitter API v2)
   */
  private async fetchTwitterSentiment(symbol: string): Promise<SentimentData> {
    // TODO: Implement Twitter API v2 integration
    // - Search recent tweets for $SYMBOL and #SYMBOL
    // - Analyze text sentiment using NLP
    // - Weight by follower count and engagement

    throw new Error(
      "Twitter sentiment not yet implemented. Configure TWITTER_BEARER_TOKEN when ready."
    );
  }

  /**
   * Fetch Discord sentiment (placeholder - implement with Discord bot)
   */
  private async fetchDiscordSentiment(symbol: string): Promise<SentimentData> {
    // TODO: Implement Discord bot integration
    // - Monitor configured guild channels
    // - Search message history for symbol mentions
    // - Analyze tone and context

    throw new Error(
      "Discord sentiment not yet implemented. Configure DISCORD_BOT_TOKEN when ready."
    );
  }

  /**
   * Fetch Telegram sentiment (placeholder - implement with Telegram Bot API)
   */
  private async fetchTelegramSentiment(symbol: string): Promise<SentimentData> {
    // TODO: Implement Telegram Bot API integration
    // - Subscribe to configured channels
    // - Parse messages for symbol mentions
    // - Score sentiment polarity

    throw new Error(
      "Telegram sentiment not yet implemented. Configure TELEGRAM_BOT_TOKEN when ready."
    );
  }

  /**
   * Generate mock sentiment data for testing
   */
  private generateMockSentiment(symbol: string): SentimentData {
    // Generate deterministic but varied mock data based on symbol
    const symbolHash = symbol.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const dayOfYear = Math.floor(
      (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
    );

    // Create a pseudo-random but deterministic score
    const baseSeed = (symbolHash * 17 + dayOfYear * 31) % 100;
    const score = ((baseSeed - 50) / 50) * 0.8; // Range: -0.8 to 0.8

    // Vary confidence based on symbol popularity (BTC/ETH get higher confidence)
    const isPopular = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT"].includes(symbol);
    const confidence = isPopular ? 0.75 + Math.random() * 0.2 : 0.5 + Math.random() * 0.3;

    // Sample size varies by popularity
    const sampleSize = isPopular
      ? Math.floor(1000 + Math.random() * 4000)
      : Math.floor(100 + Math.random() * 500);

    return {
      source: "mock",
      symbol,
      score: Math.round(score * 100) / 100,
      confidence: Math.round(confidence * 100) / 100,
      sampleSize,
      timestamp: new Date().toISOString(),
      rawData: {
        note: "Mock data - configure API credentials for live sentiment",
        symbolHash,
        dayOfYear,
      },
    };
  }

  // ============================================================================
  // High-Level Workflow Methods
  // ============================================================================

  /**
   * Analyze sentiment for a symbol with full report
   */
  async analyzeSentiment(symbol: string): Promise<AgentResult> {
    const prompt = `Analyze the current market sentiment for ${symbol}:

1. Fetch sentiment data from all available sources using get_sentiment_data
2. Break down the sentiment by source
3. Identify key themes and narratives
4. Note any concerning patterns (coordinated activity, unusual volume)
5. Provide trading implications based on the sentiment

Be specific about confidence levels and sample sizes.`;

    return this.run(prompt, WorkflowStage.DISCOVERY);
  }

  /**
   * Compare sentiment across multiple symbols
   */
  async compareSentiment(symbols: string[]): Promise<AgentResult> {
    const symbolList = symbols.join(", ");
    const prompt = `Compare sentiment across these symbols: ${symbolList}

1. Fetch sentiment for each symbol
2. Create a comparison table showing:
   - Overall sentiment score
   - Confidence level
   - Sample size
   - Key narratives
3. Identify which symbols have the most positive/negative sentiment
4. Note any correlations or divergences
5. Suggest which symbols look most favorable from a sentiment perspective`;

    return this.run(prompt, WorkflowStage.DISCOVERY);
  }

  /**
   * Monitor sentiment changes over time (single query, not continuous)
   */
  async checkSentimentShift(symbol: string): Promise<AgentResult> {
    const prompt = `Check for recent sentiment shifts in ${symbol}:

1. Get current sentiment data
2. Compare to baseline expectations for this asset
3. Identify any recent events that may have impacted sentiment
4. Assess whether current sentiment represents an opportunity or risk
5. Provide a recommendation on timing (wait for sentiment to normalize, act now, etc.)`;

    return this.run(prompt, WorkflowStage.DISCOVERY);
  }

  /**
   * Get API configuration status
   */
  getConfigStatus(): {
    twitter: { configured: boolean; fields: string[] };
    discord: { configured: boolean; fields: string[] };
    telegram: { configured: boolean; fields: string[] };
    useMockData: boolean;
  } {
    return {
      twitter: {
        configured: !!this.sentimentConfig.twitter?.bearerToken,
        fields: ["apiKey", "apiSecret", "bearerToken"],
      },
      discord: {
        configured: !!this.sentimentConfig.discord?.botToken,
        fields: ["botToken", "guildIds"],
      },
      telegram: {
        configured: !!this.sentimentConfig.telegram?.botToken,
        fields: ["botToken", "channelIds"],
      },
      useMockData: this.sentimentConfig.useMockData,
    };
  }
}

/**
 * Create a new Sentiment Analyst agent
 */
export function createSentimentAnalyst(
  config: AgentConfig,
  sentimentConfig?: Partial<SentimentApiConfig>
): SentimentAnalystAgent {
  return new SentimentAnalystAgent(config, sentimentConfig);
}
