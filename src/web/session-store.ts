/**
 * Web Session Store
 *
 * File-based persistence for web chat sessions.
 * Stores conversation history and agent session IDs for resume.
 */

import { promises as fs } from "fs";
import { join, resolve, sep } from "path";
import { z } from "zod";

// ============================================================================
// Security: Session ID Validation
// ============================================================================

/**
 * Valid session ID pattern: alphanumeric, underscores, hyphens only
 * Prevents path traversal attacks
 */
const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Validate session ID format to prevent path traversal
 */
function validateSessionId(sessionId: string): void {
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw new Error(
      `Invalid session ID format: "${sessionId}". ` +
        `Session IDs must contain only alphanumeric characters, underscores, and hyphens.`
    );
  }

  if (
    sessionId.includes("..") ||
    sessionId.includes("/") ||
    sessionId.includes("\\")
  ) {
    throw new Error(
      `Path traversal attempt detected in session ID: "${sessionId}"`
    );
  }
}

// ============================================================================
// Schema Definitions
// ============================================================================

const WebMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  agentType: z.string().optional(),
  timestamp: z.string(),
  toolUse: z
    .array(
      z.object({
        toolName: z.string(),
        status: z.enum(["pending", "success", "error"]),
        input: z.unknown().optional(),
        output: z.unknown().optional(),
      })
    )
    .optional(),
});

export type WebMessage = z.infer<typeof WebMessageSchema>;

const WebSessionSchema = z.object({
  sessionId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  agentSessionId: z.string().optional(),
  currentAgentType: z.string().optional(),
  messages: z.array(WebMessageSchema),
  title: z.string().optional(),
});

export type WebSession = z.infer<typeof WebSessionSchema>;

// ============================================================================
// Session Store
// ============================================================================

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);
  const random = Math.random().toString(36).substring(2, 8);
  return `web_${timestamp}_${random}`;
}

export class WebSessionStore {
  private sessionDir: string;

  constructor(sessionDir: string = ".web-sessions") {
    this.sessionDir = sessionDir;
  }

  /**
   * Ensure session directory exists
   */
  private async ensureDir(): Promise<void> {
    try {
      await fs.mkdir(this.sessionDir, { recursive: true });
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code !== "EEXIST") {
        throw new Error(
          `Failed to create session directory "${this.sessionDir}": ${nodeError.message}`
        );
      }
    }
  }

  /**
   * Get the file path for a session with security check
   */
  private getSessionPath(sessionId: string): string {
    const resolvedDir = resolve(this.sessionDir);
    const filePath = resolve(resolvedDir, `${sessionId}.json`);

    if (!filePath.startsWith(resolvedDir + sep)) {
      throw new Error(
        `Security violation: Path traversal detected. ` +
          `Session file path "${filePath}" is outside session directory "${resolvedDir}"`
      );
    }

    return filePath;
  }

  /**
   * Create a new session
   */
  async createSession(title?: string): Promise<WebSession> {
    await this.ensureDir();

    const now = new Date().toISOString();
    const session: WebSession = {
      sessionId: generateSessionId(),
      createdAt: now,
      updatedAt: now,
      messages: [],
      title: title || `Chat ${new Date().toLocaleString()}`,
    };

    await this.saveSession(session);
    return session;
  }

  /**
   * Get a session by ID
   */
  async getSession(sessionId: string): Promise<WebSession | null> {
    validateSessionId(sessionId);

    const filePath = this.getSessionPath(sessionId);
    try {
      const data = await fs.readFile(filePath, "utf-8");
      const parsed = JSON.parse(data);

      const result = WebSessionSchema.safeParse(parsed);
      if (!result.success) {
        console.error(
          `Session validation failed for ${sessionId}:`,
          result.error
        );
        return null;
      }

      return result.data;
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  /**
   * Save a session
   */
  async saveSession(session: WebSession): Promise<void> {
    validateSessionId(session.sessionId);
    await this.ensureDir();

    session.updatedAt = new Date().toISOString();
    const filePath = this.getSessionPath(session.sessionId);
    await fs.writeFile(filePath, JSON.stringify(session, null, 2));
  }

  /**
   * Update session with new message
   */
  async addMessage(
    sessionId: string,
    message: Omit<WebMessage, "timestamp">
  ): Promise<WebSession | null> {
    const session = await this.getSession(sessionId);
    if (!session) return null;

    session.messages.push({
      ...message,
      timestamp: new Date().toISOString(),
    });

    await this.saveSession(session);
    return session;
  }

  /**
   * Update agent session ID
   */
  async updateAgentSession(
    sessionId: string,
    agentSessionId: string,
    agentType?: string
  ): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.agentSessionId = agentSessionId;
    if (agentType) {
      session.currentAgentType = agentType;
    }

    await this.saveSession(session);
  }

  /**
   * List all sessions, sorted by most recent first
   */
  async listSessions(): Promise<
    Array<{
      sessionId: string;
      title: string;
      createdAt: string;
      updatedAt: string;
      messageCount: number;
    }>
  > {
    await this.ensureDir();

    const files = await fs.readdir(this.sessionDir);
    const sessions: Array<{
      sessionId: string;
      title: string;
      createdAt: string;
      updatedAt: string;
      messageCount: number;
    }> = [];

    for (const file of files) {
      if (!file.endsWith(".json")) continue;

      const sessionId = file.replace(".json", "");
      try {
        const session = await this.getSession(sessionId);
        if (session) {
          sessions.push({
            sessionId: session.sessionId,
            title: session.title || "Untitled",
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            messageCount: session.messages.length,
          });
        }
      } catch {
        // Skip invalid sessions
      }
    }

    // Sort by updatedAt descending (most recent first)
    sessions.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    return sessions;
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<void> {
    validateSessionId(sessionId);
    const filePath = this.getSessionPath(sessionId);
    await fs.unlink(filePath);
  }
}
