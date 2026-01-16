/**
 * Core type definitions and Zod schemas for the trading terminal
 */

import { z } from "zod";

// ============================================================================
// Enums and Constants
// ============================================================================

export enum WorkflowStage {
  DISCOVERY = "discovery",
  STRATEGY_BUILD = "strategy_build",
  BACKTEST = "backtest",
  ANALYSIS = "analysis",
  EXECUTION = "execution",
  REVIEW = "review",
}

export enum AgentType {
  STRATEGY_BUILDER = "strategy_builder",
  BACKTEST_ANALYST = "backtest_analyst",
  CHART_ANALYST = "chart_analyst",
  EXECUTION_ASSISTANT = "execution_assistant",
}

export const STAGE_ORDER: WorkflowStage[] = [
  WorkflowStage.DISCOVERY,
  WorkflowStage.STRATEGY_BUILD,
  WorkflowStage.BACKTEST,
  WorkflowStage.ANALYSIS,
  WorkflowStage.EXECUTION,
  WorkflowStage.REVIEW,
];

// ============================================================================
// Common Schemas
// ============================================================================

export const SymbolSchema = z.string().regex(/^[A-Z]+USDT$/, "Symbol must end with USDT");
export const TimeframeSchema = z.enum(["1m", "3m", "5m", "15m", "30m", "1h", "4h", "1d"]);
export const SideSchema = z.enum(["long", "short"]);

// ============================================================================
// Backtest Schemas (for nofx integration)
// ============================================================================

export const BacktestConfigSchema = z.object({
  runId: z.string().optional(),
  symbols: z.array(SymbolSchema).min(1),
  timeframes: z.array(TimeframeSchema).default(["3m", "15m", "4h"]),
  decisionTimeframe: TimeframeSchema.default("15m"),
  decisionCadenceNBars: z.number().int().positive().default(20),
  startTs: z.number().int().positive(),
  endTs: z.number().int().positive(),
  initialBalance: z.number().positive().default(10000),
  feeBps: z.number().min(0).max(100).default(4),
  slippageBps: z.number().min(0).max(100).default(5),
  customPrompt: z.string().optional(),
  aiConfig: z.object({
    provider: z.string().default("anthropic"),
    model: z.string().default("claude-sonnet-4-20250514"),
    temperature: z.number().min(0).max(1).default(0.4),
  }).optional(),
  leverage: z.object({
    btcEthLeverage: z.number().int().min(1).max(125).default(10),
    altcoinLeverage: z.number().int().min(1).max(125).default(5),
  }).optional(),
  cacheAi: z.boolean().default(true),
  replayOnly: z.boolean().default(false),
});

export type BacktestConfig = z.infer<typeof BacktestConfigSchema>;

export const BacktestStateSchema = z.enum([
  "created",
  "running",
  "paused",
  "stopped",
  "completed",
  "failed",
  "liquidated",
]);

export type BacktestState = z.infer<typeof BacktestStateSchema>;

export const BacktestStatusSchema = z.object({
  runId: z.string(),
  state: BacktestStateSchema,
  progressPct: z.number(),
  processedBars: z.number(),
  currentTime: z.number(),
  decisionCycle: z.number(),
  equity: z.number(),
  unrealizedPnL: z.number(),
  realizedPnL: z.number(),
  note: z.string().optional(),
  lastError: z.string().optional(),
  lastUpdatedIso: z.string().optional(),
});

export type BacktestStatus = z.infer<typeof BacktestStatusSchema>;

export const BacktestMetricsSchema = z.object({
  totalReturnPct: z.number(),
  maxDrawdownPct: z.number(),
  sharpeRatio: z.number(),
  profitFactor: z.number(),
  winRate: z.number(),
  trades: z.number(),
  avgWin: z.number(),
  avgLoss: z.number(),
  bestSymbol: z.string(),
  worstSymbol: z.string(),
  liquidated: z.boolean(),
  symbolStats: z.record(z.string(), z.object({
    trades: z.number(),
    winRate: z.number(),
    totalPnL: z.number(),
  })).optional(),
});

export type BacktestMetrics = z.infer<typeof BacktestMetricsSchema>;

export const EquityPointSchema = z.object({
  timestamp: z.number(),
  equity: z.number(),
  available: z.number(),
  pnl: z.number(),
  pnlPct: z.number(),
  drawdownPct: z.number(),
  cycle: z.number(),
});

export type EquityPoint = z.infer<typeof EquityPointSchema>;

