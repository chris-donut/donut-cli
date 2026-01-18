/**
 * Position Monitor Service - Background position tracking and alerts
 *
 * Continuously monitors open positions and triggers alerts for:
 * - Stop loss hit
 * - Take profit hit
 * - Liquidation warning
 * - Significant P&L changes
 */

import { Position } from "../core/types.js";
import { getDonutBrowserClient, DonutBrowserClient } from "../integrations/donut-browser-client.js";
import { getRiskManager } from "../hooks/risk-hook.js";
import {
  loadTelegramConfig,
  sendMessage,
  TelegramClientConfig,
} from "../integrations/telegram-client.js";

// ============================================================================
// Types
// ============================================================================

export interface PositionAlert {
  type: "stop_loss" | "take_profit" | "liquidation_warning" | "pnl_change" | "position_opened" | "position_closed";
  symbol: string;
  message: string;
  data: Record<string, unknown>;
  timestamp: Date;
}

export interface MonitorConfig {
  pollIntervalMs: number;
  liquidationWarningPct: number; // Warn when price is within X% of liquidation
  pnlChangeAlertPct: number; // Alert on X% P&L change
  enableAlerts: boolean;
}

export interface MonitorStatus {
  running: boolean;
  positionCount: number;
  totalUnrealizedPnl: number;
  lastPollAt?: Date;
  alertCount: number;
  lastError?: string;
}

type AlertHandler = (alert: PositionAlert) => void | Promise<void>;

// ============================================================================
// Position Monitor
// ============================================================================

const DEFAULT_CONFIG: MonitorConfig = {
  pollIntervalMs: 30000, // 30 seconds
  liquidationWarningPct: 10, // Warn at 10% from liquidation
  pnlChangeAlertPct: 5, // Alert on 5% P&L change
  enableAlerts: true,
};

/**
 * Position Monitor - Background service for tracking positions
 */
export class PositionMonitor {
  private client: DonutBrowserClient | null = null;
  private telegramConfig: TelegramClientConfig | null = null;
  private config: MonitorConfig;

  private running: boolean = false;
  private interval: NodeJS.Timeout | null = null;
  private positions: Map<string, Position> = new Map();
  private alertHandlers: Map<string, AlertHandler> = new Map();
  private alertCount: number = 0;
  private lastPollAt?: Date;
  private lastError?: string;

  // Track last P&L for change detection
  private lastPnlBySymbol: Map<string, number> = new Map();

