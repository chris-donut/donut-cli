/**
 * Thesis MCP Server - MCP tools for thesis management
 *
 * Provides tools for:
 * - thesis_create: Create a new trading thesis
 * - thesis_update: Modify thesis fields
 * - thesis_list: List theses by status
 * - thesis_get: Retrieve thesis details
 * - thesis_link_position: Associate positions with thesis
 * - thesis_check: Check thesis health and invalidation signals
 *
 * Stores theses in .sessions/theses/ as JSON files.
 *
 * Part of Phase 4: Thesis Trading Layer
 */

import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  mkdirSync,
  existsSync,
} from "fs";
import { join } from "path";
import {
  TradingThesis,
  TradingThesisSchema,
  ThesisStatus,
  ThesisTimeframe,
  CreateThesisInput,
  UpdateThesisInput,
  createThesis,
  getThesisDaysActive,
  isThesisOverdue,
} from "../thesis/types.js";

// ============================================================================
// Configuration
// ============================================================================

let thesesDir = ".sessions/theses";

/**
 * Initialize theses directory
 */
export function initializeThesesDir(dir?: string): void {
  if (dir) {
    thesesDir = dir;
  }
  if (!existsSync(thesesDir)) {
    mkdirSync(thesesDir, { recursive: true });
  }
}

// ============================================================================
// Storage Functions
// ============================================================================

/**
 * Save thesis to disk
 */
function saveThesis(thesis: TradingThesis): void {
  initializeThesesDir();
  const filepath = join(thesesDir, `${thesis.id}.json`);
  writeFileSync(filepath, JSON.stringify(thesis, null, 2));
}

/**
 * Load thesis from disk
 */
function loadThesis(id: string): TradingThesis | null {
  initializeThesesDir();
  const filepath = join(thesesDir, `${id}.json`);
  if (!existsSync(filepath)) {
    return null;
  }
  try {
    const raw = readFileSync(filepath, "utf-8");
    const parsed = TradingThesisSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Load all theses from disk
 */
function loadAllTheses(): TradingThesis[] {
  initializeThesesDir();
  const files = readdirSync(thesesDir).filter((f) => f.endsWith(".json"));
  const theses: TradingThesis[] = [];

  for (const file of files) {
    try {
      const raw = readFileSync(join(thesesDir, file), "utf-8");
      const parsed = TradingThesisSchema.safeParse(JSON.parse(raw));
      if (parsed.success) {
        theses.push(parsed.data);
      }
    } catch {
      // Skip invalid files
    }
  }

  return theses;
}

// ============================================================================
// MCP Tools
// ============================================================================

/**
 * Create a new trading thesis
 */
export const thesisCreateTool = tool(
  "thesis_create",
  `Create a new trading thesis with conviction level and assumptions.

A thesis represents a trading conviction (e.g., "BTC will rally due to ETF flows").
Include key assumptions that must hold and signals that would invalidate the thesis.`,
  {
    title: z.string().min(3).max(200).describe("Title of the thesis"),
    description: z.string().optional().describe("Detailed description of the thesis"),
    conviction: z.number().min(0).max(100).describe("Conviction level 0-100"),
    timeframe: z
      .enum(["days", "weeks", "months", "years"])
      .describe("Expected holding period"),
    targetAllocation: z
      .number()
      .min(0)
      .max(100)
      .describe("Target portfolio allocation %"),
    keyAssumptions: z
      .array(z.string())
      .optional()
      .describe("Key assumptions that must hold (e.g., 'BTC adoption accelerates')"),
    invalidationSignals: z
      .array(
        z.object({
          description: z.string(),
          type: z.enum(["price", "time", "event", "metric", "custom"]),
          severity: z.enum(["warning", "critical", "fatal"]).optional(),
          priceLevel: z.number().optional(),
          priceDirection: z.enum(["above", "below"]).optional(),
          symbol: z.string().optional(),
        })
      )
      .optional()
      .describe("Signals that would invalidate the thesis"),
    tags: z.array(z.string()).optional().describe("Tags for categorization"),
  },
  async (args) => {
    const thesis = createThesis(args as CreateThesisInput);
    saveThesis(thesis);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              success: true,
              thesisId: thesis.id,
              title: thesis.title,
              status: thesis.status,
              message: `Thesis "${thesis.title}" created with ${thesis.keyAssumptions.length} assumptions and ${thesis.invalidationSignals.length} invalidation signals`,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

/**
 * Update an existing thesis
 */
export const thesisUpdateTool = tool(
  "thesis_update",
  `Update fields of an existing thesis.

Can update conviction level, status, target allocation, and other fields.`,
  {
    thesisId: z.string().uuid().describe("ID of the thesis to update"),
    title: z.string().min(3).max(200).optional().describe("New title"),
    description: z.string().optional().describe("New description"),
    conviction: z.number().min(0).max(100).optional().describe("New conviction level"),
    timeframe: z.enum(["days", "weeks", "months", "years"]).optional(),
    targetAllocation: z.number().min(0).max(100).optional(),
    status: z.enum(["draft", "active", "invalidated", "closed"]).optional(),
    tags: z.array(z.string()).optional(),
    notes: z.string().optional(),
  },
  async (args) => {
    const thesis = loadThesis(args.thesisId);
    if (!thesis) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ success: false, error: "Thesis not found" }),
          },
        ],
      };
    }

    // Apply updates
    const updates: UpdateThesisInput = {};
    if (args.title !== undefined) updates.title = args.title;
    if (args.description !== undefined) updates.description = args.description;
    if (args.conviction !== undefined) updates.conviction = args.conviction;
    if (args.timeframe !== undefined) updates.timeframe = args.timeframe as ThesisTimeframe;
    if (args.targetAllocation !== undefined) updates.targetAllocation = args.targetAllocation;
    if (args.status !== undefined) updates.status = args.status as ThesisStatus;
    if (args.tags !== undefined) updates.tags = args.tags;
    if (args.notes !== undefined) updates.notes = args.notes;

    Object.assign(thesis, updates);
    thesis.updatedAt = new Date().toISOString();

    if (args.status === "closed" || args.status === "invalidated") {
      thesis.closedAt = new Date().toISOString();
    }

    saveThesis(thesis);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              success: true,
              thesisId: thesis.id,
              updatedFields: Object.keys(updates),
              message: `Thesis "${thesis.title}" updated`,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

