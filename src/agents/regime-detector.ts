/**
 * Market Regime Detector - Automatic market regime classification
 *
 * Detects current market regime (bull/bear/range/volatile) using:
 * - Moving average slopes (EMA20, EMA50)
 * - Volatility indicators (ATR, price range)
 * - Trend strength metrics
 *
 * Provides confidence scores for regime classification.
 * Results are cached for 1 hour to avoid excessive recalculation.
 *
 * Part of Phase 3: Intelligence Layer
 */

import { z } from "zod";

// ============================================================================
// Types
// ============================================================================

export const MarketRegimeSchema = z.enum(["bull", "bear", "range", "volatile"]);
export type MarketRegime = z.infer<typeof MarketRegimeSchema>;

export interface RegimeResult {
  regime: MarketRegime;
  confidence: number; // 0-1
  symbol: string;
  timestamp: string;
  indicators: {
    ema20Slope: number;
    ema50Slope: number;
    atr14: number;
    priceRangePct: number;
    trendStrength: number;
  };
  reasoning: string;
}

export interface PriceBar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface CacheEntry {
  result: RegimeResult;
  expiresAt: number;
}

// ============================================================================
// Regime Detector
// ============================================================================

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Market Regime Detector
 *
 * Analyzes price data to classify the current market regime.
 * Uses moving average analysis and volatility indicators.
 */
export class RegimeDetector {
  private cache: Map<string, CacheEntry> = new Map();
  private priceDataProvider: (symbol: string, bars: number) => Promise<PriceBar[]>;

  constructor(priceDataProvider: (symbol: string, bars: number) => Promise<PriceBar[]>) {
    this.priceDataProvider = priceDataProvider;
  }

  /**
   * Detect the current market regime for a symbol
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param forceRefresh - Bypass cache and recalculate
   * @returns RegimeResult with regime, confidence, and indicators
   */
  async detectRegime(symbol: string, forceRefresh = false): Promise<RegimeResult> {
    const cacheKey = symbol.toUpperCase();

    // Check cache
    if (!forceRefresh) {
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.result;
      }
    }

    // Fetch price data (need at least 60 bars for EMA50 + buffer)
    const bars = await this.priceDataProvider(symbol, 60);
    if (bars.length < 50) {
      throw new Error(`Insufficient price data for ${symbol}: need 50+ bars, got ${bars.length}`);
    }

    // Calculate indicators
    const closes = bars.map((b) => b.close);
    const highs = bars.map((b) => b.high);
    const lows = bars.map((b) => b.low);

    const ema20 = this.calculateEMA(closes, 20);
    const ema50 = this.calculateEMA(closes, 50);
    const atr14 = this.calculateATR(highs, lows, closes, 14);

    // Calculate slopes (recent 5 bars)
    const ema20Slope = this.calculateSlope(ema20.slice(-5));
    const ema50Slope = this.calculateSlope(ema50.slice(-5));

    // Price range percentage (high-low range over last 20 bars)
    const recentHighs = highs.slice(-20);
    const recentLows = lows.slice(-20);
    const highestHigh = Math.max(...recentHighs);
    const lowestLow = Math.min(...recentLows);
    const avgPrice = (highestHigh + lowestLow) / 2;
    const priceRangePct = ((highestHigh - lowestLow) / avgPrice) * 100;

    // Trend strength: how aligned are EMA20 and EMA50 slopes?
    const trendStrength = Math.min(
      1,
      Math.abs(ema20Slope + ema50Slope) / 2 / (Math.abs(ema20Slope) + Math.abs(ema50Slope) + 0.001)
    );

    // Current ATR as percentage of price
    const currentATR = atr14[atr14.length - 1];
    const currentPrice = closes[closes.length - 1];
    const atrPct = (currentATR / currentPrice) * 100;

    // Determine regime
    const { regime, confidence, reasoning } = this.classifyRegime({
      ema20Slope,
      ema50Slope,
      atrPct,
      priceRangePct,
      trendStrength,
    });

    const result: RegimeResult = {
      regime,
      confidence,
      symbol: cacheKey,
      timestamp: new Date().toISOString(),
      indicators: {
        ema20Slope: Math.round(ema20Slope * 10000) / 10000,
        ema50Slope: Math.round(ema50Slope * 10000) / 10000,
        atr14: Math.round(currentATR * 100) / 100,
        priceRangePct: Math.round(priceRangePct * 100) / 100,
        trendStrength: Math.round(trendStrength * 100) / 100,
      },
      reasoning,
    };

