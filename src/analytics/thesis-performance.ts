/**
 * Thesis Performance Analytics - Analyze historical thesis performance
 *
 * Provides analytics for:
 * - Individual thesis P&L and ROI calculation
 * - Ranking theses by performance
 * - Thesis outcome analysis (accuracy by timeframe)
 * - Conviction calibration (was high conviction = high returns?)
 *
 * Part of Phase 4: Thesis Trading Layer
 */

import { z } from "zod";
import {
  TradingThesis,
  ThesisStatus,
  ThesisTimeframe,
  getThesisDaysActive,
} from "../thesis/types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Performance metrics for a single thesis
 */
export const ThesisPerformanceSchema = z.object({
  thesisId: z.string().uuid(),
  thesisTitle: z.string(),
  status: z.enum(["draft", "active", "invalidated", "closed"]),
  timeframe: z.enum(["days", "weeks", "months", "years"]),

  // P&L metrics
  totalPnl: z.number(),
  realizedPnl: z.number(),
  unrealizedPnl: z.number(),
  roiPercent: z.number(), // Return on initial allocation

  // Position metrics
  positionCount: z.number().int(),
  winningPositions: z.number().int(),
  losingPositions: z.number().int(),
  winRate: z.number().min(0).max(100),

  // Thesis metrics
  initialConviction: z.number().min(0).max(100),
  finalConviction: z.number().min(0).max(100).optional(),
  wasCorrect: z.boolean().optional(), // Did the thesis play out?

  // Time metrics
  duration: z.number().int(), // Days active
  expectedDuration: z.number().int(), // Max expected based on timeframe
  durationEfficiency: z.number(), // How much of expected time was used

  // Risk metrics
  maxDrawdown: z.number(),
  sharpeRatio: z.number().optional(),

  // Timestamps
  createdAt: z.string().datetime(),
  closedAt: z.string().datetime().optional(),
  analyzedAt: z.string().datetime(),
});

export type ThesisPerformance = z.infer<typeof ThesisPerformanceSchema>;

/**
 * Thesis outcome for accuracy tracking
 */
export const ThesisOutcomeSchema = z.object({
  thesisId: z.string().uuid(),
  timeframe: z.enum(["days", "weeks", "months", "years"]),
  initialConviction: z.number(),
  finalPnl: z.number(),
  wasCorrect: z.boolean(),
  closedReason: z.enum(["target_reached", "invalidated", "timeout", "manual"]),
});

export type ThesisOutcome = z.infer<typeof ThesisOutcomeSchema>;

/**
 * Conviction calibration analysis
 */
export interface ConvictionCalibration {
  bucket: string; // e.g., "80-100%"
  thesesCount: number;
  avgConviction: number;
  avgPnl: number;
  avgRoi: number;
  winRate: number;
  wasCalibrated: boolean; // Did conviction correlate with returns?
}

/**
 * Full performance report
 */
export interface ThesisPerformanceReport {
  summary: {
    totalTheses: number;
    activeTheses: number;
    closedTheses: number;
    totalPnl: number;
    avgRoi: number;
    overallWinRate: number;
    avgConviction: number;
  };
  rankings: ThesisPerformance[];
  byTimeframe: Record<ThesisTimeframe, {
    count: number;
    avgPnl: number;
    winRate: number;
  }>;
  calibration: ConvictionCalibration[];
  bestThesis: ThesisPerformance | null;
  worstThesis: ThesisPerformance | null;
  generatedAt: string;
}

// ============================================================================
// Performance Calculation Functions
// ============================================================================

/**
 * Calculate performance metrics for a single thesis
 */
