/**
 * Token Discovery
 *
 * Search Jupiter token list to find tokens by name/symbol.
 * Includes safety warnings for similar-name tokens.
 */

import * as fs from "fs";
import * as path from "path";

const JUPITER_TOKEN_LIST = "https://token.jup.ag/all";
const CACHE_FILE = path.join(process.cwd(), ".donut-token-cache.json");
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

interface JupiterToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  tags?: string[];
}

interface TokenCache {
  timestamp: number;
  tokens: JupiterToken[];
}

// Popular tokens that scammers often imitate
const POPULAR_TOKENS = [
  "SOL",
  "USDC",
  "USDT",
  "BONK",
  "WIF",
  "JUP",
  "PYTH",
  "RAY",
  "ORCA",
  "MNGO",
  "SRM",
  "SAMO",
  "COPE",
  "FIDA",
  "STEP",
];

export interface TokenSearchResult {
  success: boolean;
  query: string;
  results: Array<{
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    logoURI?: string;
    warning?: string;
  }>;
  totalMatches: number;
  warning?: string;
}

/**
 * Load token list from cache or fetch fresh
 */
async function loadTokenList(): Promise<JupiterToken[]> {
  // Try to load from cache
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const cacheData = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8")) as TokenCache;
      if (Date.now() - cacheData.timestamp < CACHE_TTL) {
        return cacheData.tokens;
      }
    }
  } catch {
    // Cache read failed, continue to fetch
  }

  // Fetch fresh token list
  try {
    const response = await fetch(JUPITER_TOKEN_LIST);
    if (!response.ok) {
      throw new Error(`Failed to fetch token list: ${response.statusText}`);
    }

    const tokens = (await response.json()) as JupiterToken[];

    // Cache the results
    try {
      const cacheData: TokenCache = {
        timestamp: Date.now(),
        tokens,
      };
      fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData));
    } catch {
      // Cache write failed, continue anyway
    }

    return tokens;
  } catch (error) {
    // If fetch fails and we have old cache, use it
    try {
      if (fs.existsSync(CACHE_FILE)) {
        const cacheData = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8")) as TokenCache;
        return cacheData.tokens;
      }
    } catch {
      // Cache read also failed
    }

    throw error;
  }
}

/**
 * Check if a token name/symbol is similar to a popular token
 */
function checkSimilarToPopular(symbol: string, name: string): string | undefined {
  const normalizedSymbol = symbol.toUpperCase();
  const normalizedName = name.toLowerCase();

  for (const popular of POPULAR_TOKENS) {
    const popularLower = popular.toLowerCase();

    // Exact match is fine
    if (normalizedSymbol === popular) {
      continue;
    }

    // Check for similar symbols (e.g., S0L vs SOL, USDC2 vs USDC)
    if (
      (normalizedSymbol.includes(popular) && normalizedSymbol !== popular) ||
      (levenshteinDistance(normalizedSymbol, popular) <= 1 && normalizedSymbol !== popular)
    ) {
      return `Similar to popular token ${popular}. Verify contract address carefully!`;
    }

    // Check for names containing popular token
    if (
      normalizedName.includes(popularLower) &&
      normalizedSymbol !== popular
    ) {
      return `Name contains "${popular}". This may be a different token - verify address!`;
    }
  }

  return undefined;
}

/**
 * Simple Levenshtein distance for string similarity
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Search for tokens by name or symbol
 */
export async function handleTokenSearch(query: string): Promise<TokenSearchResult> {
  if (!query || query.length < 1) {
    return {
      success: false,
      query,
      results: [],
      totalMatches: 0,
      warning: "Search query must be at least 1 character",
    };
  }

  try {
    const tokens = await loadTokenList();
    const normalizedQuery = query.toLowerCase();

    // Score and sort matches
    const scored = tokens
      .map((token) => {
        const symbolLower = token.symbol.toLowerCase();
        const nameLower = token.name.toLowerCase();

        let score = 0;

        // Exact symbol match gets highest score
        if (symbolLower === normalizedQuery) {
          score = 100;
        }
        // Symbol starts with query
        else if (symbolLower.startsWith(normalizedQuery)) {
          score = 80;
        }
        // Name starts with query
        else if (nameLower.startsWith(normalizedQuery)) {
          score = 60;
        }
        // Symbol contains query
        else if (symbolLower.includes(normalizedQuery)) {
          score = 40;
        }
        // Name contains query
        else if (nameLower.includes(normalizedQuery)) {
          score = 20;
        }

        // Boost verified/popular tokens
        if (token.tags?.includes("verified")) {
          score += 5;
        }

        return { token, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    const totalMatches = scored.length;
    const topResults = scored.slice(0, 5);

    const results = topResults.map(({ token }) => ({
      address: token.address,
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
      logoURI: token.logoURI,
      warning: checkSimilarToPopular(token.symbol, token.name),
    }));

    // Check if multiple tokens have same symbol
    const symbolCounts: Record<string, number> = {};
    for (const result of results) {
      symbolCounts[result.symbol] = (symbolCounts[result.symbol] || 0) + 1;
    }

    let warning: string | undefined;
    const duplicateSymbols = Object.entries(symbolCounts)
      .filter(([, count]) => count > 1)
      .map(([symbol]) => symbol);

    if (duplicateSymbols.length > 0) {
      warning = `Multiple tokens found with symbol(s): ${duplicateSymbols.join(", ")}. Always verify the contract address before trading!`;
    }

    return {
      success: true,
      query,
      results,
      totalMatches,
      warning,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      query,
      results: [],
      totalMatches: 0,
      warning: `Search failed: ${message}`,
    };
  }
}