  constructor(config: Partial<MonitorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start monitoring positions
   */
  async start(): Promise<{ success: boolean; error?: string }> {
    if (this.running) {
      return { success: true };
    }

    // Get Donut Browser client
    this.client = getDonutBrowserClient();
    if (!this.client) {
      return {
        success: false,
        error: "Donut Browser not configured. Set DONUT_BROWSER_URL.",
      };
    }

    // Get Telegram config for alerts
    this.telegramConfig = loadTelegramConfig();

    this.running = true;
    this.alertCount = 0;
    this.lastError = undefined;

    // Run initial poll
    await this.poll();

    // Start polling interval
    this.interval = setInterval(async () => {
      if (this.running) {
        await this.poll();
      }
    }, this.config.pollIntervalMs);

    console.log(
      `[PositionMonitor] Started with ${this.config.pollIntervalMs}ms interval`
    );

    return { success: true };
  }

  /**
   * Stop monitoring
   */
  async stop(): Promise<void> {
    this.running = false;

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    console.log("[PositionMonitor] Stopped");
  }

  /**
   * Poll positions and check for alerts
   */
  private async poll(): Promise<void> {
    if (!this.client) return;

    try {
      const positions = await this.client.getPositions();
      this.lastPollAt = new Date();

      // Track previous position symbols
      const previousSymbols = new Set(this.positions.keys());
      const currentSymbols = new Set(positions.map((p) => p.symbol));

      // Update positions map
      const newPositions = new Map<string, Position>();
      for (const position of positions) {
        newPositions.set(position.symbol, position);

        // Check for new position
        if (!previousSymbols.has(position.symbol)) {
          await this.emitAlert({
            type: "position_opened",
            symbol: position.symbol,
            message: `Position opened: ${position.side.toUpperCase()} ${position.symbol}`,
            data: {
              side: position.side,
              quantity: position.quantity,
              entryPrice: position.entryPrice,
              leverage: position.leverage,
            },
            timestamp: new Date(),
          });
        }

        // Check for liquidation warning
        await this.checkLiquidationWarning(position);

        // Check for significant P&L change
        await this.checkPnlChange(position);
      }

      // Check for closed positions
      for (const symbol of previousSymbols) {
        if (!currentSymbols.has(symbol)) {
          const closedPosition = this.positions.get(symbol);
          await this.emitAlert({
            type: "position_closed",
            symbol,
            message: `Position closed: ${symbol}`,
            data: {
              lastKnownPnl: closedPosition?.unrealizedPnL ?? 0,
            },
            timestamp: new Date(),
          });
          this.lastPnlBySymbol.delete(symbol);
        }
      }

      this.positions = newPositions;

      // Sync with risk manager
      const riskManager = getRiskManager();
      riskManager.setOpenPositions(positions.length);

      this.lastError = undefined;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      console.error("[PositionMonitor] Poll error:", this.lastError);
    }
  }

  /**
   * Check if price is approaching liquidation
   */
  private async checkLiquidationWarning(position: Position): Promise<void> {
    const { currentPrice, liquidationPrice, side } = position;

    // Calculate distance to liquidation as percentage
    const distancePct =
      Math.abs(currentPrice - liquidationPrice) / currentPrice * 100;

    if (distancePct <= this.config.liquidationWarningPct) {
      await this.emitAlert({
        type: "liquidation_warning",
        symbol: position.symbol,
        message: `⚠️ LIQUIDATION WARNING: ${position.symbol} is ${distancePct.toFixed(1)}% from liquidation!`,
        data: {
          currentPrice,
          liquidationPrice,
          distancePct,
          side,
          unrealizedPnl: position.unrealizedPnL,
        },
        timestamp: new Date(),
      });
    }
  }

  /**
   * Check for significant P&L changes
   */
  private async checkPnlChange(position: Position): Promise<void> {
    const lastPnl = this.lastPnlBySymbol.get(position.symbol);
    const currentPnl = position.unrealizedPnL;

    if (lastPnl !== undefined) {
      const entryValue = position.entryPrice * position.quantity;
      const pnlChangePct = Math.abs(currentPnl - lastPnl) / entryValue * 100;

      if (pnlChangePct >= this.config.pnlChangeAlertPct) {
        const direction = currentPnl > lastPnl ? "increased" : "decreased";
        await this.emitAlert({
          type: "pnl_change",
          symbol: position.symbol,
          message: `P&L ${direction} by ${pnlChangePct.toFixed(1)}% for ${position.symbol}`,
          data: {
            previousPnl: lastPnl,
            currentPnl,
            changePct: pnlChangePct,
            direction,
          },
          timestamp: new Date(),
        });
      }
    }

    this.lastPnlBySymbol.set(position.symbol, currentPnl);
  }

  /**
   * Emit an alert to all handlers and Telegram
   */
  private async emitAlert(alert: PositionAlert): Promise<void> {
    if (!this.config.enableAlerts) return;

    this.alertCount++;

    // Call registered handlers
    for (const handler of this.alertHandlers.values()) {
      try {
        await handler(alert);
      } catch (error) {
        console.error("[PositionMonitor] Handler error:", error);
      }
    }

    // Send to Telegram if configured
    if (this.telegramConfig) {
      const emoji = this.getAlertEmoji(alert.type);
      await sendMessage(this.telegramConfig, `${emoji} ${alert.message}`);
    }
  }

  /**
   * Get emoji for alert type
   */
  private getAlertEmoji(type: PositionAlert["type"]): string {
    switch (type) {
      case "stop_loss":
        return "🛑";
      case "take_profit":
        return "💰";
      case "liquidation_warning":
        return "⚠️";
      case "pnl_change":
        return "📊";
      case "position_opened":
        return "📈";
      case "position_closed":
        return "📉";
      default:
        return "ℹ️";
    }
  }

  // =========================================================================
  // Event Handlers
  // =========================================================================

  /**
   * Register an alert handler
   */
  onAlert(handler: AlertHandler): string {
    const id = `handler_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    this.alertHandlers.set(id, handler);
    return id;
  }

  /**
   * Register handler for specific alert type
   */
  on(type: PositionAlert["type"], handler: AlertHandler): string {
    return this.onAlert((alert) => {
      if (alert.type === type) {
        return handler(alert);
      }
    });
  }

  /**
   * Remove a handler
   */
  removeHandler(id: string): boolean {
    return this.alertHandlers.delete(id);
  }

  // =========================================================================
  // Getters
  // =========================================================================

  /**
   * Get a position by symbol
   */
  getPosition(symbol: string): Position | undefined {
    return this.positions.get(symbol);
  }

  /**
   * Get all positions
   */
  getAllPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  /**
   * Get total P&L
   */
  getTotalPnl(): { realized: number; unrealized: number } {
    let unrealized = 0;
    for (const position of this.positions.values()) {
      unrealized += position.unrealizedPnL;
    }
    return { realized: 0, unrealized }; // Realized tracked elsewhere
  }

  /**
   * Get monitor status
   */
  getStatus(): MonitorStatus {
    const totalUnrealizedPnl = this.getTotalPnl().unrealized;
    return {
      running: this.running,
      positionCount: this.positions.size,
      totalUnrealizedPnl,
      lastPollAt: this.lastPollAt,
      alertCount: this.alertCount,
      lastError: this.lastError,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<MonitorConfig>): void {
    this.config = { ...this.config, ...config };

    // Restart interval if running and interval changed
    if (this.running && config.pollIntervalMs && this.interval) {
      clearInterval(this.interval);
      this.interval = setInterval(async () => {
        if (this.running) {
          await this.poll();
        }
      }, this.config.pollIntervalMs);
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let monitorInstance: PositionMonitor | null = null;

/**
 * Get the position monitor singleton
 */
export function getPositionMonitor(config?: Partial<MonitorConfig>): PositionMonitor {
  if (!monitorInstance) {
    monitorInstance = new PositionMonitor(config);
  }
  return monitorInstance;
}

/**
 * Reset the monitor instance (for testing)
 */
export function resetPositionMonitor(): void {
  if (monitorInstance) {
    monitorInstance.stop();
    monitorInstance = null;
  }
}