export function calculateThesisPerformance(
  thesis: TradingThesis
): ThesisPerformance {
  const duration = getThesisDaysActive(thesis);
  const expectedDuration = getExpectedDurationDays(thesis.timeframe);

  // Calculate win rate
  const totalPositions = thesis.metrics.positionCount;
  const winRate =
    totalPositions > 0
      ? (thesis.metrics.winningPositions / totalPositions) * 100
      : 0;

  // Calculate ROI (return on target allocation)
  // ROI = (Total PnL / (Portfolio Value * Target Allocation %)) * 100
  // Simplified: using PnL / allocation as proxy
  const roiPercent =
    thesis.targetAllocation > 0
      ? (thesis.metrics.totalPnl / thesis.targetAllocation) * 100
      : 0;

  // Determine if thesis was correct (for closed theses)
  let wasCorrect: boolean | undefined;
  if (thesis.status === "closed") {
    wasCorrect = thesis.metrics.totalPnl > 0;
  } else if (thesis.status === "invalidated") {
    wasCorrect = false;
  }

  return {
    thesisId: thesis.id,
    thesisTitle: thesis.title,
    status: thesis.status,
    timeframe: thesis.timeframe,
    totalPnl: thesis.metrics.totalPnl,
    realizedPnl: thesis.metrics.realizedPnl,
    unrealizedPnl: thesis.metrics.unrealizedPnl,
    roiPercent,
    positionCount: thesis.metrics.positionCount,
    winningPositions: thesis.metrics.winningPositions,
    losingPositions: thesis.metrics.losingPositions,
    winRate,
    initialConviction: thesis.conviction, // Current conviction (ideally track initial)
    finalConviction: thesis.status === "closed" ? thesis.conviction : undefined,
    wasCorrect,
    duration,
    expectedDuration,
    durationEfficiency: expectedDuration > 0 ? duration / expectedDuration : 0,
    maxDrawdown: thesis.metrics.maxDrawdown,
    createdAt: thesis.createdAt,
    closedAt: thesis.closedAt,
    analyzedAt: new Date().toISOString(),
  };
}

/**
 * Rank theses by performance
 */
export function rankThesesByPerformance(
  theses: TradingThesis[],
  sortBy: "pnl" | "roi" | "winRate" = "roi"
): ThesisPerformance[] {
  const performances = theses.map(calculateThesisPerformance);

  // Sort by specified metric
  switch (sortBy) {
    case "pnl":
      performances.sort((a, b) => b.totalPnl - a.totalPnl);
      break;
    case "roi":
      performances.sort((a, b) => b.roiPercent - a.roiPercent);
      break;
    case "winRate":
      performances.sort((a, b) => b.winRate - a.winRate);
      break;
  }

  return performances;
}

/**
 * Analyze thesis outcomes by timeframe
 */
export function analyzeThesisOutcomes(
  theses: TradingThesis[]
): Record<ThesisTimeframe, { count: number; winRate: number; avgPnl: number }> {
  const byTimeframe: Record<
    ThesisTimeframe,
    { count: number; wins: number; totalPnl: number }
  > = {
    days: { count: 0, wins: 0, totalPnl: 0 },
    weeks: { count: 0, wins: 0, totalPnl: 0 },
    months: { count: 0, wins: 0, totalPnl: 0 },
    years: { count: 0, wins: 0, totalPnl: 0 },
  };

  // Only analyze closed/invalidated theses
  const completedTheses = theses.filter(
    (t) => t.status === "closed" || t.status === "invalidated"
  );

  for (const thesis of completedTheses) {
    const tf = byTimeframe[thesis.timeframe];
    tf.count++;
    tf.totalPnl += thesis.metrics.totalPnl;
    if (thesis.metrics.totalPnl > 0) {
      tf.wins++;
    }
  }

  // Calculate derived metrics
  const result: Record<
    ThesisTimeframe,
    { count: number; winRate: number; avgPnl: number }
  > = {
    days: { count: 0, winRate: 0, avgPnl: 0 },
    weeks: { count: 0, winRate: 0, avgPnl: 0 },
    months: { count: 0, winRate: 0, avgPnl: 0 },
    years: { count: 0, winRate: 0, avgPnl: 0 },
  };

  for (const tf of ["days", "weeks", "months", "years"] as ThesisTimeframe[]) {
    const data = byTimeframe[tf];
    result[tf] = {
      count: data.count,
      winRate: data.count > 0 ? (data.wins / data.count) * 100 : 0,
      avgPnl: data.count > 0 ? data.totalPnl / data.count : 0,
    };
  }

  return result;
}

/**
 * Analyze conviction calibration
 *
 * Checks if high conviction correlated with high returns
 */
