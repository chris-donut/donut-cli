/**
 * Session management for trading terminal
 * Handles persistence and state transitions across workflow stages
 */

import { promises as fs } from "fs";
import path from "path";
import {
  SessionState,
  WorkflowStage,
  AgentType,
  StageTransition,
  ApprovalRequest,
  STAGE_ORDER,
  StrategyConfig,
  BacktestMetrics,
  TradeOrder,
  TradeResult,
  Position,
} from "./types.js";

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const random = Math.random().toString(36).substring(2, 8);
  return `session_${timestamp}_${random}`;
}

/**
 * Create a new empty session state
 */
function createEmptySession(sessionId?: string): SessionState {
  const now = new Date();
  return {
    sessionId: sessionId || generateSessionId(),
    createdAt: now,
    updatedAt: now,
    currentStage: WorkflowStage.DISCOVERY,
    stageHistory: [],
    agentSessionIds: {},
    pendingTrades: [],
    executedTrades: [],
    currentPositions: [],
    pendingApprovals: [],
    discoveryInsights: [],
    analysisResults: [],
  };
}

/**
 * Session Manager - handles session persistence and state transitions
 */
export class SessionManager {
  private state: SessionState;
  private sessionDir: string;

  constructor(sessionDir: string = ".sessions") {
    this.sessionDir = sessionDir;
    this.state = createEmptySession();
  }

  /**
   * Initialize a new session
   */
  async createSession(): Promise<string> {
    this.state = createEmptySession();
    await this.ensureSessionDir();
    await this.save();
    return this.state.sessionId;
  }

  /**
   * Load an existing session
   */
  async loadSession(sessionId: string): Promise<void> {
    const filePath = this.getSessionPath(sessionId);
    try {
      const data = await fs.readFile(filePath, "utf-8");
      const parsed = JSON.parse(data);

      // Convert date strings back to Date objects
      this.state = {
        ...parsed,
        createdAt: new Date(parsed.createdAt),
        updatedAt: new Date(parsed.updatedAt),
        stageHistory: parsed.stageHistory.map((t: StageTransition & { timestamp: string }) => ({
          ...t,
          timestamp: new Date(t.timestamp),
        })),
        pendingApprovals: parsed.pendingApprovals.map((a: ApprovalRequest & { requestedAt: string; respondedAt?: string }) => ({
          ...a,
          requestedAt: new Date(a.requestedAt),
          respondedAt: a.respondedAt ? new Date(a.respondedAt) : undefined,
        })),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(`Session not found: ${sessionId}`);
      }
      throw error;
    }
  }

  /**
   * Save current session to disk
   */
  async save(): Promise<void> {
    this.state.updatedAt = new Date();
    const filePath = this.getSessionPath(this.state.sessionId);
    await this.ensureSessionDir();
    await fs.writeFile(filePath, JSON.stringify(this.state, null, 2));
  }

  /**
   * Get the current session state
   */
  getState(): SessionState {
    return { ...this.state };
  }

  /**
   * Get current workflow stage
   */
  getCurrentStage(): WorkflowStage {
    return this.state.currentStage;
  }

  /**
   * Transition to a new workflow stage
   */
  async transitionStage(
    toStage: WorkflowStage,
    reason: string,
    triggeredBy: "user" | "agent" | "system" = "system"
  ): Promise<void> {
    // Validate transition is allowed
    const targetIndex = STAGE_ORDER.indexOf(toStage);

    // Allow forward progression or going back to earlier stages
    if (targetIndex < 0) {
      throw new Error(`Invalid stage: ${toStage}`);
    }

    const transition: StageTransition = {
      fromStage: this.state.currentStage,
      toStage,
      timestamp: new Date(),
      reason,
      triggeredBy,
    };

    this.state.stageHistory.push(transition);
    this.state.currentStage = toStage;
    await this.save();
  }

  /**
   * Update agent session ID for a specific agent type
   */
  async updateAgentSession(agentType: AgentType, sessionId: string): Promise<void> {
    this.state.agentSessionIds[agentType] = sessionId;
    await this.save();
  }

  /**
   * Get agent session ID if it exists
   */
  getAgentSession(agentType: AgentType): string | undefined {
    return this.state.agentSessionIds[agentType];
  }

  /**
   * Set active strategy
   */
  async setActiveStrategy(strategy: StrategyConfig): Promise<void> {
    this.state.activeStrategy = strategy;
    await this.save();
  }

  /**
   * Set strategy draft (work in progress)
   */
  async setStrategyDraft(draft: Partial<StrategyConfig>): Promise<void> {
    this.state.strategyDraft = draft;
    await this.save();
  }