/**
 * List theses with optional filtering
 */
export const thesisListTool = tool(
  "thesis_list",
  `List all trading theses with optional status filtering.

Returns summary information for each thesis including conviction, P&L, and status.`,
  {
    status: z
      .enum(["draft", "active", "invalidated", "closed", "all"])
      .optional()
      .default("all")
      .describe("Filter by status"),
    sortBy: z
      .enum(["conviction", "pnl", "created", "updated"])
      .optional()
      .default("updated")
      .describe("Sort order"),
  },
  async (args) => {
    let theses = loadAllTheses();

    // Filter by status
    if (args.status && args.status !== "all") {
      theses = theses.filter((t) => t.status === args.status);
    }

    // Sort
    switch (args.sortBy) {
      case "conviction":
        theses.sort((a, b) => b.conviction - a.conviction);
        break;
      case "pnl":
        theses.sort((a, b) => b.metrics.totalPnl - a.metrics.totalPnl);
        break;
      case "created":
        theses.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        break;
      case "updated":
      default:
        theses.sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
        break;
    }

    const summaries = theses.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      conviction: t.conviction,
      timeframe: t.timeframe,
      targetAllocation: t.targetAllocation,
      currentAllocation: t.metrics.currentAllocation,
      totalPnl: t.metrics.totalPnl,
      positionCount: t.metrics.positionCount,
      daysActive: getThesisDaysActive(t),
      isOverdue: isThesisOverdue(t),
      tags: t.tags,
    }));

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              success: true,
              totalTheses: summaries.length,
              theses: summaries,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

/**
 * Get full details of a thesis
 */
export const thesisGetTool = tool(
  "thesis_get",
  `Get complete details of a specific thesis.

Returns all fields including assumptions, invalidation signals, and linked positions.`,
  {
    thesisId: z.string().uuid().describe("ID of the thesis"),
  },
  async (args) => {
    const thesis = loadThesis(args.thesisId);
    if (!thesis) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ success: false, error: "Thesis not found" }),
          },
        ],
      };
    }

    // Add computed fields
    const enriched = {
      ...thesis,
      computed: {
        daysActive: getThesisDaysActive(thesis),
        isOverdue: isThesisOverdue(thesis),
        validAssumptions: thesis.keyAssumptions.filter((a) => a.isValid === true).length,
        invalidAssumptions: thesis.keyAssumptions.filter((a) => a.isValid === false).length,
        untestedAssumptions: thesis.keyAssumptions.filter((a) => a.isValid === null).length,
        triggeredSignals: thesis.invalidationSignals.filter((s) => s.triggered).length,
      },
    };

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ success: true, thesis: enriched }, null, 2),
        },
      ],
    };
  }
);

/**
 * Link a position to a thesis
 */
