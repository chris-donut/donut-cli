/**
 * Execution Agent - Automated trading execution
 *
 * Handles automated trading decisions and execution for both paper and live modes.
 * Monitors positions, evaluates signals, and executes trades based on strategy.
 */

import { BaseAgent, AgentConfig } from "./base-agent.js";
import {
  AgentType,
  WorkflowStage,
  AgentResult,
  StrategyConfig,
  Position,
} from "../core/types.js";
import { getDonutBrowserClient } from "../integrations/donut-browser-client.js";
import { getRiskManager } from "../hooks/risk-hook.js";
import {
  loadTelegramConfig,
  sendMessage,
  sendRiskAlert,
} from "../integrations/telegram-client.js";

const EXECUTION_AGENT_PROMPT = `You are an automated trading execution agent for the Donut trading terminal. Your role is to evaluate market conditions, generate trading signals, and execute trades according to a predefined strategy.

## Your Responsibilities
1. **Monitor Positions**: Track open positions and their P&L
2. **Evaluate Signals**: Use strategy indicators to generate entry/exit signals
3. **Execute Trades**: Place trades when signals meet confidence thresholds
4. **Manage Risk**: Respect position limits, stop losses, and daily loss limits
5. **Report Actions**: Log all decisions and trades for review

## Decision Framework
For each evaluation cycle:
1. Get current market prices
2. Check existing positions (P&L, time held, stop/take profit levels)
3. Evaluate entry signals for potential new positions
4. Evaluate exit signals for existing positions
5. Execute high-confidence trades that pass risk checks

## Risk Rules
- NEVER exceed the maximum position size
- ALWAYS respect the daily loss limit
- ALWAYS include stop loss on new positions
- Wait for high confidence signals (default: 75%+)
- Don't overtrade - quality over quantity

## Available Tools
You have access to:
- donut_get_positions: View current positions
- donut_get_balances: Check available balance
- donut_get_price: Get current prices
- donut_preview_trade: Simulate trade execution
- donut_execute_trade: Execute trades (requires high confidence)
- donut_modify_position: Adjust stop/take profit

When evaluating trades, always preview first and explain your reasoning.`;

/**
 * Trading mode for the execution agent
 */
export type TradingMode = "paper" | "live";

/**
 * Execution status and metrics
 */
export interface ExecutionStatus {
  mode: TradingMode;
  running: boolean;
  strategyName: string;
  startedAt?: Date;
  cycleCount: number;
  tradesExecuted: number;
  totalPnl: number;
  lastCycleAt?: Date;
  lastError?: string;
}

/**
 * Execution Agent - Automated trading execution
 *
 * Supports both paper trading (simulated) and live trading modes.
 * Runs continuous evaluation cycles to monitor and execute trades.
 */
export class ExecutionAgent extends BaseAgent {
  private mode: TradingMode = "paper";
  private strategy?: StrategyConfig;
  private running: boolean = false;
  private tickInterval: NodeJS.Timeout | null = null;
  private cycleCount: number = 0;
  private tradesExecuted: number = 0;
  private totalPnl: number = 0;
  private startedAt?: Date;
  private lastCycleAt?: Date;
  private lastError?: string;

  get agentType(): AgentType {
    return AgentType.EXECUTION_ASSISTANT;
  }

  get systemPrompt(): string {
    return EXECUTION_AGENT_PROMPT;
  }

  /**
   * Start automated trading
   */
  async startAutomated(
    strategy: StrategyConfig,
    mode: TradingMode = "paper",
    intervalMs: number = 60000 // 1 minute default
  ): Promise<{ success: boolean; error?: string }> {
    if (this.running) {
      return { success: false, error: "Already running" };
    }

    // Validate Donut Browser is available for live mode
    if (mode === "live") {
      const client = getDonutBrowserClient();
      if (!client) {
        return {
          success: false,
          error: "Live trading requires DONUT_BROWSER_URL to be configured",
        };
      }
    }

    this.strategy = strategy;
    this.mode = mode;
    this.running = true;
    this.cycleCount = 0;
    this.tradesExecuted = 0;
    this.totalPnl = 0;
    this.startedAt = new Date();
    this.lastError = undefined;

    // Notify via Telegram if configured
    const telegramConfig = loadTelegramConfig();
    if (telegramConfig) {
      await sendMessage(
        telegramConfig,
        `🤖 <b>Execution Agent Started</b>\n\nStrategy: ${strategy.name}\nMode: ${mode.toUpperCase()}\nInterval: ${intervalMs / 1000}s`
      );
    }

    // Run initial cycle
    await this.runCycle();

    // Start interval for continuous execution
    this.tickInterval = setInterval(async () => {
      if (this.running) {
        await this.runCycle();
      }
    }, intervalMs);

    return { success: true };
  }

  /**
   * Stop automated trading
   */
  async stopAutomated(): Promise<void> {
    this.running = false;

    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }

