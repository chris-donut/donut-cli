/**
 * Invalidation Monitor - Monitors thesis invalidation signals
 *
 * Checks for signals that would invalidate a trading thesis:
 * - Price-based signals (symbol breaks a level)
 * - Time-based signals (thesis exceeds expected timeframe)
 * - Conviction-based signals (conviction dropped too low)
 * - Event-based signals (specific events occurred)
 *
 * Part of Phase 4: Thesis Trading Layer
 */

import { z } from "zod";
import {
  TradingThesis,
  InvalidationSignal,
  InvalidationSeverity,
  getThesisDaysActive,
  isThesisOverdue,
} from "./types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * An alert triggered when an invalidation signal fires
 */
export const InvalidationAlertSchema = z.object({
  id: z.string().uuid(),
  thesisId: z.string().uuid(),
  signalId: z.string().uuid(),
  signalDescription: z.string(),
  severity: z.enum(["warning", "critical", "fatal"]),
  triggeredAt: z.string().datetime(),
  currentValue: z.unknown().optional(), // The value that triggered the alert
  thresholdValue: z.unknown().optional(), // The threshold that was breached
  message: z.string(),
});

export type InvalidationAlert = z.infer<typeof InvalidationAlertSchema>;

/**
 * Configuration for the invalidation monitor
 */
export interface InvalidationMonitorConfig {
  // Function to get current price for a symbol
  getPriceFunc?: (symbol: string) => Promise<number | null>;
  // Minimum conviction level before triggering warning
  minConvictionWarning?: number;
  // Minimum conviction level before triggering critical
  minConvictionCritical?: number;
}

/**
 * Result of checking a thesis for invalidation
 */
export interface InvalidationCheckResult {
  thesisId: string;
  thesisTitle: string;
  checkedAt: string;
  totalSignals: number;
  triggeredAlerts: InvalidationAlert[];
  isInvalidated: boolean; // True if any fatal signal triggered
  needsAttention: boolean; // True if any critical/fatal signal triggered
  overallSeverity: InvalidationSeverity | null;
}

// ============================================================================
// Default Price Function (mock)
// ============================================================================

/**
 * Default mock price function for testing
 * In production, this should be replaced with real price data
 */
async function defaultGetPrice(symbol: string): Promise<number | null> {
  // Mock prices for common symbols
  const mockPrices: Record<string, number> = {
    BTCUSDT: 95000,
    ETHUSDT: 3200,
    SOLUSDT: 180,
    BNBUSDT: 680,
    XRPUSDT: 2.2,
    DOGEUSDT: 0.38,
    ADAUSDT: 0.95,
    AVAXUSDT: 42,
    DOTUSDT: 7.5,
    MATICUSDT: 0.52,
  };
  return mockPrices[symbol.toUpperCase()] ?? null;
}

// ============================================================================
// Invalidation Monitor Class
// ============================================================================

export class InvalidationMonitor {
  private config: InvalidationMonitorConfig;
  private getPriceFunc: (symbol: string) => Promise<number | null>;

  constructor(config: InvalidationMonitorConfig = {}) {
    this.config = config;
    this.getPriceFunc = config.getPriceFunc || defaultGetPrice;
  }

  /**
   * Check all invalidation signals for a thesis
   */
  async checkInvalidationSignals(
    thesis: TradingThesis
  ): Promise<InvalidationCheckResult> {
    const alerts: InvalidationAlert[] = [];
    const now = new Date().toISOString();

    // Check each defined invalidation signal
    for (const signal of thesis.invalidationSignals) {
      const alert = await this.checkSignal(thesis.id, signal);
      if (alert) {
        alerts.push(alert);
      }
    }

    // Check implicit signals (time-based, conviction-based)
    const implicitAlerts = await this.checkImplicitSignals(thesis);
    alerts.push(...implicitAlerts);

    // Determine overall status
    const fatalAlerts = alerts.filter((a) => a.severity === "fatal");
    const criticalAlerts = alerts.filter((a) => a.severity === "critical");

    let overallSeverity: InvalidationSeverity | null = null;
    if (fatalAlerts.length > 0) {
      overallSeverity = "fatal";
    } else if (criticalAlerts.length > 0) {
      overallSeverity = "critical";
    } else if (alerts.length > 0) {
      overallSeverity = "warning";
    }

    return {
      thesisId: thesis.id,
      thesisTitle: thesis.title,
      checkedAt: now,
      totalSignals: thesis.invalidationSignals.length,
      triggeredAlerts: alerts,
      isInvalidated: fatalAlerts.length > 0,
      needsAttention: criticalAlerts.length > 0 || fatalAlerts.length > 0,
      overallSeverity,
    };
  }

