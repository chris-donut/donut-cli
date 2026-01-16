/**
 * Thesis Trading Types - Formal data model for conviction-based trading
 *
 * Provides structured representation of trading theses including:
 * - Core thesis definition with timeframe and conviction
 * - Key assumptions that must hold for thesis validity
 * - Invalidation signals that would disprove the thesis
 * - Position linking for thesis-to-trade mapping
 *
 * Part of Phase 4: Thesis Trading Layer
 */

import { z } from "zod";

// ============================================================================
// Enums
// ============================================================================

/**
 * Thesis lifecycle status
 */
export const ThesisStatusSchema = z.enum([
  "draft",       // Initial idea, not yet acted upon
  "active",      // Currently trading based on this thesis
  "invalidated", // Thesis proven wrong, positions closed
  "closed",      // Thesis completed (right or wrong), no longer active
]);

export type ThesisStatus = z.infer<typeof ThesisStatusSchema>;

/**
 * Thesis timeframe for expected holding period
 */
export const ThesisTimeframeSchema = z.enum([
  "days",    // Short-term: 1-7 days
  "weeks",   // Medium-term: 1-8 weeks
  "months",  // Long-term: 1-12 months
  "years",   // Very long-term: 1+ years
]);

export type ThesisTimeframe = z.infer<typeof ThesisTimeframeSchema>;

/**
 * Invalidation signal severity
 */
export const InvalidationSeveritySchema = z.enum([
  "warning",  // Concerning but not conclusive
  "critical", // Strongly suggests thesis is wrong
  "fatal",    // Definitively invalidates thesis
]);

export type InvalidationSeverity = z.infer<typeof InvalidationSeveritySchema>;

// ============================================================================
// Core Types
// ============================================================================

/**
 * A key assumption underlying the thesis
 */
export const ThesisAssumptionSchema = z.object({
  id: z.string().uuid(),
  description: z.string().min(5),
  isValid: z.boolean().nullable().default(null), // null = untested
  lastChecked: z.string().datetime().optional(),
  notes: z.string().optional(),
});

export type ThesisAssumption = z.infer<typeof ThesisAssumptionSchema>;

/**
 * A signal that would invalidate the thesis
 */
export const InvalidationSignalSchema = z.object({
  id: z.string().uuid(),
  description: z.string().min(5),
  type: z.enum(["price", "time", "event", "metric", "custom"]),
  triggered: z.boolean().default(false),
  triggeredAt: z.string().datetime().optional(),
  severity: InvalidationSeveritySchema.default("critical"),
  // For price-based signals
  priceLevel: z.number().optional(),
  priceDirection: z.enum(["above", "below"]).optional(),
  symbol: z.string().optional(),
});

export type InvalidationSignal = z.infer<typeof InvalidationSignalSchema>;

/**
 * A position linked to this thesis
 */
export const LinkedPositionSchema = z.object({
  positionId: z.string(),
  symbol: z.string(),
  side: z.enum(["long", "short"]),
  entryPrice: z.number(),
  size: z.number(),
  linkedAt: z.string().datetime(),
  allocationPercent: z.number().min(0).max(100), // % of thesis allocation
});

export type LinkedPosition = z.infer<typeof LinkedPositionSchema>;

/**
 * Thesis metrics for tracking performance
 */
export const ThesisMetricsSchema = z.object({
  totalPnl: z.number().default(0),
  unrealizedPnl: z.number().default(0),
  realizedPnl: z.number().default(0),
  positionCount: z.number().int().default(0),
  winningPositions: z.number().int().default(0),
  losingPositions: z.number().int().default(0),
  currentAllocation: z.number().min(0).max(100).default(0), // actual % allocated
  maxDrawdown: z.number().default(0),
  daysActive: z.number().int().default(0),
});

export type ThesisMetrics = z.infer<typeof ThesisMetricsSchema>;

/**
 * Main Trading Thesis interface
 */
export const TradingThesisSchema = z.object({
  // Identity
  id: z.string().uuid(),
  title: z.string().min(3).max(200),
  description: z.string().optional(),

  // Core conviction
  conviction: z.number().min(0).max(100), // 0-100 scale
  timeframe: ThesisTimeframeSchema,
  status: ThesisStatusSchema.default("draft"),

  // Target allocation
  targetAllocation: z.number().min(0).max(100), // % of portfolio

  // Assumptions and invalidation
  keyAssumptions: z.array(ThesisAssumptionSchema).default([]),
  invalidationSignals: z.array(InvalidationSignalSchema).default([]),

  // Linked positions
  linkedPositions: z.array(LinkedPositionSchema).default([]),

  // Metrics
  metrics: ThesisMetricsSchema.default({
    totalPnl: 0,
    unrealizedPnl: 0,
    realizedPnl: 0,
    positionCount: 0,
    winningPositions: 0,
    losingPositions: 0,
    currentAllocation: 0,
    maxDrawdown: 0,
    daysActive: 0,
  }),

  // Metadata
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  closedAt: z.string().datetime().optional(),
  tags: z.array(z.string()).default([]),
  notes: z.string().optional(),
});