    // Cache result
    this.cache.set(cacheKey, {
      result,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return result;
  }

  /**
   * Get cached regime without recalculating
   */
  getCachedRegime(symbol: string): RegimeResult | null {
    const cached = this.cache.get(symbol.toUpperCase());
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }
    return null;
  }

  /**
   * Clear cache for a symbol or all symbols
   */
  clearCache(symbol?: string): void {
    if (symbol) {
      this.cache.delete(symbol.toUpperCase());
    } else {
      this.cache.clear();
    }
  }

  /**
   * Classify regime based on indicators
   */
  private classifyRegime(indicators: {
    ema20Slope: number;
    ema50Slope: number;
    atrPct: number;
    priceRangePct: number;
    trendStrength: number;
  }): { regime: MarketRegime; confidence: number; reasoning: string } {
    const { ema20Slope, ema50Slope, atrPct, priceRangePct, trendStrength } = indicators;

    // Thresholds (adjust based on asset class if needed)
    const SLOPE_BULL_THRESHOLD = 0.001;
    const SLOPE_BEAR_THRESHOLD = -0.001;
    const HIGH_VOLATILITY_ATR_PCT = 3; // 3% ATR is considered volatile
    const RANGE_BOUND_RANGE_PCT = 10; // <10% range over 20 bars suggests ranging

    // Scoring
    let bullScore = 0;
    let bearScore = 0;
    let rangeScore = 0;
    let volatileScore = 0;

    // Trend direction from EMAs
    if (ema20Slope > SLOPE_BULL_THRESHOLD && ema50Slope > SLOPE_BULL_THRESHOLD) {
      bullScore += 2;
    } else if (ema20Slope < SLOPE_BEAR_THRESHOLD && ema50Slope < SLOPE_BEAR_THRESHOLD) {
      bearScore += 2;
    } else if (Math.abs(ema20Slope) < SLOPE_BULL_THRESHOLD && Math.abs(ema50Slope) < SLOPE_BULL_THRESHOLD) {
      rangeScore += 2;
    }

    // EMA alignment (both moving in same direction strongly)
    if (trendStrength > 0.7) {
      if (ema20Slope > 0) bullScore += 1;
      else if (ema20Slope < 0) bearScore += 1;
    } else {
      rangeScore += 1;
    }

    // Volatility check
    if (atrPct > HIGH_VOLATILITY_ATR_PCT) {
      volatileScore += 2;
    }

    // Price range compression suggests ranging
    if (priceRangePct < RANGE_BOUND_RANGE_PCT) {
      rangeScore += 1;
    } else if (priceRangePct > 20) {
      volatileScore += 1;
    }

    // Determine winner
    const scores = [
      { regime: "bull" as MarketRegime, score: bullScore },
      { regime: "bear" as MarketRegime, score: bearScore },
      { regime: "range" as MarketRegime, score: rangeScore },
      { regime: "volatile" as MarketRegime, score: volatileScore },
    ];

    scores.sort((a, b) => b.score - a.score);
    const winner = scores[0];
    const runnerUp = scores[1];

    // Confidence based on margin of victory
    const maxPossibleScore = 4; // Approximate max
    const scoreDiff = winner.score - runnerUp.score;
    const baseConfidence = winner.score / maxPossibleScore;
    const marginBonus = scoreDiff / maxPossibleScore;
    const confidence = Math.min(1, Math.max(0.2, baseConfidence * 0.6 + marginBonus * 0.4));

    // Generate reasoning
    const reasoning = this.generateReasoning(winner.regime, indicators, confidence);

    return {
      regime: winner.regime,
      confidence: Math.round(confidence * 100) / 100,
      reasoning,
    };
  }