export const TradeEventSchema = z.object({
  timestamp: z.number(),
  symbol: z.string(),
  action: z.enum(["open", "close"]),
  side: SideSchema,
  quantity: z.number(),
  price: z.number(),
  fee: z.number(),
  slippage: z.number(),
  orderValue: z.number(),
  realizedPnL: z.number().optional(),
  leverage: z.number(),
  cycle: z.number(),
  liquidationFlag: z.boolean().default(false),
  note: z.string().optional(),
});

export type TradeEvent = z.infer<typeof TradeEventSchema>;

// ============================================================================
// Strategy Schemas (for harness integration)
// ============================================================================

export const CoinSourceSchema = z.object({
  sourceType: z.enum(["static", "pool", "oi_top"]),
  staticCoins: z.array(SymbolSchema).optional(),
  useCoinPool: z.boolean().default(false),
  coinPoolLimit: z.number().int().positive().default(10),
  useOITop: z.boolean().default(false),
  oiTopLimit: z.number().int().positive().default(10),
});

export const IndicatorConfigSchema = z.object({
  enableEMA: z.boolean().default(true),
  enableMACD: z.boolean().default(true),
  enableRSI: z.boolean().default(true),
  enableATR: z.boolean().default(true),
  enableVolume: z.boolean().default(true),
  enableOI: z.boolean().default(true),
  enableFundingRate: z.boolean().default(true),
  emaPeriods: z.array(z.number().int().positive()).default([20, 50]),
  rsiPeriods: z.array(z.number().int().positive()).default([7, 14]),
  atrPeriods: z.array(z.number().int().positive()).default([14]),
});

export const RiskControlSchema = z.object({
  maxPositions: z.number().int().positive().default(3),
  btcEthMaxLeverage: z.number().int().positive().default(10),
  altcoinMaxLeverage: z.number().int().positive().default(5),
  maxMarginUsage: z.number().min(0).max(1).default(0.9),
  minPositionSize: z.number().positive().default(12),
  minRiskRewardRatio: z.number().positive().default(3.0),
  minConfidence: z.number().int().min(0).max(100).default(75),
});

export const StrategyConfigSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  coinSource: CoinSourceSchema,
  indicators: IndicatorConfigSchema,
  riskControl: RiskControlSchema,
  customPrompt: z.string().max(5000).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type StrategyConfig = z.infer<typeof StrategyConfigSchema>;

// ============================================================================
// Execution Schemas (for Donut Browser integration)
// ============================================================================

export const TradeOrderSchema = z.object({
  symbol: SymbolSchema,
  side: SideSchema,
  quantity: z.number().positive(),
  leverage: z.number().int().min(1).max(125),
  orderType: z.enum(["market", "limit"]),
  limitPrice: z.number().positive().optional(),
  stopLoss: z.number().positive().optional(),
  takeProfit: z.number().positive().optional(),
  confidence: z.number().int().min(0).max(100),
  reasoning: z.string(),
});

export type TradeOrder = z.infer<typeof TradeOrderSchema>;

export const TradeResultSchema = z.object({
  orderId: z.string(),
  symbol: SymbolSchema,
  side: SideSchema,
  quantity: z.number(),
  executedPrice: z.number(),
  fee: z.number(),
  txHash: z.string().optional(),
  status: z.enum(["pending", "filled", "partial", "cancelled", "failed"]),
  timestamp: z.number(),
  error: z.string().optional(),
});

export type TradeResult = z.infer<typeof TradeResultSchema>;

export const PositionSchema = z.object({
  symbol: z.string(),
  side: SideSchema,
  quantity: z.number(),
  entryPrice: z.number(),
  currentPrice: z.number(),
  unrealizedPnL: z.number(),
  unrealizedPnLPct: z.number(),
  leverage: z.number(),
  margin: z.number(),
  liquidationPrice: z.number(),
  openTime: z.number(),
});

export type Position = z.infer<typeof PositionSchema>;

// ============================================================================
// Paper Trading Schemas
// ============================================================================

export const PaperSessionStatusSchema = z.enum(["running", "paused", "stopped"]);
export type PaperSessionStatus = z.infer<typeof PaperSessionStatusSchema>;

export const PaperPositionSchema = z.object({
  symbol: z.string(),
  side: SideSchema,
  size: z.number().positive(),
  entryPrice: z.number().positive(),
  unrealizedPnl: z.number(),
});

export type PaperPosition = z.infer<typeof PaperPositionSchema>;