export const thesisLinkPositionTool = tool(
  "thesis_link_position",
  `Associate a trading position with a thesis.

Links track which positions express which thesis, enabling thesis-level P&L tracking.`,
  {
    thesisId: z.string().uuid().describe("ID of the thesis"),
    positionId: z.string().describe("ID of the position to link"),
    symbol: z.string().describe("Trading symbol"),
    side: z.enum(["long", "short"]).describe("Position side"),
    entryPrice: z.number().positive().describe("Entry price"),
    size: z.number().positive().describe("Position size"),
    allocationPercent: z
      .number()
      .min(0)
      .max(100)
      .describe("% of thesis allocation this position represents"),
  },
  async (args) => {
    const thesis = loadThesis(args.thesisId);
    if (!thesis) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ success: false, error: "Thesis not found" }),
          },
        ],
      };
    }

    // Check if position already linked
    const existing = thesis.linkedPositions.find(
      (p) => p.positionId === args.positionId
    );
    if (existing) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: "Position already linked to this thesis",
            }),
          },
        ],
      };
    }

    // Add linked position
    thesis.linkedPositions.push({
      positionId: args.positionId,
      symbol: args.symbol,
      side: args.side,
      entryPrice: args.entryPrice,
      size: args.size,
      linkedAt: new Date().toISOString(),
      allocationPercent: args.allocationPercent,
    });

    // Update metrics
    thesis.metrics.positionCount = thesis.linkedPositions.length;
    thesis.metrics.currentAllocation = thesis.linkedPositions.reduce(
      (sum, p) => sum + p.allocationPercent,
      0
    );
    thesis.updatedAt = new Date().toISOString();

    // Activate thesis if it was draft
    if (thesis.status === "draft") {
      thesis.status = "active";
    }

    saveThesis(thesis);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              success: true,
              thesisId: thesis.id,
              positionId: args.positionId,
              totalPositions: thesis.linkedPositions.length,
              currentAllocation: thesis.metrics.currentAllocation,
              message: `Position ${args.symbol} ${args.side} linked to thesis "${thesis.title}"`,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

/**
 * Check thesis health and invalidation status
 */
export const thesisCheckTool = tool(
  "thesis_check",
  `Check the health of a thesis by evaluating assumptions and invalidation signals.

Returns current status of all assumptions and whether any invalidation signals have triggered.`,
  {
    thesisId: z.string().uuid().describe("ID of the thesis to check"),
  },
  async (args) => {
    const thesis = loadThesis(args.thesisId);
    if (!thesis) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ success: false, error: "Thesis not found" }),
          },
        ],
      };
    }

    const daysActive = getThesisDaysActive(thesis);
    const isOverdue = isThesisOverdue(thesis);

    // Count assumption statuses
    const validAssumptions = thesis.keyAssumptions.filter(
      (a) => a.isValid === true
    ).length;
    const invalidAssumptions = thesis.keyAssumptions.filter(
      (a) => a.isValid === false
    ).length;
    const untestedAssumptions = thesis.keyAssumptions.filter(
      (a) => a.isValid === null
    ).length;

    // Count triggered invalidation signals
    const triggeredSignals = thesis.invalidationSignals.filter(
      (s) => s.triggered
    );
    const fatalSignals = triggeredSignals.filter((s) => s.severity === "fatal");
    const criticalSignals = triggeredSignals.filter(
      (s) => s.severity === "critical"
    );

    // Calculate health score (simple heuristic)
    let healthScore = 100;

    // Deduct for invalid assumptions
    if (thesis.keyAssumptions.length > 0) {
      const assumptionPenalty =
        (invalidAssumptions / thesis.keyAssumptions.length) * 40;
      healthScore -= assumptionPenalty;
    }

    // Deduct for triggered signals
    healthScore -= fatalSignals.length * 30;
    healthScore -= criticalSignals.length * 20;

    // Deduct if overdue
    if (isOverdue) {
      healthScore -= 15;
    }

    healthScore = Math.max(0, Math.min(100, healthScore));

    // Determine recommendation
    let recommendation: "increase" | "hold" | "reduce" | "close";
    if (fatalSignals.length > 0 || healthScore < 20) {
      recommendation = "close";
    } else if (criticalSignals.length > 0 || healthScore < 50) {
      recommendation = "reduce";
    } else if (healthScore > 80 && invalidAssumptions === 0) {
      recommendation = "increase";
    } else {
      recommendation = "hold";
    }

    const healthCheck = {
      thesisId: thesis.id,
      title: thesis.title,
      status: thesis.status,
      conviction: thesis.conviction,
      healthScore: Math.round(healthScore),
      recommendation,
      daysActive,
      isOverdue,
      assumptions: {
        total: thesis.keyAssumptions.length,
        valid: validAssumptions,
        invalid: invalidAssumptions,
        untested: untestedAssumptions,
      },
      invalidationSignals: {
        total: thesis.invalidationSignals.length,
        triggered: triggeredSignals.length,
        fatal: fatalSignals.length,
        critical: criticalSignals.length,
        details: triggeredSignals.map((s) => ({
          description: s.description,
          severity: s.severity,
          triggeredAt: s.triggeredAt,
        })),
      },
      metrics: thesis.metrics,
    };

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ success: true, health: healthCheck }, null, 2),
        },
      ],
    };
  }
);

// ============================================================================
// MCP Server Factory
// ============================================================================

/**
 * Create the Thesis MCP server
 */
export function createThesisMcpServer() {
  return createSdkMcpServer({
    name: "thesis",
    version: "0.1.0",
    tools: [
      thesisCreateTool,
      thesisUpdateTool,
      thesisListTool,
      thesisGetTool,
      thesisLinkPositionTool,
      thesisCheckTool,
    ],
  });
}

/**
 * All thesis tool names
 */
export const THESIS_TOOLS = [
  "thesis_create",
  "thesis_update",
  "thesis_list",
  "thesis_get",
  "thesis_link_position",
  "thesis_check",
] as const;
