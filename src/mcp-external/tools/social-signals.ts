/**
 * Social Signal Discovery Integration
 *
 * Provides trending token discovery from Farcaster via Neynar API.
 * Security: API key loaded only at execution time, never logged or cached.
 */

import { NeynarAPIClient, Configuration } from "@neynar/nodejs-sdk";

// Cached client instance
let neynarClient: NeynarAPIClient | null = null;

// ============================================================================
// Types
// ============================================================================

export interface SocialSignal {
  token: string;
  symbol?: string;
  contractAddress?: string;
  network?: string;
  mentions: number;
  sentiment?: "positive" | "neutral" | "negative";
  volume24h?: string;
  sources: Array<{
    platform: "farcaster";
    author: string;
    text: string;
    timestamp: string;
    url: string;
    engagement: {
      likes: number;
      recasts: number;
      replies: number;
    };
  }>;
}

export interface TrendingResult {
  success: boolean;
  signals?: SocialSignal[];
  count?: number;
  error?: string;
}

export interface SearchMentionsResult {
  success: boolean;
  signals?: SocialSignal[];
  count?: number;
  query?: string;
  error?: string;
}

// ============================================================================
// Client Management
// ============================================================================

/**
 * Get Neynar API client
 * SECURITY: API key is loaded only at execution time
 */
