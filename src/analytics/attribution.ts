/**
 * Performance Attribution System - Analyze why strategies win or lose
 *
 * Provides attribution analysis by:
 * - Market regime (bull/bear/range/volatile)
 * - Time of day (hourly breakdown)
 * - Symbol (per-asset performance)
 *
 * Returns ranked lists with contribution percentages.
 *
 * Part of Phase 3: Intelligence Layer
 */

import { z } from "zod";
import { PaperTrade } from "../core/types.js";
import { MarketRegime } from "../agents/regime-detector.js";

// ============================================================================
// Types
// ============================================================================

export interface AttributionFactor {
  factor: string;
  pnl: number;
  tradeCount: number;
  winRate: number;
  contributionPct: number;
  averagePnl: number;
}

export interface AttributionResult {
  factors: AttributionFactor[];
  totalPnl: number;
  totalTrades: number;
  bestFactor: AttributionFactor | null;
  worstFactor: AttributionFactor | null;
  timestamp: string;
}

export interface TradeWithMetadata extends PaperTrade {
  regime?: MarketRegime;
  hourOfDay?: number;
}

// ============================================================================
// Attribution Functions
// ============================================================================

/**
 * Attribute PnL by market regime
 *
 * Groups trades by their market regime at time of execution
 * and calculates contribution percentages.
 */
export function attributeByRegime(
  trades: TradeWithMetadata[]
): AttributionResult {
  const groups = groupBy(trades, (t) => t.regime || "unknown");
  return buildAttributionResult(groups, "regime");
}

/**
 * Attribute PnL by time of day (hour)
 *
 * Groups trades by the hour they were executed.
 * Useful for identifying optimal trading hours.
 */
export function attributeByTimeOfDay(
  trades: TradeWithMetadata[]
): AttributionResult {
  const groups = groupBy(trades, (t) => {
    const hour = t.hourOfDay ?? new Date(t.timestamp).getHours();
    return `${hour.toString().padStart(2, "0")}:00`;
  });
  return buildAttributionResult(groups, "hour");
}

/**
 * Attribute PnL by symbol
 *
 * Groups trades by their trading symbol.
 * Useful for identifying best/worst performing assets.
 */
export function attributeBySymbol(
  trades: TradeWithMetadata[]
): AttributionResult {
  const groups = groupBy(trades, (t) => t.symbol);
  return buildAttributionResult(groups, "symbol");
}

/**
 * Comprehensive attribution analysis across all dimensions
 */
export function fullAttribution(trades: TradeWithMetadata[]): {
  byRegime: AttributionResult;
  byTimeOfDay: AttributionResult;
  bySymbol: AttributionResult;
  summary: {
    totalPnl: number;
    totalTrades: number;
    overallWinRate: number;
    profitableDimensions: string[];
  };
} {
  const byRegime = attributeByRegime(trades);
  const byTimeOfDay = attributeByTimeOfDay(trades);
  const bySymbol = attributeBySymbol(trades);

  const totalPnl = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const totalTrades = trades.length;
  const winningTrades = trades.filter((t) => (t.pnl || 0) > 0).length;
  const overallWinRate = totalTrades > 0 ? winningTrades / totalTrades : 0;

  // Identify profitable dimensions
  const profitableDimensions: string[] = [];
  if (byRegime.bestFactor && byRegime.bestFactor.pnl > 0) {
    profitableDimensions.push(`Regime: ${byRegime.bestFactor.factor}`);
  }
  if (byTimeOfDay.bestFactor && byTimeOfDay.bestFactor.pnl > 0) {
    profitableDimensions.push(`Hour: ${byTimeOfDay.bestFactor.factor}`);
  }
  if (bySymbol.bestFactor && bySymbol.bestFactor.pnl > 0) {
    profitableDimensions.push(`Symbol: ${bySymbol.bestFactor.factor}`);
  }

  return {
    byRegime,
    byTimeOfDay,
    bySymbol,
    summary: {
      totalPnl,
      totalTrades,
      overallWinRate,
      profitableDimensions,
    },
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Group trades by a key function
 */
function groupBy<T>(
  items: T[],
  keyFn: (item: T) => string
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const group = groups.get(key) || [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
}

/**
 * Build attribution result from grouped trades
 */
function buildAttributionResult(
  groups: Map<string, TradeWithMetadata[]>,
  _dimension: string
): AttributionResult {
  const totalPnl = Array.from(groups.values())
    .flat()
    .reduce((sum, t) => sum + (t.pnl || 0), 0);

  const totalTrades = Array.from(groups.values())
    .flat().length;

  const factors: AttributionFactor[] = [];

  for (const [factor, trades] of groups) {
    const pnl = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const tradeCount = trades.length;
    const winningTrades = trades.filter((t) => (t.pnl || 0) > 0).length;
    const winRate = tradeCount > 0 ? winningTrades / tradeCount : 0;
    const contributionPct = totalPnl !== 0 ? (pnl / Math.abs(totalPnl)) * 100 : 0;
    const averagePnl = tradeCount > 0 ? pnl / tradeCount : 0;

    factors.push({
      factor,
      pnl,
      tradeCount,
      winRate,
      contributionPct,
      averagePnl,
    });
  }

  // Sort by PnL descending
  factors.sort((a, b) => b.pnl - a.pnl);

  const bestFactor = factors.length > 0 ? factors[0] : null;
  const worstFactor = factors.length > 0 ? factors[factors.length - 1] : null;

  return {
    factors,
    totalPnl,
    totalTrades,
    bestFactor,
    worstFactor,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Format attribution result as a readable string
 */
export function formatAttributionResult(
  result: AttributionResult,
  title: string
): string {
  const lines: string[] = [];
  lines.push(`\n=== ${title} ===`);
  lines.push(`Total PnL: $${result.totalPnl.toFixed(2)}`);
  lines.push(`Total Trades: ${result.totalTrades}`);
  lines.push("");
  lines.push("Ranked by PnL:");
  lines.push("-".repeat(70));
  lines.push(
    "Factor".padEnd(15) +
    "PnL".padStart(12) +
    "Trades".padStart(8) +
    "Win Rate".padStart(10) +
    "Contrib %".padStart(10) +
    "Avg PnL".padStart(12)
  );
  lines.push("-".repeat(70));

  for (const f of result.factors) {
    lines.push(
      f.factor.padEnd(15) +
      `$${f.pnl.toFixed(2)}`.padStart(12) +
      f.tradeCount.toString().padStart(8) +
      `${(f.winRate * 100).toFixed(1)}%`.padStart(10) +
      `${f.contributionPct.toFixed(1)}%`.padStart(10) +
      `$${f.averagePnl.toFixed(2)}`.padStart(12)
    );
  }

  lines.push("-".repeat(70));

  if (result.bestFactor) {
    lines.push(`Best: ${result.bestFactor.factor} ($${result.bestFactor.pnl.toFixed(2)})`);
  }
  if (result.worstFactor && result.worstFactor !== result.bestFactor) {
    lines.push(`Worst: ${result.worstFactor.factor} ($${result.worstFactor.pnl.toFixed(2)})`);
  }

  return lines.join("\n");
}

// ============================================================================
// Exports
// ============================================================================

export {
  attributeByRegime as byRegime,
  attributeByTimeOfDay as byTimeOfDay,
  attributeBySymbol as bySymbol,
};
