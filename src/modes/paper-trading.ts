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
} from "../core/types.js";

const PAPER_SESSIONS_DIR = ".sessions/paper";

/**
 * Create a new paper trading session
 */
export async function createPaperSession(
  strategyId: string,
  initialBalance: number
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

/**
 * Execute a paper trade - opens a new position or adds to existing
 */
export async function executePaperTrade(
  sessionId: string,
  symbol: string,
  side: "long" | "short",
  size: number,
  price: number
): Promise<ExecuteTradeResult> {
  const session = await getPaperSession(sessionId);
  if (!session) {
    return { success: false, error: "Session not found" };
  }

  if (session.status !== "running") {
    return { success: false, error: `Session is ${session.status}, not running` };
  }

  // Calculate trade cost (simplified - no leverage simulation)
  const tradeCost = size * price;
  if (tradeCost > session.balance) {
    return { success: false, error: `Insufficient balance: need $${tradeCost.toFixed(2)}, have $${session.balance.toFixed(2)}` };
  }

  // Create the trade record
  const trade: PaperTrade = {
    id: randomUUID(),
    symbol,
    side,
    size,
    entryPrice: price,
    timestamp: Date.now(),
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
    const avgPrice = (existing.entryPrice * existing.size + price * size) / totalSize;

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
      entryPrice: price,
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
 */
export async function closePaperPosition(
  sessionId: string,
  symbol: string,
  exitPrice: number,
  closeSize?: number
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

  // Calculate PnL
  const pnl = calculatePnL(position.side, position.entryPrice, exitPrice, sizeToClose);

  // Find the original trade to update (or create a closing trade record)
  const closingTrade: PaperTrade = {
    id: randomUUID(),
    symbol,
    side: position.side,
    size: sizeToClose,
    entryPrice: position.entryPrice,
    exitPrice,
    pnl,
    timestamp: Date.now(),
    closedAt: Date.now(),
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
