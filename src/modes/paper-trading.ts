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