function getNeynarClient(): NeynarAPIClient | null {
  if (neynarClient) {
    return neynarClient;
  }

  const apiKey = process.env.NEYNAR_API_KEY;
  if (!apiKey) {
    return null;
  }

  const config = new Configuration({ apiKey });
  neynarClient = new NeynarAPIClient(config);
  return neynarClient;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Simple sentiment analysis based on keyword matching
 */
function analyzeSentiment(
  text: string
): "positive" | "neutral" | "negative" {
  const lowerText = text.toLowerCase();

  const positiveWords = [
    "bullish",
    "moon",
    "pump",
    "buy",
    "long",
    "ath",
    "gem",
    "undervalued",
    "alpha",
    "accumulate",
    "rally",
    "breakout",
    "🚀",
    "📈",
    "💎",
    "🔥",
  ];
  const negativeWords = [
    "bearish",
    "dump",
    "sell",
    "short",
    "rug",
    "scam",
    "avoid",
    "overvalued",
    "crash",
    "rekt",
    "📉",
    "💀",
    "🚨",
  ];

  let positiveCount = 0;
  let negativeCount = 0;

  for (const word of positiveWords) {
    if (lowerText.includes(word)) positiveCount++;
  }
  for (const word of negativeWords) {
    if (lowerText.includes(word)) negativeCount++;
  }

  if (positiveCount > negativeCount && positiveCount >= 2) return "positive";
  if (negativeCount > positiveCount && negativeCount >= 2) return "negative";
  return "neutral";
}

/**
 * Extract potential token symbols/names from text
 */
function extractTokenMentions(text: string): string[] {
  const tokens: string[] = [];

  // Match $SYMBOL patterns (common crypto convention)
  const dollarMatches = text.match(/\$[A-Z]{2,10}/gi) || [];
  tokens.push(...dollarMatches.map((t) => t.replace("$", "").toUpperCase()));

  // Match common tokens by name
  const commonTokens = [
    "SOL",
    "SOLANA",
    "ETH",
    "ETHEREUM",
    "BTC",
    "BITCOIN",
    "USDC",
    "USDT",
    "BONK",
    "WIF",
    "JUP",
    "PYTH",
    "ORCA",
    "RAY",
    "DEGEN",
  ];
  for (const token of commonTokens) {
    const regex = new RegExp(`\\b${token}\\b`, "i");
    if (regex.test(text)) {
      tokens.push(token.toUpperCase());
    }
  }

  // Deduplicate
  return [...new Set(tokens)];
}

/**
 * Build Warpcast URL for a cast
 */
function buildCastUrl(authorUsername: string, castHash: string): string {
  return `https://warpcast.com/${authorUsername}/${castHash.slice(0, 10)}`;
}

// ============================================================================
// API Handlers
// ============================================================================

/**
 * Get trending tokens from Farcaster social signals
 */
export async function handleTrending(params: {
  limit?: number;
  minMentions?: number;
  timeWindow?: "1h" | "6h" | "24h" | "7d";
  network?: "solana" | "base" | "ethereum";
}): Promise<TrendingResult> {
  const client = getNeynarClient();
  if (!client) {
    return {
      success: false,
      error:
        "NEYNAR_API_KEY not configured. Add it to your .env file. Get a key at https://neynar.com",
    };
  }

  try {
    const limit = params.limit || 10;
    const minMentions = params.minMentions || 2;

    // Fetch trending feed from Farcaster
    const trendingResponse = await client.fetchTrendingFeed({
      limit: 50, // Fetch more to filter
      timeWindow: params.timeWindow === "7d" ? "7d" : params.timeWindow === "6h" ? "6h" : "24h",
    });

    // Aggregate token mentions
    const tokenMentions = new Map<
      string,
      {
        count: number;
        casts: Array<{
          author: string;
          text: string;
          timestamp: string;
          hash: string;
          likes: number;
          recasts: number;
          replies: number;
        }>;
      }
    >();

    for (const cast of trendingResponse.casts || []) {
      const tokens = extractTokenMentions(cast.text || "");

      for (const token of tokens) {
        const existing = tokenMentions.get(token) || { count: 0, casts: [] };
        existing.count++;
        existing.casts.push({
          author: cast.author?.username || "unknown",
          text: cast.text || "",
          timestamp: cast.timestamp || new Date().toISOString(),
          hash: cast.hash || "",
          likes: cast.reactions?.likes_count || 0,
          recasts: cast.reactions?.recasts_count || 0,
          replies: cast.replies?.count || 0,
        });
        tokenMentions.set(token, existing);
      }
    }

    // Filter by minimum mentions and sort by count
    const signals: SocialSignal[] = [];
    const sortedTokens = [...tokenMentions.entries()]
      .filter(([, data]) => data.count >= minMentions)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, limit);

    for (const [token, data] of sortedTokens) {
      // Aggregate sentiment from all casts
      const sentiments = data.casts.map((c) => analyzeSentiment(c.text));
      const positiveCount = sentiments.filter((s) => s === "positive").length;
      const negativeCount = sentiments.filter((s) => s === "negative").length;
      let overallSentiment: "positive" | "neutral" | "negative" = "neutral";
      if (positiveCount > negativeCount && positiveCount >= 2)
        overallSentiment = "positive";
      else if (negativeCount > positiveCount && negativeCount >= 2)
        overallSentiment = "negative";

      signals.push({
        token,
        mentions: data.count,
        sentiment: overallSentiment,
        sources: data.casts.slice(0, 5).map((c) => ({
          platform: "farcaster",
          author: c.author,
          text: c.text.slice(0, 280), // Truncate for display
          timestamp: c.timestamp,
          url: buildCastUrl(c.author, c.hash),
          engagement: {
            likes: c.likes,
            recasts: c.recasts,
            replies: c.replies,
          },
        })),
      });
    }

    return {
      success: true,
      signals,
      count: signals.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to fetch trending signals: ${message}`,
    };
  }
}

/**
 * Search for token mentions on Farcaster
 */
export async function handleSearchMentions(params: {
  query: string;
  limit?: number;
  sortBy?: "algorithmic" | "recent";
}): Promise<SearchMentionsResult> {
  const client = getNeynarClient();
  if (!client) {
    return {
      success: false,
      error:
        "NEYNAR_API_KEY not configured. Add it to your .env file. Get a key at https://neynar.com",
    };
  }

  try {
    const limit = params.limit || 20;
    const sortType =
      params.sortBy === "algorithmic" ? "algorithmic" : "desc_chron";

    // Search for casts mentioning the query
    const searchResponse = await client.searchCasts({
      q: params.query,
      sortType,
      limit,
    });

    const casts = searchResponse.result?.casts || [];

    // Aggregate by token
    const tokenData = new Map<
      string,
      {
        casts: Array<{
          author: string;
          text: string;
          timestamp: string;
          hash: string;
          likes: number;
          recasts: number;
          replies: number;
        }>;
      }
    >();

    for (const cast of casts) {
      const tokens = extractTokenMentions(cast.text || "");

      // If no tokens found but query matches a token pattern, use query
      const searchToken = params.query.replace("$", "").toUpperCase();
      if (tokens.length === 0 && searchToken.length <= 10) {
        tokens.push(searchToken);
      }

      for (const token of tokens) {
        const existing = tokenData.get(token) || { casts: [] };
        existing.casts.push({
          author: cast.author?.username || "unknown",
          text: cast.text || "",
          timestamp: cast.timestamp || new Date().toISOString(),
          hash: cast.hash || "",
          likes: cast.reactions?.likes_count || 0,
          recasts: cast.reactions?.recasts_count || 0,
          replies: cast.replies?.count || 0,
        });
        tokenData.set(token, existing);
      }
    }

    // Build signals
    const signals: SocialSignal[] = [];

    for (const [token, data] of tokenData.entries()) {
      const sentiments = data.casts.map((c) => analyzeSentiment(c.text));
      const positiveCount = sentiments.filter((s) => s === "positive").length;
      const negativeCount = sentiments.filter((s) => s === "negative").length;
      let overallSentiment: "positive" | "neutral" | "negative" = "neutral";
      if (positiveCount > negativeCount && positiveCount >= 2)
        overallSentiment = "positive";
      else if (negativeCount > positiveCount && negativeCount >= 2)
        overallSentiment = "negative";

      signals.push({
        token,
        mentions: data.casts.length,
        sentiment: overallSentiment,
        sources: data.casts.slice(0, 5).map((c) => ({
          platform: "farcaster",
          author: c.author,
          text: c.text.slice(0, 280),
          timestamp: c.timestamp,
          url: buildCastUrl(c.author, c.hash),
          engagement: {
            likes: c.likes,
            recasts: c.recasts,
            replies: c.replies,
          },
        })),
      });
    }

    // Sort by mentions
    signals.sort((a, b) => b.mentions - a.mentions);

    return {
      success: true,
      signals: signals.slice(0, limit),
      count: signals.length,
      query: params.query,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to search mentions: ${message}`,
    };
  }
}

/**
 * Get trending topics from Farcaster
 */
export async function handleTrendingTopics(params: {
  limit?: number;
}): Promise<{
  success: boolean;
  topics?: Array<{ topic: string; slug: string }>;
  error?: string;
}> {
  const client = getNeynarClient();
  if (!client) {
    return {
      success: false,
      error:
        "NEYNAR_API_KEY not configured. Add it to your .env file. Get a key at https://neynar.com",
    };
  }

  try {
    const response = await client.listTrendingTopics({
      limit: params.limit || 10,
    });

    const topics = (response.topics || []).map((t) => ({
      topic: t.name,
      slug: t.slug,
    }));

    return {
      success: true,
      topics,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to fetch trending topics: ${message}`,
    };
  }
}