  /**
   * Check a single invalidation signal
   */
  private async checkSignal(
    thesisId: string,
    signal: InvalidationSignal
  ): Promise<InvalidationAlert | null> {
    // Skip already triggered signals
    if (signal.triggered) {
      return null;
    }

    switch (signal.type) {
      case "price":
        return this.checkPriceSignal(thesisId, signal);
      case "time":
        return this.checkTimeSignal(thesisId, signal);
      case "event":
        return this.checkEventSignal(thesisId, signal);
      case "metric":
        return this.checkMetricSignal(thesisId, signal);
      default:
        return null;
    }
  }

  /**
   * Check price-based invalidation signal
   */
  private async checkPriceSignal(
    thesisId: string,
    signal: InvalidationSignal
  ): Promise<InvalidationAlert | null> {
    if (!signal.symbol || !signal.priceLevel || !signal.priceDirection) {
      return null;
    }

    const currentPrice = await this.getPriceFunc(signal.symbol);
    if (currentPrice === null) {
      return null;
    }

    let triggered = false;
    if (signal.priceDirection === "above" && currentPrice > signal.priceLevel) {
      triggered = true;
    } else if (signal.priceDirection === "below" && currentPrice < signal.priceLevel) {
      triggered = true;
    }

    if (!triggered) {
      return null;
    }

    return this.createAlert(thesisId, signal, {
      currentValue: currentPrice,
      thresholdValue: signal.priceLevel,
      message: `${signal.symbol} price ${signal.priceDirection === "above" ? "exceeded" : "fell below"} ${signal.priceLevel} (current: ${currentPrice})`,
    });
  }

  /**
   * Check time-based invalidation signal
   */
  private checkTimeSignal(
    thesisId: string,
    signal: InvalidationSignal
  ): InvalidationAlert | null {
    // Time signals are typically checked via implicit signals
    // This handles custom time-based signals
    return null;
  }

  /**
   * Check event-based invalidation signal
   */
  private checkEventSignal(
    thesisId: string,
    signal: InvalidationSignal
  ): InvalidationAlert | null {
    // Event-based signals require external event tracking
    // This is a placeholder for integration with news/event feeds
    return null;
  }

  /**
   * Check metric-based invalidation signal
   */
  private checkMetricSignal(
    thesisId: string,
    signal: InvalidationSignal
  ): InvalidationAlert | null {
    // Metric signals require integration with trading metrics
    // This is a placeholder for position P&L, drawdown, etc.
    return null;
  }