export function analyzeConvictionCalibration(
  theses: TradingThesis[]
): ConvictionCalibration[] {
  // Define conviction buckets
  const buckets = [
    { label: "0-25%", min: 0, max: 25 },
    { label: "25-50%", min: 25, max: 50 },
    { label: "50-75%", min: 50, max: 75 },
    { label: "75-100%", min: 75, max: 100 },
  ];

  const calibration: ConvictionCalibration[] = [];

  for (const bucket of buckets) {
    const bucketTheses = theses.filter(
      (t) => t.conviction >= bucket.min && t.conviction < bucket.max
    );

    if (bucketTheses.length === 0) {
      calibration.push({
        bucket: bucket.label,
        thesesCount: 0,
        avgConviction: 0,
        avgPnl: 0,
        avgRoi: 0,
        winRate: 0,
        wasCalibrated: true, // No data, assume calibrated
      });
      continue;
    }

    const totalConviction = bucketTheses.reduce(
      (sum, t) => sum + t.conviction,
      0
    );
    const totalPnl = bucketTheses.reduce(
      (sum, t) => sum + t.metrics.totalPnl,
      0
    );
    const totalAllocation = bucketTheses.reduce(
      (sum, t) => sum + t.targetAllocation,
      0
    );
    const winners = bucketTheses.filter(
      (t) => t.metrics.totalPnl > 0
    ).length;

    const avgConviction = totalConviction / bucketTheses.length;
    const avgPnl = totalPnl / bucketTheses.length;
    const avgRoi =
      totalAllocation > 0
        ? (totalPnl / totalAllocation) * 100
        : 0;
    const winRate = (winners / bucketTheses.length) * 100;

    // Determine if calibrated: higher conviction buckets should have higher returns
    // This is a simplified check - in practice, use more sophisticated analysis
    const expectedReturn = (bucket.min + bucket.max) / 2 / 100; // Expected return proportional to conviction
    const wasCalibrated = avgRoi >= 0 || bucket.min < 50; // Lower conviction allowed to be negative

    calibration.push({
      bucket: bucket.label,
      thesesCount: bucketTheses.length,
      avgConviction,
      avgPnl,
      avgRoi,
      winRate,
      wasCalibrated,
    });
  }

  return calibration;
}

/**
 * Generate comprehensive thesis performance report
 */
