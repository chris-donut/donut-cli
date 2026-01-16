/**
 * Demo Mode Data Generator
 *
 * Provides sample data for new users to learn the CLI without setting up backends.
 * All demo data is realistic but clearly marked as [DEMO].
 */

import { randomUUID } from "crypto";
import {
  StrategyConfig,
  BacktestMetrics,
  TradeEvent,
  EquityPoint,
} from "../core/types.js";

// ============================================================================
// Demo Prefix
// ============================================================================

export const DEMO_PREFIX = "[DEMO]";

/**
 * Check if a name is a demo item
 */
export function isDemoItem(name: string): boolean {
  return name.startsWith(DEMO_PREFIX);
}

// ============================================================================
// Demo Strategy Generator
// ============================================================================

/**
 * Generate a sample momentum strategy for demo mode
 */
export function generateDemoStrategy(): StrategyConfig {
  return {
    name: `${DEMO_PREFIX} Momentum Breakout Strategy`,
    description: "A trend-following strategy that identifies breakout opportunities using EMA crossovers and RSI confirmation. Targets high-momentum coins with strong volume.",
    coinSource: {
      sourceType: "static",
      staticCoins: ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
      useCoinPool: false,
      coinPoolLimit: 10,
      useOITop: false,
      oiTopLimit: 10,
    },
    indicators: {
      enableEMA: true,
      enableMACD: true,
      enableRSI: true,
      enableATR: true,
      enableVolume: true,
      enableOI: true,
      enableFundingRate: true,
      emaPeriods: [9, 21],
      rsiPeriods: [14],
      atrPeriods: [14],
    },
    riskControl: {
      maxPositions: 3,
      btcEthMaxLeverage: 10,
      altcoinMaxLeverage: 5,
      maxMarginUsage: 0.8,
      minPositionSize: 50,
      minRiskRewardRatio: 2.5,
      minConfidence: 70,
    },
    customPrompt: "Focus on entries during high-volume periods. Avoid trading during weekend low-liquidity periods.",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Generate a list of demo strategies for listing
 */
export function generateDemoStrategies(): StrategyConfig[] {
  return [
    generateDemoStrategy(),
    {
      name: `${DEMO_PREFIX} Mean Reversion RSI`,
      description: "Catches oversold/overbought conditions using RSI extremes with tight risk management.",
      coinSource: {
        sourceType: "pool",
        useCoinPool: true,
        coinPoolLimit: 20,
        useOITop: false,
        oiTopLimit: 10,
      },
      indicators: {
        enableEMA: true,
        enableMACD: false,
        enableRSI: true,
        enableATR: true,
        enableVolume: true,
        enableOI: false,
        enableFundingRate: true,
        emaPeriods: [20, 50],
        rsiPeriods: [7, 14],
        atrPeriods: [14],
      },
      riskControl: {
        maxPositions: 5,
        btcEthMaxLeverage: 5,
        altcoinMaxLeverage: 3,
        maxMarginUsage: 0.6,
        minPositionSize: 30,
        minRiskRewardRatio: 2.0,
        minConfidence: 65,
      },
      createdAt: new Date(Date.now() - 86400000 * 7).toISOString(),
      updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    },
    {
      name: `${DEMO_PREFIX} Funding Rate Arb`,
      description: "Exploits funding rate imbalances across perpetual contracts.",
      coinSource: {
        sourceType: "oi_top",
        useOITop: true,
        oiTopLimit: 15,
        useCoinPool: false,
        coinPoolLimit: 10,
      },
      indicators: {
        enableEMA: false,
        enableMACD: false,
        enableRSI: false,
        enableATR: true,
        enableVolume: false,
        enableOI: true,
        enableFundingRate: true,
        emaPeriods: [20, 50],
        rsiPeriods: [14],
        atrPeriods: [14],
      },
      riskControl: {
        maxPositions: 10,
        btcEthMaxLeverage: 3,
        altcoinMaxLeverage: 2,
        maxMarginUsage: 0.9,
        minPositionSize: 100,
        minRiskRewardRatio: 1.5,
        minConfidence: 80,
      },
      createdAt: new Date(Date.now() - 86400000 * 14).toISOString(),
      updatedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    },
  ];
}

// ============================================================================
// Demo Backtest Results Generator
// ============================================================================

/**
 * Generate realistic fake backtest metrics
 */
export function generateDemoBacktestResults(): BacktestMetrics {
  return {
    totalReturnPct: 34.7,
    maxDrawdownPct: 12.3,
    sharpeRatio: 1.85,
    profitFactor: 1.92,
    winRate: 0.58,
    trades: 47,
    avgWin: 2.8,
    avgLoss: -1.4,
    bestSymbol: "SOLUSDT",
    worstSymbol: "BTCUSDT",
    liquidated: false,
    symbolStats: {
      BTCUSDT: {
        trades: 18,
        winRate: 0.55,
        totalPnL: 1250.00,
      },
      ETHUSDT: {
        trades: 15,
        winRate: 0.60,
        totalPnL: 1680.50,
      },
      SOLUSDT: {
        trades: 14,
        winRate: 0.64,
        totalPnL: 2340.00,
      },
    },
  };
}

/**
 * Generate alternative backtest results (for comparison views)
 */
export function generateDemoBacktestResultsVariant(seed: number): BacktestMetrics {
  // Create slight variations based on seed
  const multiplier = 0.8 + (seed % 5) * 0.1;

  return {
    totalReturnPct: 28.5 * multiplier,
    maxDrawdownPct: 15.2 * multiplier,
    sharpeRatio: 1.6 * multiplier,
    profitFactor: 1.75 * multiplier,
    winRate: 0.52 + (seed % 10) * 0.01,
    trades: 35 + (seed % 20),
    avgWin: 2.5 * multiplier,
    avgLoss: -1.6 * multiplier,
    bestSymbol: seed % 2 === 0 ? "ETHUSDT" : "BTCUSDT",
    worstSymbol: seed % 2 === 0 ? "SOLUSDT" : "ETHUSDT",
    liquidated: false,
  };
}

// ============================================================================
// Demo Trade Generator
// ============================================================================

const DEMO_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "AVAXUSDT", "LINKUSDT"];

/**
 * Generate 10-20 sample trades with realistic data
 */
export function generateDemoTrades(count: number = 15): TradeEvent[] {
  const trades: TradeEvent[] = [];
  const now = Date.now();
  const dayMs = 86400000;

  // Base prices for each symbol
  const basePrices: Record<string, number> = {
    BTCUSDT: 97500,
    ETHUSDT: 3850,
    SOLUSDT: 215,
    AVAXUSDT: 42,
    LINKUSDT: 18.5,
  };

  let cycle = 1;

  for (let i = 0; i < count; i++) {
    const symbol = DEMO_SYMBOLS[i % DEMO_SYMBOLS.length];
    const basePrice = basePrices[symbol];
    const isLong = Math.random() > 0.45; // Slight long bias
    const side = isLong ? "long" : "short";

    // Entry trade
    const entryTimestamp = now - dayMs * (count - i) + Math.random() * dayMs * 0.5;
    const entryPriceVariation = (Math.random() - 0.5) * 0.04; // ±2% variation
    const entryPrice = basePrice * (1 + entryPriceVariation);
    const quantity = Math.round((200 + Math.random() * 300) / entryPrice * 1000) / 1000;
    const leverage = symbol.includes("BTC") || symbol.includes("ETH") ? 5 : 3;

    trades.push({
      timestamp: entryTimestamp,
      symbol,
      action: "open",
      side,
      quantity,
      price: Math.round(entryPrice * 100) / 100,
      fee: Math.round(quantity * entryPrice * 0.0004 * 100) / 100, // 0.04% fee
      slippage: Math.round(entryPrice * 0.0001 * 100) / 100, // 0.01% slippage
      orderValue: Math.round(quantity * entryPrice * 100) / 100,
      leverage,
      cycle,
      liquidationFlag: false,
    });

    // Exit trade (75% of trades are closed)
    if (Math.random() > 0.25) {
      const holdTime = dayMs * (0.1 + Math.random() * 2); // 0.1-2 days
      const exitTimestamp = entryTimestamp + holdTime;

      // Slight winning bias for realism
      const winProbability = 0.55;
      const isWin = Math.random() < winProbability;
      const movePercent = isWin
        ? 0.01 + Math.random() * 0.04  // 1-5% win
        : -(0.005 + Math.random() * 0.02); // 0.5-2.5% loss

      const exitPrice = isLong
        ? entryPrice * (1 + movePercent)
        : entryPrice * (1 - movePercent);

      const realizedPnL = isLong
        ? (exitPrice - entryPrice) * quantity * leverage
        : (entryPrice - exitPrice) * quantity * leverage;

      trades.push({
        timestamp: exitTimestamp,
        symbol,
        action: "close",
        side,
        quantity,
        price: Math.round(exitPrice * 100) / 100,
        fee: Math.round(quantity * exitPrice * 0.0004 * 100) / 100,
        slippage: Math.round(exitPrice * 0.0001 * 100) / 100,
        orderValue: Math.round(quantity * exitPrice * 100) / 100,
        realizedPnL: Math.round(realizedPnL * 100) / 100,
        leverage,
        cycle,
        liquidationFlag: false,
      });

      cycle++;
    }
  }

  // Sort by timestamp
  return trades.sort((a, b) => a.timestamp - b.timestamp);
}

// ============================================================================
// Demo Equity Curve Generator
// ============================================================================

/**
 * Generate a demo equity curve for visualization
 */
export function generateDemoEquityCurve(
  initialBalance: number = 10000,
  days: number = 30,
  pointsPerDay: number = 4
): EquityPoint[] {
  const points: EquityPoint[] = [];
  const now = Date.now();
  const dayMs = 86400000;
  const intervalMs = dayMs / pointsPerDay;

  let equity = initialBalance;
  let maxEquity = equity;
  let cycle = 1;

  for (let i = 0; i <= days * pointsPerDay; i++) {
    const timestamp = now - dayMs * days + i * intervalMs;

    // Simulate daily returns with slight upward drift
    const dailyReturn = (Math.random() - 0.48) * 0.015; // -0.72% to +0.78%
    equity *= (1 + dailyReturn);

    // Track max for drawdown
    if (equity > maxEquity) {
      maxEquity = equity;
    }

    const drawdownPct = ((maxEquity - equity) / maxEquity) * 100;
    const pnl = equity - initialBalance;
    const pnlPct = (pnl / initialBalance) * 100;

    points.push({
      timestamp,
      equity: Math.round(equity * 100) / 100,
      available: Math.round(equity * 0.85 * 100) / 100, // 85% available
      pnl: Math.round(pnl * 100) / 100,
      pnlPct: Math.round(pnlPct * 100) / 100,
      drawdownPct: Math.round(drawdownPct * 100) / 100,
      cycle,
    });

    // Increment cycle occasionally
    if (Math.random() < 0.1) {
      cycle++;
    }
  }

  return points;
}

// ============================================================================
// Demo Backtest Run Generator
// ============================================================================

export interface DemoBacktestRun {
  runId: string;
  strategyName: string;
  status: "completed";
  startedAt: number;
  completedAt: number;
  config: {
    symbols: string[];
    startTs: number;
    endTs: number;
    initialBalance: number;
    leverage: number;
  };
  metrics: BacktestMetrics;
}

/**
 * Generate a list of recent demo backtest runs
 */
export function generateDemoBacktestRuns(count: number = 5): DemoBacktestRun[] {
  const runs: DemoBacktestRun[] = [];
  const now = Date.now();
  const dayMs = 86400000;

  const strategies = generateDemoStrategies();

  for (let i = 0; i < count; i++) {
    const strategy = strategies[i % strategies.length];
    const startedAt = now - dayMs * (count - i) - Math.random() * dayMs * 0.5;
    const duration = 30000 + Math.random() * 60000; // 30s - 90s

    runs.push({
      runId: `demo-${randomUUID().slice(0, 8)}`,
      strategyName: strategy.name,
      status: "completed",
      startedAt,
      completedAt: startedAt + duration,
      config: {
        symbols: ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
        startTs: Math.floor((now - dayMs * 90) / 1000),
        endTs: Math.floor((startedAt - dayMs) / 1000),
        initialBalance: 10000,
        leverage: 5,
      },
      metrics: generateDemoBacktestResultsVariant(i),
    });
  }

  return runs;
}