  /**
   * Check implicit signals (not explicitly defined but always monitored)
   */
  private async checkImplicitSignals(
    thesis: TradingThesis
  ): Promise<InvalidationAlert[]> {
    const alerts: InvalidationAlert[] = [];

    // Check if thesis is overdue
    if (isThesisOverdue(thesis) && thesis.status === "active") {
      alerts.push({
        id: crypto.randomUUID(),
        thesisId: thesis.id,
        signalId: "implicit-time",
        signalDescription: "Thesis exceeded expected timeframe",
        severity: "warning",
        triggeredAt: new Date().toISOString(),
        currentValue: getThesisDaysActive(thesis),
        thresholdValue: this.getMaxDaysForTimeframe(thesis.timeframe),
        message: `Thesis has been active for ${getThesisDaysActive(thesis)} days, exceeding the ${thesis.timeframe} timeframe`,
      });
    }

    // Check conviction level
    const minWarning = this.config.minConvictionWarning ?? 30;
    const minCritical = this.config.minConvictionCritical ?? 15;

    if (thesis.conviction < minCritical) {
      alerts.push({
        id: crypto.randomUUID(),
        thesisId: thesis.id,
        signalId: "implicit-conviction-critical",
        signalDescription: "Conviction dropped to critical level",
        severity: "critical",
        triggeredAt: new Date().toISOString(),
        currentValue: thesis.conviction,
        thresholdValue: minCritical,
        message: `Conviction level (${thesis.conviction}%) is critically low. Consider closing the thesis.`,
      });
    } else if (thesis.conviction < minWarning) {
      alerts.push({
        id: crypto.randomUUID(),
        thesisId: thesis.id,
        signalId: "implicit-conviction-warning",
        signalDescription: "Conviction dropped below warning threshold",
        severity: "warning",
        triggeredAt: new Date().toISOString(),
        currentValue: thesis.conviction,
        thresholdValue: minWarning,
        message: `Conviction level (${thesis.conviction}%) is below ${minWarning}%. Review thesis validity.`,
      });
    }

    // Check for excessive drawdown
    if (thesis.metrics.maxDrawdown > 20) {
      const severity: InvalidationSeverity =
        thesis.metrics.maxDrawdown > 30 ? "critical" : "warning";
      alerts.push({
        id: crypto.randomUUID(),
        thesisId: thesis.id,
        signalId: "implicit-drawdown",
        signalDescription: "Excessive drawdown on thesis positions",
        severity,
        triggeredAt: new Date().toISOString(),
        currentValue: thesis.metrics.maxDrawdown,
        thresholdValue: 20,
        message: `Max drawdown of ${thesis.metrics.maxDrawdown.toFixed(1)}% exceeds threshold`,
      });
    }

    return alerts;
  }

  /**
   * Create an invalidation alert
   */
  private createAlert(
    thesisId: string,
    signal: InvalidationSignal,
    details: {
      currentValue?: unknown;
      thresholdValue?: unknown;
      message: string;
    }
  ): InvalidationAlert {
    return {
      id: crypto.randomUUID(),
      thesisId,
      signalId: signal.id,
      signalDescription: signal.description,
      severity: signal.severity,
      triggeredAt: new Date().toISOString(),
      currentValue: details.currentValue,
      thresholdValue: details.thresholdValue,
      message: details.message,
    };
  }

  /**
   * Get maximum expected days for a timeframe
   */
  private getMaxDaysForTimeframe(
    timeframe: "days" | "weeks" | "months" | "years"
  ): number {
    const maxDays: Record<string, number> = {
      days: 7,
      weeks: 56,
      months: 365,
      years: 1825,
    };
    return maxDays[timeframe] || 365;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let monitorInstance: InvalidationMonitor | null = null;

/**
 * Get the invalidation monitor instance
 */
export function getInvalidationMonitor(
  config?: InvalidationMonitorConfig
): InvalidationMonitor {
  if (!monitorInstance) {
    monitorInstance = new InvalidationMonitor(config);
  }
  return monitorInstance;
}

/**
 * Initialize the invalidation monitor with custom configuration
 */
export function initializeInvalidationMonitor(
  config: InvalidationMonitorConfig
): InvalidationMonitor {
  monitorInstance = new InvalidationMonitor(config);
  return monitorInstance;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick check if a thesis has any triggered alerts
 */
export async function hasTriggeredAlerts(
  thesis: TradingThesis,
  config?: InvalidationMonitorConfig
): Promise<boolean> {
  const monitor = new InvalidationMonitor(config);
  const result = await monitor.checkInvalidationSignals(thesis);
  return result.triggeredAlerts.length > 0;
}

/**
 * Format invalidation alerts as readable string
 */
export function formatInvalidationAlerts(
  alerts: InvalidationAlert[]
): string {
  if (alerts.length === 0) {
    return "No invalidation alerts triggered.";
  }

  const lines: string[] = [];
  lines.push(`\n=== Invalidation Alerts (${alerts.length}) ===\n`);

  for (const alert of alerts) {
    const severityIcon =
      alert.severity === "fatal"
        ? "🔴"
        : alert.severity === "critical"
        ? "🟠"
        : "🟡";
    lines.push(`${severityIcon} [${alert.severity.toUpperCase()}]`);
    lines.push(`   ${alert.message}`);
    lines.push(`   Signal: ${alert.signalDescription}`);
    lines.push(`   Triggered: ${new Date(alert.triggeredAt).toLocaleString()}`);
    lines.push("");
  }

  return lines.join("\n");
}