export const PaperTradeSchema = z.object({
  id: z.string().uuid(),
  symbol: z.string(),
  side: SideSchema,
  size: z.number().positive(),
  entryPrice: z.number().positive(),
  exitPrice: z.number().positive().optional(),
  pnl: z.number().optional(),
  timestamp: z.number(),
  closedAt: z.number().optional(),
});

export type PaperTrade = z.infer<typeof PaperTradeSchema>;

export const PaperSessionSchema = z.object({
  id: z.string().uuid(),
  strategyId: z.string(),
  balance: z.number().positive(),
  initialBalance: z.number().positive(),
  positions: z.array(PaperPositionSchema),
  trades: z.array(PaperTradeSchema),
  startedAt: z.number(),
  stoppedAt: z.number().optional(),
  status: PaperSessionStatusSchema,
});

export type PaperSession = z.infer<typeof PaperSessionSchema>;

// ============================================================================
// Notification Schemas
// ============================================================================

export const NotificationChannelSchema = z.enum(["telegram", "discord", "webhook"]);
export type NotificationChannel = z.infer<typeof NotificationChannelSchema>;

export const TelegramConfigSchema = z.object({
  botToken: z.string().min(1),
  chatId: z.string().min(1),
});

export type TelegramConfig = z.infer<typeof TelegramConfigSchema>;

export const DiscordConfigSchema = z.object({
  webhookUrl: z.string().url(),
});

export type DiscordConfig = z.infer<typeof DiscordConfigSchema>;

export const WebhookConfigSchema = z.object({
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
});

export type WebhookConfig = z.infer<typeof WebhookConfigSchema>;

export const NotificationConfigSchema = z.object({
  channel: NotificationChannelSchema,
  enabled: z.boolean().default(true),
  settings: z.union([TelegramConfigSchema, DiscordConfigSchema, WebhookConfigSchema]),
});

export type NotificationConfig = z.infer<typeof NotificationConfigSchema>;

export const TradeApprovalRequestSchema = z.object({
  tradeId: z.string().uuid(),
  symbol: z.string(),
  side: SideSchema,
  size: z.number().positive(),
  price: z.number().positive(),
  expiresAt: z.number(),
  createdAt: z.number(),
});

export type TradeApprovalRequest = z.infer<typeof TradeApprovalRequestSchema>;

export const ApprovalResponseSchema = z.enum(["APPROVE", "REJECT", "EXPIRED"]);
export type ApprovalResponse = z.infer<typeof ApprovalResponseSchema>;

// ============================================================================
// Session & Workflow Types
// ============================================================================

export interface StageTransition {
  fromStage: WorkflowStage;
  toStage: WorkflowStage;
  timestamp: Date;
  reason: string;
  triggeredBy: "user" | "agent" | "system";
}

export interface ApprovalRequest {
  requestId: string;
  type: "trade" | "strategy" | "backtest";
  payload: unknown;
  status: "pending" | "approved" | "rejected";
  requestedAt: Date;
  respondedAt?: Date;
  reason?: string;
}

export interface SessionState {
  sessionId: string;
  createdAt: Date;
  updatedAt: Date;

  // Current workflow position
  currentStage: WorkflowStage;
  stageHistory: StageTransition[];

  // Agent conversation state (session IDs from Claude Agent SDK)
  agentSessionIds: Partial<Record<AgentType, string>>;

  // Strategy state
  activeStrategy?: StrategyConfig;
  strategyDraft?: Partial<StrategyConfig>;

  // Backtest state
  activeBacktestRunId?: string;
  backtestResults?: BacktestMetrics;

  // Execution state
  pendingTrades: TradeOrder[];
  executedTrades: TradeResult[];
  currentPositions: Position[];

  // Approval state
  pendingApprovals: ApprovalRequest[];

  // Context accumulation
  discoveryInsights: string[];
  analysisResults: string[];
}

// ============================================================================
// Agent Result Types
// ============================================================================

export interface AgentResult {
  agentType: AgentType;
  stage: WorkflowStage;
  success: boolean;
  result: string;
  sessionId?: string;
  timestamp: Date;
  error?: string;
  data?: Record<string, unknown>;
}

