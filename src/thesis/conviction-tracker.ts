/**
 * Conviction Tracker - Track how conviction evolves over time
 *
 * Tracks:
 * - Conviction changes with timestamps and reasons
 * - Conviction vs position sizing mismatch detection
 * - Historical conviction trends per thesis
 *
 * Persists data to .sessions/conviction-history.json
 *
 * Part of Phase 4: Thesis Trading Layer
 */

import { z } from "zod";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { TradingThesis } from "./types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * A recorded conviction change
 */
export const ConvictionChangeSchema = z.object({
  id: z.string().uuid(),
  thesisId: z.string().uuid(),
  thesisTitle: z.string(),
  oldConviction: z.number().min(0).max(100),
  newConviction: z.number().min(0).max(100),
  changeAmount: z.number(), // newConviction - oldConviction
  reason: z.string(),
  timestamp: z.string().datetime(),
  marketContext: z.string().optional(), // What was happening in the market
});

export type ConvictionChange = z.infer<typeof ConvictionChangeSchema>;

/**
 * Conviction history data structure
 */
export const ConvictionHistoryDataSchema = z.object({
  changes: z.array(ConvictionChangeSchema),
  lastUpdated: z.string().datetime(),
  version: z.number(),
});

export type ConvictionHistoryData = z.infer<typeof ConvictionHistoryDataSchema>;

/**
 * Mismatch between conviction and position sizing
 */
export const ConvictionMismatchSchema = z.object({
  thesisId: z.string().uuid(),
  thesisTitle: z.string(),
  conviction: z.number(),
  targetAllocation: z.number(),
  currentAllocation: z.number(),
  mismatchType: z.enum(["underexposed", "overexposed", "aligned"]),
  mismatchScore: z.number(), // 0 = aligned, positive = overexposed, negative = underexposed
  recommendation: z.string(),
  timestamp: z.string().datetime(),
});

export type ConvictionMismatch = z.infer<typeof ConvictionMismatchSchema>;

/**
 * Conviction trend analysis
 */
export interface ConvictionTrend {
  thesisId: string;
  thesisTitle: string;
  startConviction: number;
  endConviction: number;
  netChange: number;
  changeCount: number;
  averageChange: number;
  trend: "increasing" | "decreasing" | "stable";
  volatility: number; // Standard deviation of changes
  period: {
    start: string;
    end: string;
    days: number;
  };
}

// ============================================================================
// Conviction Tracker Class
// ============================================================================

export class ConvictionTracker {
  private data: ConvictionHistoryData;
  private dataPath: string;

  constructor(sessionDir: string = ".sessions") {
    this.dataPath = join(sessionDir, "conviction-history.json");
    this.data = this.loadData();
  }

  /**
   * Load conviction history from disk
   */
  private loadData(): ConvictionHistoryData {
    try {
      if (existsSync(this.dataPath)) {
        const raw = readFileSync(this.dataPath, "utf-8");
        const parsed = ConvictionHistoryDataSchema.safeParse(JSON.parse(raw));
        if (parsed.success) {
          return parsed.data;
        }
      }
    } catch {
      // Ignore errors, start fresh
    }

    return {
      changes: [],
      lastUpdated: new Date().toISOString(),
      version: 1,
    };
  }

  /**
   * Save conviction history to disk
   */
  private saveData(): void {
    const dir = this.dataPath.replace(/\/[^/]+$/, "");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    this.data.lastUpdated = new Date().toISOString();
    writeFileSync(this.dataPath, JSON.stringify(this.data, null, 2));
  }

  /**
   * Record a conviction change
   */
  recordConvictionChange(
    thesis: TradingThesis,
    newConviction: number,
    reason: string,
    marketContext?: string
  ): ConvictionChange {
    const change: ConvictionChange = {
      id: crypto.randomUUID(),
      thesisId: thesis.id,
      thesisTitle: thesis.title,
      oldConviction: thesis.conviction,
      newConviction,
      changeAmount: newConviction - thesis.conviction,
      reason,
      timestamp: new Date().toISOString(),
      marketContext,
    };

    this.data.changes.push(change);
    this.saveData();

    return change;
  }