export type TradingThesis = z.infer<typeof TradingThesisSchema>;

// ============================================================================
// Input Types (for creating/updating)
// ============================================================================

/**
 * Input for creating a new thesis
 */
export const CreateThesisInputSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().optional(),
  conviction: z.number().min(0).max(100),
  timeframe: ThesisTimeframeSchema,
  targetAllocation: z.number().min(0).max(100),
  keyAssumptions: z.array(z.string()).optional(), // Just descriptions, IDs generated
  invalidationSignals: z.array(z.object({
    description: z.string(),
    type: z.enum(["price", "time", "event", "metric", "custom"]),
    severity: InvalidationSeveritySchema.optional(),
    priceLevel: z.number().optional(),
    priceDirection: z.enum(["above", "below"]).optional(),
    symbol: z.string().optional(),
  })).optional(),
  tags: z.array(z.string()).optional(),
});

export type CreateThesisInput = z.infer<typeof CreateThesisInputSchema>;

/**
 * Input for updating a thesis
 */
export const UpdateThesisInputSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().optional(),
  conviction: z.number().min(0).max(100).optional(),
  timeframe: ThesisTimeframeSchema.optional(),
  targetAllocation: z.number().min(0).max(100).optional(),
  status: ThesisStatusSchema.optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

export type UpdateThesisInput = z.infer<typeof UpdateThesisInputSchema>;

// ============================================================================
// Thesis Health Types
// ============================================================================

/**
 * Status of a single assumption check
 */
export const AssumptionStatusSchema = z.object({
  assumptionId: z.string().uuid(),
  description: z.string(),
  isValid: z.boolean().nullable(),
  confidence: z.number().min(0).max(1), // How sure we are
  reasoning: z.string().optional(),
  lastChecked: z.string().datetime(),
});

export type AssumptionStatus = z.infer<typeof AssumptionStatusSchema>;

/**
 * Overall thesis health assessment
 */
export const ThesisHealthSchema = z.object({
  thesisId: z.string().uuid(),
  overallHealth: z.number().min(0).max(100), // 0 = broken, 100 = strong
  assumptionStatuses: z.array(AssumptionStatusSchema),
  triggeredInvalidations: z.array(z.string().uuid()), // IDs of triggered signals
  recommendation: z.enum([
    "increase",  // Thesis strong, consider adding
    "hold",      // Thesis intact, maintain position
    "reduce",    // Thesis weakening, consider trimming
    "close",     // Thesis broken, exit positions
  ]),
  reasoning: z.string(),
  assessedAt: z.string().datetime(),
});

export type ThesisHealth = z.infer<typeof ThesisHealthSchema>;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a new thesis with defaults
 */
export function createThesis(input: CreateThesisInput): TradingThesis {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    title: input.title,
    description: input.description,
    conviction: input.conviction,
    timeframe: input.timeframe,
    status: "draft",
    targetAllocation: input.targetAllocation,
    keyAssumptions: (input.keyAssumptions || []).map(desc => ({
      id: crypto.randomUUID(),
      description: desc,
      isValid: null,
    })),
    invalidationSignals: (input.invalidationSignals || []).map(sig => ({
      id: crypto.randomUUID(),
      description: sig.description,
      type: sig.type,
      triggered: false,
      severity: sig.severity || "critical",
      priceLevel: sig.priceLevel,
      priceDirection: sig.priceDirection,
      symbol: sig.symbol,
    })),
    linkedPositions: [],
    metrics: {
      totalPnl: 0,
      unrealizedPnl: 0,
      realizedPnl: 0,
      positionCount: 0,
      winningPositions: 0,
      losingPositions: 0,
      currentAllocation: 0,
      maxDrawdown: 0,
      daysActive: 0,
    },
    createdAt: now,
    updatedAt: now,
    tags: input.tags || [],
  };
}

/**
 * Calculate days since thesis creation
 */
export function getThesisDaysActive(thesis: TradingThesis): number {
  const created = new Date(thesis.createdAt);
  const now = new Date();
  return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Check if thesis is overdue based on timeframe
 */
export function isThesisOverdue(thesis: TradingThesis): boolean {
  const daysActive = getThesisDaysActive(thesis);
  const maxDays: Record<ThesisTimeframe, number> = {
    days: 7,
    weeks: 56,    // 8 weeks
    months: 365,  // 12 months
    years: 1825,  // 5 years
  };
  return daysActive > maxDays[thesis.timeframe];
}