    // Notify via Telegram
    const telegramConfig = loadTelegramConfig();
    if (telegramConfig && this.strategy) {
      await sendMessage(
        telegramConfig,
        `🛑 <b>Execution Agent Stopped</b>\n\nStrategy: ${this.strategy.name}\nCycles: ${this.cycleCount}\nTrades: ${this.tradesExecuted}\nTotal PnL: $${this.totalPnl.toFixed(2)}`
      );
    }
  }

  /**
   * Run a single evaluation and execution cycle
   */
  private async runCycle(): Promise<void> {
    if (!this.strategy) {
      this.lastError = "No strategy configured";
      return;
    }

    const riskManager = getRiskManager();
    const circuitBreaker = riskManager.getCircuitBreakerStatus();

    // Check circuit breaker
    if (circuitBreaker.tripped) {
      this.lastError = `Circuit breaker active - ${circuitBreaker.cooldownRemainingMinutes} min remaining`;
      return;
    }

    try {
      this.cycleCount++;
      this.lastCycleAt = new Date();

      // Build evaluation prompt based on strategy
      const prompt = this.buildEvaluationPrompt();

      // Run agent to evaluate and potentially execute
      const result = await this.run(prompt, WorkflowStage.EXECUTION);

      if (result.success) {
        // Parse result for trade execution metrics
        if (result.data?.tradesExecuted) {
          this.tradesExecuted += Number(result.data.tradesExecuted);
        }
        if (result.data?.pnl) {
          this.totalPnl += Number(result.data.pnl);
        }
        this.lastError = undefined;
      } else {
        this.lastError = result.error || "Cycle failed";
      }
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      console.error("[ExecutionAgent] Cycle error:", this.lastError);
    }
  }

  /**
   * Build the evaluation prompt based on current strategy
   */
  private buildEvaluationPrompt(): string {
    if (!this.strategy) {
      return "No strategy configured. Please stop and reconfigure.";
    }

    const { name, coinSource, indicators, riskControl } = this.strategy;

    // Build symbols list
    let symbols = "all available USDT pairs";
    if (coinSource.sourceType === "static" && coinSource.staticCoins) {
      symbols = coinSource.staticCoins.join(", ");
    }

    // Build indicators list
    const enabledIndicators: string[] = [];
    if (indicators.enableEMA) enabledIndicators.push(`EMA(${indicators.emaPeriods.join(",")})`);
    if (indicators.enableMACD) enabledIndicators.push("MACD");
    if (indicators.enableRSI) enabledIndicators.push(`RSI(${indicators.rsiPeriods.join(",")})`);
    if (indicators.enableATR) enabledIndicators.push(`ATR(${indicators.atrPeriods.join(",")})`);
    if (indicators.enableVolume) enabledIndicators.push("Volume");
    if (indicators.enableOI) enabledIndicators.push("OpenInterest");
    if (indicators.enableFundingRate) enabledIndicators.push("FundingRate");

    return `
## Evaluation Cycle #${this.cycleCount}
Mode: ${this.mode.toUpperCase()}
Strategy: ${name}

## Configuration
- Symbols: ${symbols}
- Indicators: ${enabledIndicators.join(", ")}
- Max Positions: ${riskControl.maxPositions}
- Min Confidence: ${riskControl.minConfidence}%
- Min Risk/Reward: ${riskControl.minRiskRewardRatio}

## Tasks
1. Get current positions with donut_get_positions
2. For each symbol, get current price with donut_get_price
3. Evaluate entry signals for symbols without positions
4. Evaluate exit signals for open positions
5. Execute trades that meet ${riskControl.minConfidence}%+ confidence

${this.mode === "live" ? "⚠️ LIVE MODE - Real money at risk. Be conservative." : "📊 PAPER MODE - Safe to experiment."}

${this.strategy.customPrompt ? `\n## Custom Rules\n${this.strategy.customPrompt}` : ""}
`.trim();
  }

  /**
   * Emergency stop - closes all positions and stops
   */
  async emergencyStop(): Promise<void> {
    this.running = false;

    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }

    // Try to close all positions in live mode
    if (this.mode === "live") {
      const client = getDonutBrowserClient();
      if (client) {
        try {
          await client.closeAllPositions();
        } catch (error) {
          console.error("[ExecutionAgent] Failed to close positions:", error);
        }
      }
    }

    // Notify via Telegram
    const telegramConfig = loadTelegramConfig();
    if (telegramConfig) {
      await sendRiskAlert(telegramConfig, "circuit_breaker", {
        consecutiveLosses: "EMERGENCY",
        cooldownMinutes: "Manual",
        resumeTime: "Manual restart required",
      });
    }
  }

  /**
   * Get current execution status
   */
  getStatus(): ExecutionStatus {
    return {
      mode: this.mode,
      running: this.running,
      strategyName: this.strategy?.name || "None",
      startedAt: this.startedAt,
      cycleCount: this.cycleCount,
      tradesExecuted: this.tradesExecuted,
      totalPnl: this.totalPnl,
      lastCycleAt: this.lastCycleAt,
      lastError: this.lastError,
    };
  }

  /**
   * Manual execution - run a single trade decision
   */
  async evaluateAndExecute(
    symbol: string,
    context?: string
  ): Promise<AgentResult> {
    const prompt = `Evaluate ${symbol} for a potential trade:

${context || "Use the configured strategy to determine if entry or exit is warranted."}

1. Get the current price for ${symbol}
2. Check if we have an existing position
3. Evaluate based on strategy indicators
4. If confidence is high enough, execute the trade
5. Explain your reasoning

Mode: ${this.mode.toUpperCase()}`;

    return this.run(prompt, WorkflowStage.EXECUTION);
  }

  /**
   * Get positions from Donut Browser
   */
  async getCurrentPositions(): Promise<Position[]> {
    if (this.mode === "paper") {
      // For paper mode, return empty (paper positions managed separately)
      return [];
    }

    const client = getDonutBrowserClient();
    if (!client) {
      return [];
    }

    try {
      return await client.getPositions();
    } catch {
      return [];
    }
  }
}

/**
 * Create a new Execution Agent
 */
export function createExecutionAgent(config: AgentConfig): ExecutionAgent {
  return new ExecutionAgent(config);
}