  /**
   * Get conviction history for a thesis
   */
  getConvictionHistory(thesisId: string): ConvictionChange[] {
    return this.data.changes
      .filter((c) => c.thesisId === thesisId)
      .sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
  }

  /**
   * Get all conviction changes
   */
  getAllChanges(): ConvictionChange[] {
    return [...this.data.changes].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  /**
   * Get recent changes across all theses
   */
  getRecentChanges(limit: number = 10): ConvictionChange[] {
    return this.getAllChanges().slice(0, limit);
  }

  /**
   * Detect mismatch between conviction and position sizing
   *
   * High conviction + small position = underexposed
   * Low conviction + large position = overexposed
   */
  detectMismatch(thesis: TradingThesis): ConvictionMismatch {
    const conviction = thesis.conviction;
    const targetAllocation = thesis.targetAllocation;
    const currentAllocation = thesis.metrics.currentAllocation;

    // Calculate expected allocation based on conviction
    // Higher conviction should correlate with larger allocation
    // Using simple linear relationship: expectedAllocation = conviction * (targetAllocation / 100)
    const convictionFactor = conviction / 100;
    const expectedAllocation = targetAllocation * convictionFactor;

    // Calculate mismatch score
    // Positive = overexposed (current > expected)
    // Negative = underexposed (current < expected)
    const mismatchScore = currentAllocation - expectedAllocation;

    // Determine mismatch type with tolerance
    const tolerance = 5; // 5% tolerance
    let mismatchType: "underexposed" | "overexposed" | "aligned";
    let recommendation: string;

    if (Math.abs(mismatchScore) <= tolerance) {
      mismatchType = "aligned";
      recommendation = "Position sizing is well-aligned with conviction level.";
    } else if (mismatchScore > tolerance) {
      mismatchType = "overexposed";
      recommendation = `Consider reducing position by ${mismatchScore.toFixed(1)}% to match conviction level of ${conviction}%.`;
    } else {
      mismatchType = "underexposed";
      recommendation = `Consider increasing position by ${Math.abs(mismatchScore).toFixed(1)}% to match conviction level of ${conviction}%.`;
    }

    return {
      thesisId: thesis.id,
      thesisTitle: thesis.title,
      conviction,
      targetAllocation,
      currentAllocation,
      mismatchType,
      mismatchScore,
      recommendation,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Analyze conviction trend for a thesis
   */
  analyzeConvictionTrend(
    thesisId: string,
    initialConviction: number
  ): ConvictionTrend | null {
    const history = this.getConvictionHistory(thesisId);

    if (history.length === 0) {
      return null;
    }

    const firstChange = history[0];
    const lastChange = history[history.length - 1];

    // Calculate statistics
    const changes = history.map((c) => c.changeAmount);
    const netChange = lastChange.newConviction - initialConviction;
    const averageChange =
      changes.reduce((sum, c) => sum + c, 0) / changes.length;

    // Calculate volatility (standard deviation)
    const squaredDiffs = changes.map((c) => Math.pow(c - averageChange, 2));
    const avgSquaredDiff =
      squaredDiffs.reduce((sum, d) => sum + d, 0) / squaredDiffs.length;
    const volatility = Math.sqrt(avgSquaredDiff);

    // Determine trend
    let trend: "increasing" | "decreasing" | "stable";
    if (netChange > 10) {
      trend = "increasing";
    } else if (netChange < -10) {
      trend = "decreasing";
    } else {
      trend = "stable";
    }

    // Calculate period
    const startDate = new Date(firstChange.timestamp);
    const endDate = new Date(lastChange.timestamp);
    const days = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    return {
      thesisId,
      thesisTitle: firstChange.thesisTitle,
      startConviction: initialConviction,
      endConviction: lastChange.newConviction,
      netChange,
      changeCount: history.length,
      averageChange,
      trend,
      volatility,
      period: {
        start: firstChange.timestamp,
        end: lastChange.timestamp,
        days,
      },
    };
  }

  /**
   * Get theses with significant conviction changes
   */
  getSignificantChanges(
    threshold: number = 15
  ): { thesisId: string; totalChange: number }[] {
    const changesByThesis = new Map<string, number>();

    for (const change of this.data.changes) {
      const current = changesByThesis.get(change.thesisId) || 0;
      changesByThesis.set(change.thesisId, current + change.changeAmount);
    }

    return Array.from(changesByThesis.entries())
      .filter(([_, totalChange]) => Math.abs(totalChange) >= threshold)
      .map(([thesisId, totalChange]) => ({ thesisId, totalChange }))
      .sort((a, b) => Math.abs(b.totalChange) - Math.abs(a.totalChange));
  }

  /**
   * Clear all conviction history
   */
  clear(): void {
    this.data = {
      changes: [],
      lastUpdated: new Date().toISOString(),
      version: 1,
    };
    this.saveData();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let trackerInstance: ConvictionTracker | null = null;

/**
 * Get the conviction tracker instance
 */
export function getConvictionTracker(
  sessionDir?: string
): ConvictionTracker {
  if (!trackerInstance) {
    trackerInstance = new ConvictionTracker(sessionDir);
  }
  return trackerInstance;
}

/**
 * Initialize the conviction tracker with a specific session directory
 */
export function initializeConvictionTracker(
  sessionDir: string
): ConvictionTracker {
  trackerInstance = new ConvictionTracker(sessionDir);
  return trackerInstance;
}

// ============================================================================
// Formatting Utilities
// ============================================================================

/**
 * Format conviction change as readable string
 */
export function formatConvictionChange(change: ConvictionChange): string {
  const direction = change.changeAmount >= 0 ? "+" : "";
  return `[${new Date(change.timestamp).toLocaleDateString()}] ${change.thesisTitle}: ${change.oldConviction}% → ${change.newConviction}% (${direction}${change.changeAmount}%) - ${change.reason}`;
}

/**
 * Format conviction trend as readable string
 */
export function formatConvictionTrend(trend: ConvictionTrend): string {
  const lines: string[] = [];
  lines.push(`\n=== Conviction Trend: ${trend.thesisTitle} ===`);
  lines.push(`Period: ${trend.period.days} days`);
  lines.push(`Start → End: ${trend.startConviction}% → ${trend.endConviction}%`);
  lines.push(`Net Change: ${trend.netChange >= 0 ? "+" : ""}${trend.netChange.toFixed(1)}%`);
  lines.push(`Trend: ${trend.trend.toUpperCase()}`);
  lines.push(`Changes: ${trend.changeCount} total`);
  lines.push(`Volatility: ${trend.volatility.toFixed(2)}`);
  return lines.join("\n");
}

/**
 * Format mismatch report as readable string
 */
export function formatMismatchReport(mismatch: ConvictionMismatch): string {
  const icon =
    mismatch.mismatchType === "aligned"
      ? "✅"
      : mismatch.mismatchType === "overexposed"
      ? "⚠️"
      : "📉";

  const lines: string[] = [];
  lines.push(`\n${icon} ${mismatch.thesisTitle}`);
  lines.push(`Conviction: ${mismatch.conviction}%`);
  lines.push(`Target Allocation: ${mismatch.targetAllocation}%`);
  lines.push(`Current Allocation: ${mismatch.currentAllocation}%`);
  lines.push(`Status: ${mismatch.mismatchType.toUpperCase()}`);
  lines.push(`Recommendation: ${mismatch.recommendation}`);
  return lines.join("\n");
}
