/**
 * Paper Trading Mode
 * Simulated trading sessions against live or manual price data
 */

import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import {
  PaperSession,
  PaperSessionSchema,
  PaperPosition,
  PaperTrade,
  PaperSessionStatus,
  PriceSource,
} from "../core/types.js";
import { HummingbotClient } from "../integrations/hummingbot-client.js";

const PAPER_SESSIONS_DIR = ".sessions/paper";

/**
 * Create a new paper trading session
 */
export async function createPaperSession(
  strategyId: string,
  initialBalance: number,
  liveMode: boolean = false
): Promise<PaperSession> {
  const session: PaperSession = {
    id: randomUUID(),
    strategyId,
    balance: initialBalance,
    initialBalance,
    positions: [],
    trades: [],
    startedAt: Date.now(),
    status: "running",
    liveMode,
  };

  // Validate with Zod schema
  PaperSessionSchema.parse(session);

  // Persist to file
  await ensurePaperSessionsDir();
  await saveSession(session);

  return session;
}

/**
 * Get a paper trading session by ID
 */
export async function getPaperSession(sessionId: string): Promise<PaperSession | null> {
  const filePath = getSessionPath(sessionId);
  try {
    const data = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(data);
    return PaperSessionSchema.parse(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

/**
 * List all paper trading sessions
 */
export async function listPaperSessions(): Promise<PaperSession[]> {
  await ensurePaperSessionsDir();

  try {
    const files = await fs.readdir(PAPER_SESSIONS_DIR);
    const sessions: PaperSession[] = [];

    for (const file of files) {
      if (file.endsWith(".json")) {
        const filePath = path.join(PAPER_SESSIONS_DIR, file);
        try {
          const data = await fs.readFile(filePath, "utf-8");
          const parsed = JSON.parse(data);
          const session = PaperSessionSchema.parse(parsed);
          sessions.push(session);
        } catch {
          // Skip invalid session files
          continue;
        }
      }
    }

    // Sort by startedAt descending (newest first)
    return sessions.sort((a, b) => b.startedAt - a.startedAt);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

/**
 * Update a paper trading session
 */
export async function updatePaperSession(session: PaperSession): Promise<void> {
  PaperSessionSchema.parse(session);
  await saveSession(session);
}

/**
 * Stop a paper trading session
 */
export async function stopPaperSession(sessionId: string): Promise<PaperSession | null> {
  const session = await getPaperSession(sessionId);
  if (!session) {
    return null;
  }

  session.status = "stopped";
  session.stoppedAt = Date.now();

  await saveSession(session);
  return session;
}

/**
 * Pause a paper trading session
 */
export async function pausePaperSession(sessionId: string): Promise<PaperSession | null> {
  const session = await getPaperSession(sessionId);
  if (!session) {
    return null;
  }

  session.status = "paused";
  await saveSession(session);
  return session;
}

/**
 * Resume a paused paper trading session
 */
export async function resumePaperSession(sessionId: string): Promise<PaperSession | null> {
  const session = await getPaperSession(sessionId);
  if (!session || session.status !== "paused") {
    return null;
  }

  session.status = "running";
  await saveSession(session);
  return session;
}

/**
 * Delete a paper trading session
 */
export async function deletePaperSession(sessionId: string): Promise<boolean> {
  const filePath = getSessionPath(sessionId);
  try {
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

// ============================================================================
// Trade Execution
// ============================================================================

export interface ExecuteTradeResult {
  success: boolean;
  trade?: PaperTrade;
  position?: PaperPosition;
  error?: string;
}

export interface ExecuteTradeOptions {
  sessionId: string;
  symbol: string;
  side: "long" | "short";
  size: number;
  price?: number;
  hummingbotClient?: HummingbotClient;
}

/**
 * Execute a paper trade - opens a new position or adds to existing
 * If price is not provided and hummingbotClient is available, fetches live price
 */
export async function executePaperTrade(
  sessionId: string,
  symbol: string,
  side: "long" | "short",
  size: number,
  price?: number,
  hummingbotClient?: HummingbotClient
): Promise<ExecuteTradeResult> {
  const session = await getPaperSession(sessionId);
  if (!session) {
    return { success: false, error: "Session not found" };
  }

  if (session.status !== "running") {
    return { success: false, error: `Session is ${session.status}, not running` };
  }

  // Determine price and source
  let tradePrice: number;
  let priceSource: PriceSource = "manual";

  if (price !== undefined) {
    tradePrice = price;
    priceSource = "manual";
  } else if (hummingbotClient) {
    // Fetch live price from Hummingbot
    const livePrice = await hummingbotClient.getCurrentPrice(symbol);
    if (!livePrice) {
      return { success: false, error: `Failed to fetch live price for ${symbol}` };
    }
    tradePrice = livePrice.price;
    priceSource = "live";
  } else {
    return { success: false, error: "Price is required when not using live mode" };
  }

  // Calculate trade cost (simplified - no leverage simulation)
  const tradeCost = size * tradePrice;
  if (tradeCost > session.balance) {
    return { success: false, error: `Insufficient balance: need $${tradeCost.toFixed(2)}, have $${session.balance.toFixed(2)}` };
  }

  // Create the trade record
  const trade: PaperTrade = {
    id: randomUUID(),
    symbol,
    side,
    size,
    entryPrice: tradePrice,
    timestamp: Date.now(),
    priceSource,
  };

  // Check if we already have a position in this symbol
  const existingPositionIndex = session.positions.findIndex(
    (p) => p.symbol === symbol && p.side === side
  );

  let position: PaperPosition;

  if (existingPositionIndex >= 0) {
    // Add to existing position (average entry price)
    const existing = session.positions[existingPositionIndex];
    const totalSize = existing.size + size;
    const avgPrice = (existing.entryPrice * existing.size + tradePrice * size) / totalSize;

    position = {
      symbol,
      side,
      size: totalSize,
      entryPrice: avgPrice,
      unrealizedPnl: 0, // Will be calculated on price update
    };

    session.positions[existingPositionIndex] = position;
  } else {
    // Create new position
    position = {
      symbol,
      side,
      size,
      entryPrice: tradePrice,
      unrealizedPnl: 0,
    };

    session.positions.push(position);
  }

  // Deduct from balance and record trade
  session.balance -= tradeCost;
  session.trades.push(trade);

  await saveSession(session);

  return { success: true, trade, position };
}

/**
 * Close a paper position - fully or partially
 * If exitPrice is not provided and hummingbotClient is available, fetches live price
 */
export async function closePaperPosition(
  sessionId: string,
  symbol: string,
  exitPrice?: number,
  closeSize?: number,
  hummingbotClient?: HummingbotClient
): Promise<ExecuteTradeResult> {
  const session = await getPaperSession(sessionId);
  if (!session) {
    return { success: false, error: "Session not found" };
  }

  if (session.status !== "running") {
    return { success: false, error: `Session is ${session.status}, not running` };
  }

  // Find the position
  const positionIndex = session.positions.findIndex((p) => p.symbol === symbol);
  if (positionIndex < 0) {
    return { success: false, error: `No position found for ${symbol}` };
  }

  const position = session.positions[positionIndex];
  const sizeToClose = closeSize ?? position.size;

  if (sizeToClose > position.size) {
    return { success: false, error: `Cannot close ${sizeToClose}, position size is ${position.size}` };
  }

  // Determine exit price and source
  let finalExitPrice: number;
  let priceSource: PriceSource = "manual";

  if (exitPrice !== undefined) {
    finalExitPrice = exitPrice;
    priceSource = "manual";
  } else if (hummingbotClient) {
    // Fetch live price from Hummingbot
    const livePrice = await hummingbotClient.getCurrentPrice(symbol);
    if (!livePrice) {
      return { success: false, error: `Failed to fetch live price for ${symbol}` };
    }
    finalExitPrice = livePrice.price;
    priceSource = "live";
  } else {
    return { success: false, error: "Exit price is required when not using live mode" };
  }

  // Calculate PnL
  const pnl = calculatePnL(position.side, position.entryPrice, finalExitPrice, sizeToClose);

  // Find the original trade to update (or create a closing trade record)
  const closingTrade: PaperTrade = {
    id: randomUUID(),
    symbol,
    side: position.side,
    size: sizeToClose,
    entryPrice: position.entryPrice,
    exitPrice: finalExitPrice,
    pnl,
    timestamp: Date.now(),
    closedAt: Date.now(),
    priceSource,
  };

  // Update or remove position
  if (sizeToClose >= position.size) {
    // Full close - remove position
    session.positions.splice(positionIndex, 1);
  } else {
    // Partial close - reduce size
    position.size -= sizeToClose;
  }

  // Add PnL to balance (return principal + profit/loss)
  const returnedCapital = sizeToClose * position.entryPrice;
  session.balance += returnedCapital + pnl;
  session.trades.push(closingTrade);

  await saveSession(session);

  return { success: true, trade: closingTrade };
}

/**
 * Update unrealized PnL for all positions based on current prices
 */
export async function updatePositionPnL(
  sessionId: string,
  prices: Record<string, number>
): Promise<PaperSession | null> {
  const session = await getPaperSession(sessionId);
  if (!session) {
    return null;
  }

  for (const position of session.positions) {
    const currentPrice = prices[position.symbol];
    if (currentPrice !== undefined) {
      position.unrealizedPnl = calculatePnL(
        position.side,
        position.entryPrice,
        currentPrice,
        position.size
      );
    }
  }

  await saveSession(session);
  return session;
}

/**
 * Calculate PnL for a position
 * Long: (exitPrice - entryPrice) * size
 * Short: (entryPrice - exitPrice) * size
 */
function calculatePnL(
  side: "long" | "short",
  entryPrice: number,
  exitPrice: number,
  size: number
): number {
  if (side === "long") {
    return (exitPrice - entryPrice) * size;
  } else {
    return (entryPrice - exitPrice) * size;
  }
}

// ============================================================================
// Metrics Calculation
// ============================================================================

/**
 * Paper trading metrics comparable to backtest metrics
 */
export interface PaperTradingMetrics {
  totalReturnPct: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  profitFactor: number;
  winRate: number;
  trades: number;
  avgWin: number;
  avgLoss: number;
}

/**
 * Calculate metrics from a paper trading session
 * Returns metrics comparable to backtest results for comparison
 */
export function calculatePaperMetrics(session: PaperSession): PaperTradingMetrics {
  const closedTrades = session.trades.filter((t) => t.pnl !== undefined);
  const wins = closedTrades.filter((t) => (t.pnl || 0) > 0);
  const losses = closedTrades.filter((t) => (t.pnl || 0) < 0);

  // Total return
  const totalPnl = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const totalReturnPct = (totalPnl / session.initialBalance) * 100;

  // Win rate
  const winRate = closedTrades.length > 0 ? wins.length / closedTrades.length : 0;

  // Average win/loss (as percentage of initial balance)
  const avgWin = wins.length > 0
    ? (wins.reduce((sum, t) => sum + (t.pnl || 0), 0) / wins.length / session.initialBalance) * 100
    : 0;
  const avgLoss = losses.length > 0
    ? (losses.reduce((sum, t) => sum + Math.abs(t.pnl || 0), 0) / losses.length / session.initialBalance) * 100
    : 0;

  // Profit factor
  const grossProfit = wins.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const grossLoss = Math.abs(losses.reduce((sum, t) => sum + (t.pnl || 0), 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  // Max drawdown - simplified calculation based on running equity
  let maxDrawdownPct = 0;
  let peak = session.initialBalance;
  let runningEquity = session.initialBalance;

  for (const trade of session.trades) {
    if (trade.pnl !== undefined) {
      runningEquity += trade.pnl;
      if (runningEquity > peak) {
        peak = runningEquity;
      }
      const drawdown = ((peak - runningEquity) / peak) * 100;
      if (drawdown > maxDrawdownPct) {
        maxDrawdownPct = drawdown;
      }
    }
  }

  // Sharpe ratio - simplified: (avg return - risk free) / std dev
  // Using daily returns approximation
  const returns: number[] = [];
  let currentEquity = session.initialBalance;
  for (const trade of closedTrades) {
    const prevEquity = currentEquity;
    currentEquity += trade.pnl || 0;
    const dailyReturn = (currentEquity - prevEquity) / prevEquity;
    returns.push(dailyReturn);
  }

  let sharpeRatio = 0;
  if (returns.length > 1) {
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    // Annualized Sharpe (assuming 252 trading days)
    sharpeRatio = stdDev > 0 ? (avgReturn * Math.sqrt(252)) / stdDev : 0;
  }

  return {
    totalReturnPct,
    maxDrawdownPct,
    sharpeRatio,
    profitFactor: profitFactor === Infinity ? 999 : profitFactor,
    winRate,
    trades: closedTrades.length,
    avgWin,
    avgLoss,
  };
}

// ============================================================================
// Internal Helpers
// ============================================================================

function getSessionPath(sessionId: string): string {
  return path.join(PAPER_SESSIONS_DIR, `${sessionId}.json`);
}

async function ensurePaperSessionsDir(): Promise<void> {
  await fs.mkdir(PAPER_SESSIONS_DIR, { recursive: true });
}

async function saveSession(session: PaperSession): Promise<void> {
  const filePath = getSessionPath(session.id);
  await fs.writeFile(filePath, JSON.stringify(session, null, 2), "utf-8");
}