  /**
   * Generate human-readable reasoning for the classification
   */
  private generateReasoning(
    regime: MarketRegime,
    indicators: {
      ema20Slope: number;
      ema50Slope: number;
      atrPct: number;
      priceRangePct: number;
      trendStrength: number;
    },
    confidence: number
  ): string {
    const { ema20Slope, ema50Slope, atrPct, priceRangePct, trendStrength } = indicators;

    const parts: string[] = [];

    switch (regime) {
      case "bull":
        parts.push("Upward trend detected.");
        if (ema20Slope > 0 && ema50Slope > 0) {
          parts.push("Both EMA20 and EMA50 slopes are positive.");
        }
        if (trendStrength > 0.7) {
          parts.push("Strong trend alignment between moving averages.");
        }
        break;

      case "bear":
        parts.push("Downward trend detected.");
        if (ema20Slope < 0 && ema50Slope < 0) {
          parts.push("Both EMA20 and EMA50 slopes are negative.");
        }
        if (trendStrength > 0.7) {
          parts.push("Strong bearish alignment between moving averages.");
        }
        break;

      case "range":
        parts.push("Range-bound market detected.");
        if (Math.abs(ema20Slope) < 0.001) {
          parts.push("EMA20 slope is flat.");
        }
        if (priceRangePct < 10) {
          parts.push(`Price range compressed to ${priceRangePct.toFixed(1)}% over 20 bars.`);
        }
        break;

      case "volatile":
        parts.push("High volatility regime detected.");
        if (atrPct > 3) {
          parts.push(`ATR at ${atrPct.toFixed(1)}% of price indicates elevated volatility.`);
        }
        if (priceRangePct > 20) {
          parts.push(`Wide price range of ${priceRangePct.toFixed(1)}% over 20 bars.`);
        }
        break;
    }

    if (confidence < 0.5) {
      parts.push("Classification confidence is low; regime may be transitioning.");
    }

    return parts.join(" ");
  }

  // ============================================================================
  // Technical Indicators
  // ============================================================================

  /**
   * Calculate Exponential Moving Average
   */
  private calculateEMA(prices: number[], period: number): number[] {
    if (prices.length < period) {
      return [];
    }

    const multiplier = 2 / (period + 1);
    const ema: number[] = [];

    // Start with SMA for first value
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += prices[i];
    }
    ema.push(sum / period);

    // Calculate EMA for remaining values
    for (let i = period; i < prices.length; i++) {
      const value = (prices[i] - ema[ema.length - 1]) * multiplier + ema[ema.length - 1];
      ema.push(value);
    }

    return ema;
  }

  /**
   * Calculate Average True Range
   */
  private calculateATR(
    highs: number[],
    lows: number[],
    closes: number[],
    period: number
  ): number[] {
    if (highs.length < period + 1) {
      return [];
    }

    const trueRanges: number[] = [];

    // Calculate True Range for each bar
    for (let i = 1; i < highs.length; i++) {
      const highLow = highs[i] - lows[i];
      const highClose = Math.abs(highs[i] - closes[i - 1]);
      const lowClose = Math.abs(lows[i] - closes[i - 1]);
      trueRanges.push(Math.max(highLow, highClose, lowClose));
    }

    // Calculate ATR as EMA of True Range
    return this.calculateEMA(trueRanges, period);
  }

  /**
   * Calculate slope of a series using linear regression
   */
  private calculateSlope(values: number[]): number {
    if (values.length < 2) {
      return 0;
    }

    const n = values.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumX2 += i * i;
    }

    const denominator = n * sumX2 - sumX * sumX;
    if (denominator === 0) {
      return 0;
    }

    const slope = (n * sumXY - sumX * sumY) / denominator;

    // Normalize by average value to get percentage slope
    const avgValue = sumY / n;
    return avgValue !== 0 ? slope / avgValue : 0;
  }
}

// ============================================================================
// Factory and Helpers
// ============================================================================

/**
 * Create a regime detector with a mock price provider for testing
 */
export function createMockRegimeDetector(): RegimeDetector {
  const mockPriceProvider = async (symbol: string, bars: number): Promise<PriceBar[]> => {
    const symbolHash = symbol.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const basePrice = symbolHash % 1000 + 100;
    const now = Date.now();
    const result: PriceBar[] = [];

    for (let i = bars - 1; i >= 0; i--) {
      const timestamp = now - i * 3600000; // 1h bars
      const trend = Math.sin(i / 10) * 0.02; // Gentle trend oscillation
      const noise = (Math.random() - 0.5) * 0.01;
      const priceOffset = 1 + trend + noise;
      const close = basePrice * priceOffset;
      const volatility = basePrice * 0.01;

      result.push({
        timestamp,
        open: close - volatility * (Math.random() - 0.5),
        high: close + volatility * Math.random(),
        low: close - volatility * Math.random(),
        close,
        volume: 1000000 + Math.random() * 500000,
      });
    }

    return result;
  };

  return new RegimeDetector(mockPriceProvider);
}

/**
 * Create a regime detector with a custom price data provider
 */
export function createRegimeDetector(
  priceDataProvider: (symbol: string, bars: number) => Promise<PriceBar[]>
): RegimeDetector {
  return new RegimeDetector(priceDataProvider);
}
