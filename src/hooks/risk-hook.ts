/**
 * Risk Management Hook - Pre/Post execution validation for high-risk tools
 *
 * This hook intercepts trade execution tools (donut_execute_trade, etc.) and
 * validates them against configurable risk limits before execution.
 *
 * Part of Phase 2: Multi-Agent Foundation
 */

import {
  RiskConfig,
  RiskCheckResult,
  ToolExecutionContext,
  isHighRiskTool,
  RiskConfigSchema,
} from "../core/types.js";

/**
 * Default risk configuration - conservative limits for safety
 */
const DEFAULT_RISK_CONFIG: RiskConfig = {
  maxPositionSizeUsd: 10000,
  maxDailyLossUsd: 1000,
  maxOpenPositions: 5,
  requireConfirmation: true,
  blacklistedSymbols: [],
};

/**
 * RiskManager - Singleton service for pre/post tool execution validation
 *
 * Provides risk checks for high-risk trading operations including:
 * - Position size limits
 * - Daily loss limits
 * - Maximum open positions
 * - Symbol blacklisting
 * - Confirmation requirements
 */
export class RiskManager {
  private config: RiskConfig;
  private dailyLoss: number = 0;
  private openPositions: number = 0;
  private lastResetDate: string;

  constructor(config: Partial<RiskConfig> = {}) {
    // Validate and merge with defaults using Zod
    const parsed = RiskConfigSchema.safeParse({
      ...DEFAULT_RISK_CONFIG,
      ...config,
    });

    if (parsed.success) {
      this.config = parsed.data;
    } else {
      console.warn("Invalid risk config, using defaults:", parsed.error.format());
      this.config = DEFAULT_RISK_CONFIG;
    }

    this.lastResetDate = new Date().toISOString().split("T")[0];
  }

  /**
   * Pre-tool-use hook: Validate before execution
   *
   * Returns a RiskCheckResult indicating whether the tool call should proceed.
   * For high-risk tools, performs comprehensive validation.
   * For normal tools, returns allowed: true immediately.
   */
  async preToolUseHook(context: ToolExecutionContext): Promise<RiskCheckResult> {
    // Only intercept high-risk tools
    if (!isHighRiskTool(context.toolName)) {
      return { allowed: true, warnings: [] };
    }

    // Reset daily counters if new day
    this.resetDailyCountersIfNeeded();

    const result: RiskCheckResult = {
      allowed: true,
      warnings: [],
    };

    // Check 1: Position size limits
    const sizeCheck = this.checkPositionSize(context.params);
    if (!sizeCheck.allowed) {
      return sizeCheck;
    }
    result.warnings.push(...sizeCheck.warnings);

    // Check 2: Daily loss limits
    const lossCheck = this.checkDailyLoss();
    if (!lossCheck.allowed) {
      return lossCheck;
    }
    result.warnings.push(...lossCheck.warnings);

    // Check 3: Max open positions
    const positionsCheck = this.checkOpenPositions();
    if (!positionsCheck.allowed) {
      return positionsCheck;
    }
    result.warnings.push(...positionsCheck.warnings);

    // Check 4: Blacklisted symbols
    const symbolCheck = this.checkBlacklist(context.params);
    if (!symbolCheck.allowed) {
      return symbolCheck;
    }
    result.warnings.push(...symbolCheck.warnings);

    // Check 5: Confirmation requirement
    if (this.config.requireConfirmation) {
      result.warnings.push("Trade requires manual confirmation before execution");
    }

    return result;
  }

  /**
   * Post-tool-use hook: Update risk metrics after execution
   *
   * Updates position count and tracks P&L after successful tool execution.
   */
  async postToolUseHook(
    context: ToolExecutionContext,
    toolResult: unknown
  ): Promise<void> {
    // Update position count for trade execution
    if (context.toolName === "donut_execute_trade") {
      this.openPositions++;

      // Track realized P&L if available in result
      const result = toolResult as { realizedPnL?: number } | undefined;
      if (result?.realizedPnL !== undefined && result.realizedPnL < 0) {
        this.dailyLoss += Math.abs(result.realizedPnL);
      }
    }

    // Decrement position count for close operations
    if (context.toolName === "donut_close_all_positions") {
      this.openPositions = 0;
    }
  }

  /**
   * Check position size against limits
   */
  private checkPositionSize(
    params: Record<string, unknown>
  ): RiskCheckResult {
    const result: RiskCheckResult = { allowed: true, warnings: [] };

    // Extract size and price from params (common trading tool patterns)
    const size = Number(params.size ?? params.quantity ?? params.amount ?? 0);
    const price = Number(params.price ?? params.limitPrice ?? 0);

    if (size > 0 && price > 0) {
      const positionValueUsd = size * price;

      if (positionValueUsd > this.config.maxPositionSizeUsd) {
        return {
          allowed: false,
          reason: `Position value $${positionValueUsd.toFixed(2)} exceeds limit of $${this.config.maxPositionSizeUsd}`,
          warnings: [],
        };
      }

      // Warn if approaching limit (80%)
      if (positionValueUsd > this.config.maxPositionSizeUsd * 0.8) {
        result.warnings.push(
          `Position value $${positionValueUsd.toFixed(2)} is approaching limit of $${this.config.maxPositionSizeUsd}`
        );
      }
    }

    return result;
  }