  /**
   * Set active backtest run
   */
  async setActiveBacktest(runId: string): Promise<void> {
    this.state.activeBacktestRunId = runId;
    await this.save();
  }

  /**
   * Store backtest results
   */
  async setBacktestResults(metrics: BacktestMetrics): Promise<void> {
    this.state.backtestResults = metrics;
    await this.save();
  }

  /**
   * Add a pending trade
   */
  async addPendingTrade(trade: TradeOrder): Promise<void> {
    this.state.pendingTrades.push(trade);
    await this.save();
  }

  /**
   * Remove a pending trade and add to executed
   */
  async executeTrade(tradeIndex: number, result: TradeResult): Promise<void> {
    if (tradeIndex >= 0 && tradeIndex < this.state.pendingTrades.length) {
      this.state.pendingTrades.splice(tradeIndex, 1);
    }
    this.state.executedTrades.push(result);
    await this.save();
  }

  /**
   * Update current positions
   */
  async updatePositions(positions: Position[]): Promise<void> {
    this.state.currentPositions = positions;
    await this.save();
  }

  /**
   * Add an approval request
   */
  async addApprovalRequest(request: Omit<ApprovalRequest, "requestedAt" | "status">): Promise<string> {
    const fullRequest: ApprovalRequest = {
      ...request,
      status: "pending",
      requestedAt: new Date(),
    };
    this.state.pendingApprovals.push(fullRequest);
    await this.save();
    return request.requestId;
  }

  /**
   * Respond to an approval request
   */
  async respondToApproval(
    requestId: string,
    approved: boolean,
    reason?: string
  ): Promise<void> {
    const request = this.state.pendingApprovals.find((r) => r.requestId === requestId);
    if (!request) {
      throw new Error(`Approval request not found: ${requestId}`);
    }

    request.status = approved ? "approved" : "rejected";
    request.respondedAt = new Date();
    request.reason = reason;
    await this.save();
  }

  /**
   * Get pending approvals
   */
  getPendingApprovals(): ApprovalRequest[] {
    return this.state.pendingApprovals.filter((r) => r.status === "pending");
  }

  /**
   * Add discovery insight
   */
  async addDiscoveryInsight(insight: string): Promise<void> {
    this.state.discoveryInsights.push(insight);
    await this.save();
  }

  /**
   * Add analysis result
   */
  async addAnalysisResult(result: string): Promise<void> {
    this.state.analysisResults.push(result);
    await this.save();
  }

  /**
   * Get context for current stage
   */
  getContextForStage(stage: WorkflowStage): Record<string, unknown> {
    const context: Record<string, unknown> = {
      sessionId: this.state.sessionId,
      currentStage: stage,
      stageHistory: this.state.stageHistory,
    };

    // Add relevant data based on stage
    switch (stage) {
      case WorkflowStage.DISCOVERY:
        context.existingStrategy = this.state.activeStrategy;
        context.recentBacktests = this.state.backtestResults;
        break;

      case WorkflowStage.STRATEGY_BUILD:
        context.strategyDraft = this.state.strategyDraft;
        context.activeStrategy = this.state.activeStrategy;
        context.discoveryInsights = this.state.discoveryInsights;
        break;

      case WorkflowStage.BACKTEST:
        context.activeStrategy = this.state.activeStrategy;
        context.activeBacktestRunId = this.state.activeBacktestRunId;
        break;

      case WorkflowStage.ANALYSIS:
        context.backtestResults = this.state.backtestResults;
        context.activeStrategy = this.state.activeStrategy;
        break;

      case WorkflowStage.EXECUTION:
        context.pendingTrades = this.state.pendingTrades;
        context.currentPositions = this.state.currentPositions;
        context.pendingApprovals = this.getPendingApprovals();
        break;

      case WorkflowStage.REVIEW:
        context.executedTrades = this.state.executedTrades;
        context.backtestResults = this.state.backtestResults;
        context.currentPositions = this.state.currentPositions;
        break;
    }

    return context;
  }

  /**
   * List all sessions
   */
  async listSessions(): Promise<string[]> {
    await this.ensureSessionDir();
    const files = await fs.readdir(this.sessionDir);
    return files
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(".json", ""));
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<void> {
    const filePath = this.getSessionPath(sessionId);
    await fs.unlink(filePath);
  }

  // Private helpers

  private getSessionPath(sessionId: string): string {
    return path.join(this.sessionDir, `${sessionId}.json`);
  }

  private async ensureSessionDir(): Promise<void> {
    try {
      await fs.mkdir(this.sessionDir, { recursive: true });
    } catch (error) {
      // Directory already exists, ignore
    }
  }
}