export interface StageResult {
  stage: WorkflowStage;
  success: boolean;
  data: Record<string, unknown>;
  message: string;
  timestamp: string;
  nextStage?: WorkflowStage;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface TerminalConfig {
  // Claude Agent SDK
  anthropicApiKey: string;
  model: "sonnet" | "opus" | "haiku";
  maxTurns: number;
  maxBudgetUsd: number;

  // Backend integrations (at least one needed for backtesting)
  hummingbotUrl?: string;
  nofxApiUrl?: string;
  nofxAuthToken?: string;

  // Python harness integration
  harnessWorkingDir?: string;
  pythonPath: string;

  // Donut Browser integration
  donutBrowserUrl?: string;

  // Session management
  sessionDir: string;
  logLevel: "debug" | "info" | "warn" | "error";
}

export const TerminalConfigSchema = z.object({
  anthropicApiKey: z.string().min(1),
  model: z.enum(["sonnet", "opus", "haiku"]).default("sonnet"),
  maxTurns: z.number().int().positive().default(50),
  maxBudgetUsd: z.number().positive().default(5.0),
  // Backend options (at least one should be configured for backtesting)
  hummingbotUrl: z.string().url().optional(),
  nofxApiUrl: z.string().url().optional(),
  nofxAuthToken: z.string().optional(),
  harnessWorkingDir: z.string().optional(),
  pythonPath: z.string().default("python3"),
  donutBrowserUrl: z.string().url().optional(),
  sessionDir: z.string().default(".sessions"),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

// ============================================================================
// Tool Permission Types
// ============================================================================

export interface ToolPermission {
  tool: string;
  mode: "read" | "write";
  requiresApproval?: boolean;
}

export const TOOL_PERMISSIONS: Record<WorkflowStage, ToolPermission[]> = {
  [WorkflowStage.DISCOVERY]: [
    { tool: "strategy_list", mode: "read" },
    { tool: "strategy_get", mode: "read" },
    { tool: "backtest_list_runs", mode: "read" },
    { tool: "backtest_get_metrics", mode: "read" },
    { tool: "donut_get_positions", mode: "read" },
    { tool: "donut_get_balances", mode: "read" },
  ],
  [WorkflowStage.STRATEGY_BUILD]: [
    { tool: "strategy_list", mode: "read" },
    { tool: "strategy_get", mode: "read" },
    { tool: "strategy_validate", mode: "read" },
    { tool: "strategy_preview_prompt", mode: "read" },
    { tool: "strategy_create", mode: "write" },
    { tool: "strategy_update", mode: "write" },
  ],
  [WorkflowStage.BACKTEST]: [
    { tool: "backtest_start", mode: "write" },
    { tool: "backtest_status", mode: "read" },
    { tool: "backtest_pause", mode: "write" },
    { tool: "backtest_resume", mode: "write" },
    { tool: "backtest_stop", mode: "write" },
    { tool: "backtest_get_equity", mode: "read" },
    { tool: "backtest_get_trades", mode: "read" },
    { tool: "backtest_get_metrics", mode: "read" },
    { tool: "backtest_get_decisions", mode: "read" },
  ],
  [WorkflowStage.ANALYSIS]: [
    { tool: "backtest_get_metrics", mode: "read" },
    { tool: "backtest_get_equity", mode: "read" },
    { tool: "backtest_get_trades", mode: "read" },
    { tool: "donut_get_positions", mode: "read" },
    { tool: "donut_get_balances", mode: "read" },
  ],
  [WorkflowStage.EXECUTION]: [
    { tool: "donut_get_wallet", mode: "read" },
    { tool: "donut_get_positions", mode: "read" },
    { tool: "donut_get_balances", mode: "read" },
    { tool: "donut_preview_trade", mode: "read" },
    { tool: "donut_execute_trade", mode: "write", requiresApproval: true },
    { tool: "donut_get_tx_status", mode: "read" },
  ],
  [WorkflowStage.REVIEW]: [
    { tool: "strategy_list", mode: "read" },
    { tool: "strategy_get", mode: "read" },
    { tool: "backtest_get_metrics", mode: "read" },
    { tool: "backtest_list_runs", mode: "read" },
    { tool: "donut_get_positions", mode: "read" },
  ],
};

/**
 * Get allowed tools for a workflow stage
 */
export function getAllowedTools(
  stage: WorkflowStage,
  mode: "read" | "write" | "all" = "all"
): string[] {
  const permissions = TOOL_PERMISSIONS[stage] || [];

  return permissions
    .filter((p) => mode === "all" || p.mode === mode || p.mode === "read")
    .map((p) => p.tool);
}

/**
 * Check if a tool requires approval in a given stage
 */
export function toolRequiresApproval(stage: WorkflowStage, tool: string): boolean {
  const permissions = TOOL_PERMISSIONS[stage] || [];
  const permission = permissions.find((p) => p.tool === tool);
  return permission?.requiresApproval ?? false;
}