  /**
   * Check daily loss against limits
   */
  private checkDailyLoss(): RiskCheckResult {
    const result: RiskCheckResult = { allowed: true, warnings: [] };

    if (this.dailyLoss >= this.config.maxDailyLossUsd) {
      return {
        allowed: false,
        reason: `Daily loss limit of $${this.config.maxDailyLossUsd} reached (current: $${this.dailyLoss.toFixed(2)})`,
        warnings: [],
      };
    }

    // Warn if approaching limit (80%)
    if (this.dailyLoss > this.config.maxDailyLossUsd * 0.8) {
      result.warnings.push(
        `Daily loss $${this.dailyLoss.toFixed(2)} is approaching limit of $${this.config.maxDailyLossUsd}`
      );
    }

    return result;
  }

  /**
   * Check open positions against limits
   */
  private checkOpenPositions(): RiskCheckResult {
    const result: RiskCheckResult = { allowed: true, warnings: [] };

    if (this.openPositions >= this.config.maxOpenPositions) {
      return {
        allowed: false,
        reason: `Maximum ${this.config.maxOpenPositions} positions already open (current: ${this.openPositions})`,
        warnings: [],
      };
    }

    // Warn if approaching limit
    if (this.openPositions >= this.config.maxOpenPositions - 1) {
      result.warnings.push(
        `${this.openPositions} of ${this.config.maxOpenPositions} maximum positions open`
      );
    }

    return result;
  }

  /**
   * Check symbol against blacklist
   */
  private checkBlacklist(params: Record<string, unknown>): RiskCheckResult {
    const symbol = String(params.symbol ?? "").toUpperCase();

    if (symbol && this.config.blacklistedSymbols.length > 0) {
      // Check for exact match or partial match
      const isBlacklisted = this.config.blacklistedSymbols.some(
        (blocked) =>
          symbol === blocked.toUpperCase() ||
          symbol.includes(blocked.toUpperCase())
      );

      if (isBlacklisted) {
        return {
          allowed: false,
          reason: `Symbol ${symbol} is blacklisted`,
          warnings: [],
        };
      }
    }

    return { allowed: true, warnings: [] };
  }

  /**
   * Reset daily counters if date has changed
   */
  private resetDailyCountersIfNeeded(): void {
    const today = new Date().toISOString().split("T")[0];
    if (today !== this.lastResetDate) {
      this.dailyLoss = 0;
      this.lastResetDate = today;
      console.log("[RiskManager] Daily counters reset for new trading day");
    }
  }

  /**
   * Update risk configuration dynamically
   */
  updateConfig(config: Partial<RiskConfig>): void {
    const parsed = RiskConfigSchema.safeParse({
      ...this.config,
      ...config,
    });

    if (parsed.success) {
      this.config = parsed.data;
    } else {
      console.warn("Invalid risk config update:", parsed.error.format());
    }
  }

  /**
   * Get current risk metrics for monitoring
   */
  getRiskMetrics(): {
    dailyLoss: number;
    openPositions: number;
    config: RiskConfig;
    dailyLossRemaining: number;
    positionsRemaining: number;
  } {
    return {
      dailyLoss: this.dailyLoss,
      openPositions: this.openPositions,
      config: { ...this.config },
      dailyLossRemaining: this.config.maxDailyLossUsd - this.dailyLoss,
      positionsRemaining: this.config.maxOpenPositions - this.openPositions,
    };
  }

  /**
   * Manually update position count (for external position sync)
   */
  setOpenPositions(count: number): void {
    this.openPositions = Math.max(0, count);
  }

  /**
   * Manually record a loss (for external P&L sync)
   */
  recordLoss(amount: number): void {
    if (amount > 0) {
      this.dailyLoss += amount;
    }
  }
}

// ============================================================================
// Singleton Instance Management
// ============================================================================

let riskManagerInstance: RiskManager | null = null;

/**
 * Get the singleton RiskManager instance
 *
 * Creates with default config if not initialized.
 */
export function getRiskManager(): RiskManager {
  if (!riskManagerInstance) {
    riskManagerInstance = new RiskManager();
  }
  return riskManagerInstance;
}

/**
 * Initialize the singleton RiskManager with custom config
 *
 * Call this at application startup to configure risk limits.
 */
export function initializeRiskManager(config?: Partial<RiskConfig>): RiskManager {
  riskManagerInstance = new RiskManager(config);
  return riskManagerInstance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetRiskManager(): void {
  riskManagerInstance = null;
}