export function generatePerformanceReport(
  theses: TradingThesis[]
): ThesisPerformanceReport {
  const performances = rankThesesByPerformance(theses, "roi");
  const byTimeframe = analyzeThesisOutcomes(theses);
  const calibration = analyzeConvictionCalibration(theses);

  // Calculate summary stats
  const activeTheses = theses.filter((t) => t.status === "active").length;
  const closedTheses = theses.filter(
    (t) => t.status === "closed" || t.status === "invalidated"
  ).length;
  const totalPnl = theses.reduce((sum, t) => sum + t.metrics.totalPnl, 0);

  const totalRoi = performances.reduce((sum, p) => sum + p.roiPercent, 0);
  const avgRoi = performances.length > 0 ? totalRoi / performances.length : 0;

  const totalWinRate = performances.reduce((sum, p) => sum + p.winRate, 0);
  const overallWinRate =
    performances.length > 0 ? totalWinRate / performances.length : 0;

  const totalConviction = theses.reduce((sum, t) => sum + t.conviction, 0);
  const avgConviction =
    theses.length > 0 ? totalConviction / theses.length : 0;

  return {
    summary: {
      totalTheses: theses.length,
      activeTheses,
      closedTheses,
      totalPnl,
      avgRoi,
      overallWinRate,
      avgConviction,
    },
    rankings: performances,
    byTimeframe,
    calibration,
    bestThesis: performances.length > 0 ? performances[0] : null,
    worstThesis:
      performances.length > 0 ? performances[performances.length - 1] : null,
    generatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get expected duration in days for a timeframe
 */
function getExpectedDurationDays(timeframe: ThesisTimeframe): number {
  const durations: Record<ThesisTimeframe, number> = {
    days: 7,
    weeks: 56,
    months: 365,
    years: 1825,
  };
  return durations[timeframe];
}

// ============================================================================
// Formatting Utilities
// ============================================================================

/**
 * Format thesis performance report as readable string
 */
export function formatThesisPerformanceReport(
  report: ThesisPerformanceReport
): string {
  const lines: string[] = [];

  lines.push("\n" + "=".repeat(60));
  lines.push("  THESIS PERFORMANCE REPORT");
  lines.push("=".repeat(60));
  lines.push(`Generated: ${new Date(report.generatedAt).toLocaleString()}`);
  lines.push("");

  // Summary
  lines.push("--- SUMMARY ---");
  lines.push(`Total Theses: ${report.summary.totalTheses}`);
  lines.push(`  Active: ${report.summary.activeTheses}`);
  lines.push(`  Closed: ${report.summary.closedTheses}`);
  lines.push(`Total P&L: $${report.summary.totalPnl.toFixed(2)}`);
  lines.push(`Avg ROI: ${report.summary.avgRoi.toFixed(1)}%`);
  lines.push(`Win Rate: ${report.summary.overallWinRate.toFixed(1)}%`);
  lines.push(`Avg Conviction: ${report.summary.avgConviction.toFixed(0)}%`);
  lines.push("");

  // Rankings
  lines.push("--- TOP PERFORMERS ---");
  const topN = report.rankings.slice(0, 5);
  for (let i = 0; i < topN.length; i++) {
    const p = topN[i];
    const pnlSign = p.totalPnl >= 0 ? "+" : "";
    lines.push(
      `${i + 1}. ${p.thesisTitle} (${p.status})`
    );
    lines.push(
      `   P&L: ${pnlSign}$${p.totalPnl.toFixed(2)} | ROI: ${p.roiPercent.toFixed(1)}% | Win Rate: ${p.winRate.toFixed(0)}%`
    );
  }
  lines.push("");

  // By Timeframe
  lines.push("--- BY TIMEFRAME ---");
  for (const [tf, data] of Object.entries(report.byTimeframe)) {
    if (data.count > 0) {
      lines.push(
        `${tf.toUpperCase()}: ${data.count} theses | Win Rate: ${data.winRate.toFixed(0)}% | Avg P&L: $${data.avgPnl.toFixed(2)}`
      );
    }
  }
  lines.push("");

  // Calibration
  lines.push("--- CONVICTION CALIBRATION ---");
  for (const bucket of report.calibration) {
    if (bucket.thesesCount > 0) {
      const status = bucket.wasCalibrated ? "✓" : "✗";
      lines.push(
        `${bucket.bucket}: ${bucket.thesesCount} theses | Avg P&L: $${bucket.avgPnl.toFixed(2)} | Win Rate: ${bucket.winRate.toFixed(0)}% ${status}`
      );
    }
  }
  lines.push("");

  // Best/Worst
  if (report.bestThesis) {
    lines.push("--- BEST THESIS ---");
    lines.push(`${report.bestThesis.thesisTitle}`);
    lines.push(`ROI: ${report.bestThesis.roiPercent.toFixed(1)}% | P&L: $${report.bestThesis.totalPnl.toFixed(2)}`);
    lines.push("");
  }

  if (report.worstThesis && report.worstThesis !== report.bestThesis) {
    lines.push("--- WORST THESIS ---");
    lines.push(`${report.worstThesis.thesisTitle}`);
    lines.push(`ROI: ${report.worstThesis.roiPercent.toFixed(1)}% | P&L: $${report.worstThesis.totalPnl.toFixed(2)}`);
    lines.push("");
  }

  lines.push("=".repeat(60));

  return lines.join("\n");
}

/**
 * Format single thesis performance as readable string
 */
export function formatThesisPerformance(perf: ThesisPerformance): string {
  const lines: string[] = [];
  const pnlSign = perf.totalPnl >= 0 ? "+" : "";

  lines.push(`\n--- ${perf.thesisTitle} ---`);
  lines.push(`Status: ${perf.status.toUpperCase()}`);
  lines.push(`Timeframe: ${perf.timeframe}`);
  lines.push(`Duration: ${perf.duration} days (${(perf.durationEfficiency * 100).toFixed(0)}% of expected)`);
  lines.push("");
  lines.push(`P&L: ${pnlSign}$${perf.totalPnl.toFixed(2)}`);
  lines.push(`  Realized: $${perf.realizedPnl.toFixed(2)}`);
  lines.push(`  Unrealized: $${perf.unrealizedPnl.toFixed(2)}`);
  lines.push(`ROI: ${perf.roiPercent.toFixed(1)}%`);
  lines.push("");
  lines.push(`Positions: ${perf.positionCount}`);
  lines.push(`  Winners: ${perf.winningPositions}`);
  lines.push(`  Losers: ${perf.losingPositions}`);
  lines.push(`Win Rate: ${perf.winRate.toFixed(1)}%`);
  lines.push("");
  lines.push(`Conviction: ${perf.initialConviction}%`);
  lines.push(`Max Drawdown: ${perf.maxDrawdown.toFixed(1)}%`);
  if (perf.wasCorrect !== undefined) {
    lines.push(`Outcome: ${perf.wasCorrect ? "CORRECT" : "INCORRECT"}`);
  }

  return lines.join("\n");
}
