/**
 * Trade Journal MCP Server - Persistent decision logging with rationale
 *
 * Provides tools for:
 * - journal_entry: Log trade decisions with detailed rationale
 * - journal_search: Find entries by date, symbol, or tag
 * - journal_summary: Generate period summaries
 *
 * Stores entries in .sessions/journal/ as markdown files.
 *
 * Part of Phase 3: Intelligence Layer
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

// ============================================================================
// Configuration
// ============================================================================

let journalDir = ".sessions/journal";

/**
 * Initialize journal directory
 */
export function initializeJournalDir(dir?: string): void {
  if (dir) {
    journalDir = dir;
  }
  if (!existsSync(journalDir)) {
    mkdirSync(journalDir, { recursive: true });
  }
}

// ============================================================================
// Types
// ============================================================================

export interface JournalEntry {
  id: string;
  timestamp: string;
  symbol: string;
  action: "buy" | "sell" | "hold" | "close" | "other";
  rationale: string;
  confidence: number;
  tags: string[];
  marketContext?: string;
  outcome?: {
    result: "profit" | "loss" | "breakeven" | "pending";
    pnl?: number;
    notes?: string;
    resolvedAt?: string;
  };
}

// ============================================================================
// Journal Tools
// ============================================================================

/**
 * Create a new journal entry
 */
export const journalEntryTool = tool(
  "journal_entry",
  `Log a trade decision with detailed rationale to the trade journal.

Creates a markdown file in .sessions/journal/ with:
- Timestamp and symbol
- Action taken (buy/sell/hold/close)
- Confidence level (0-1)
- Detailed rationale
- Market context
- Tags for categorization`,
  {
    symbol: z.string().describe("Trading symbol (e.g., BTCUSDT)"),
    action: z
      .enum(["buy", "sell", "hold", "close", "other"])
      .describe("Action taken"),
    rationale: z
      .string()
      .min(10)
      .describe("Detailed reasoning behind the decision"),
    confidence: z
      .number()
      .min(0)
      .max(1)
      .describe("Confidence level 0-1"),
    tags: z
      .array(z.string())
      .optional()
      .describe("Tags for categorization (e.g., momentum, reversal)"),
    marketContext: z
      .string()
      .optional()
      .describe("Current market conditions and context"),
  },
  async (args) => {
    initializeJournalDir();

    const entry: JournalEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      symbol: args.symbol.toUpperCase(),
      action: args.action,
      rationale: args.rationale,
      confidence: args.confidence,
      tags: args.tags || [],
      marketContext: args.marketContext,
    };

    // Generate filename: YYYY-MM-DD_HH-MM-SS_SYMBOL_ID.md
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10);
    const timeStr = date.toISOString().slice(11, 19).replace(/:/g, "-");
    const filename = `${dateStr}_${timeStr}_${entry.symbol}_${entry.id.slice(0, 8)}.md`;
    const filepath = join(journalDir, filename);

    // Generate markdown content
    const markdown = generateEntryMarkdown(entry);
    writeFileSync(filepath, markdown);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              success: true,
              entryId: entry.id,
              filepath: filename,
              message: `Journal entry created for ${entry.symbol} ${entry.action}`,
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
 * Search journal entries
 */
export const journalSearchTool = tool(
  "journal_search",
  `Search trade journal entries by date range, symbol, or tags.

Returns matching entries with their key details.`,
  {
    startDate: z
      .string()
      .optional()
      .describe("Start date (YYYY-MM-DD format)"),
    endDate: z
      .string()
      .optional()
      .describe("End date (YYYY-MM-DD format)"),
    symbol: z
      .string()
      .optional()
      .describe("Filter by symbol"),
    tag: z
      .string()
      .optional()
      .describe("Filter by tag"),
    action: z
      .enum(["buy", "sell", "hold", "close", "other"])
      .optional()
      .describe("Filter by action type"),
    limit: z
      .number()
      .int()
      .positive()
      .default(20)
      .describe("Maximum entries to return"),
  },
  async (args) => {
    initializeJournalDir();

    const entries = loadAllEntries();
    let filtered = entries;

    // Apply filters
    if (args.startDate) {
      const start = new Date(args.startDate);
      filtered = filtered.filter((e) => new Date(e.timestamp) >= start);
    }

    if (args.endDate) {
      const end = new Date(args.endDate);
      end.setHours(23, 59, 59, 999);
      filtered = filtered.filter((e) => new Date(e.timestamp) <= end);
    }

    if (args.symbol) {
      const sym = args.symbol.toUpperCase();
      filtered = filtered.filter((e) => e.symbol === sym);
    }

    if (args.tag) {
      const tag = args.tag.toLowerCase();
      filtered = filtered.filter((e) =>
        e.tags.some((t) => t.toLowerCase().includes(tag))
      );
    }

    if (args.action) {
      filtered = filtered.filter((e) => e.action === args.action);
    }

    // Sort by timestamp descending (most recent first)
    filtered.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // Apply limit
    filtered = filtered.slice(0, args.limit);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              success: true,
              totalFound: filtered.length,
              entries: filtered.map((e) => ({
                id: e.id,
                timestamp: e.timestamp,
                symbol: e.symbol,
                action: e.action,
                confidence: e.confidence,
                tags: e.tags,
                rationalePreview: e.rationale.slice(0, 100) + "...",
                outcome: e.outcome,
              })),
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
 * Generate summary of journal entries for a period
 */
export const journalSummaryTool = tool(
  "journal_summary",
  `Generate a summary of trade journal entries for a time period.

Provides statistics on:
- Total entries and actions breakdown
- Symbol distribution
- Tag frequency
- Confidence distribution
- Outcome summary (if available)`,
  {
    startDate: z
      .string()
      .optional()
      .describe("Start date (YYYY-MM-DD format)"),
    endDate: z
      .string()
      .optional()
      .describe("End date (YYYY-MM-DD format)"),
    symbol: z
      .string()
      .optional()
      .describe("Filter by symbol"),
  },
  async (args) => {
    initializeJournalDir();

    let entries = loadAllEntries();

    // Apply filters
    if (args.startDate) {
      const start = new Date(args.startDate);
      entries = entries.filter((e) => new Date(e.timestamp) >= start);
    }

    if (args.endDate) {
      const end = new Date(args.endDate);
      end.setHours(23, 59, 59, 999);
      entries = entries.filter((e) => new Date(e.timestamp) <= end);
    }

    if (args.symbol) {
      const sym = args.symbol.toUpperCase();
      entries = entries.filter((e) => e.symbol === sym);
    }

    // Calculate statistics
    const actionCounts: Record<string, number> = {};
    const symbolCounts: Record<string, number> = {};
    const tagCounts: Record<string, number> = {};
    let totalConfidence = 0;
    const outcomeCounts: Record<string, number> = {
      profit: 0,
      loss: 0,
      breakeven: 0,
      pending: 0,
    };
    let totalPnl = 0;

    for (const entry of entries) {
      actionCounts[entry.action] = (actionCounts[entry.action] || 0) + 1;
      symbolCounts[entry.symbol] = (symbolCounts[entry.symbol] || 0) + 1;
      totalConfidence += entry.confidence;

      for (const tag of entry.tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }

      if (entry.outcome) {
        outcomeCounts[entry.outcome.result] =
          (outcomeCounts[entry.outcome.result] || 0) + 1;
        if (entry.outcome.pnl !== undefined) {
          totalPnl += entry.outcome.pnl;
        }
      } else {
        outcomeCounts.pending++;
      }
    }

    const avgConfidence =
      entries.length > 0 ? totalConfidence / entries.length : 0;

    // Sort tags by frequency
    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    // Sort symbols by frequency
    const topSymbols = Object.entries(symbolCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    const summary = {
      period: {
        start: args.startDate || "all time",
        end: args.endDate || "now",
      },
      totalEntries: entries.length,
      actionBreakdown: actionCounts,
      topSymbols: Object.fromEntries(topSymbols),
      topTags: Object.fromEntries(topTags),
      avgConfidence: Math.round(avgConfidence * 100) / 100,
      outcomes: outcomeCounts,
      totalPnl: Math.round(totalPnl * 100) / 100,
      winRate:
        outcomeCounts.profit + outcomeCounts.loss > 0
          ? Math.round(
              (outcomeCounts.profit /
                (outcomeCounts.profit + outcomeCounts.loss)) *
                100
            )
          : null,
    };

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              success: true,
              summary,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate markdown content for a journal entry
 */
function generateEntryMarkdown(entry: JournalEntry): string {
  const lines: string[] = [];

  lines.push(`# Trade Journal: ${entry.symbol} ${entry.action.toUpperCase()}`);
  lines.push("");
  lines.push(`**Date:** ${entry.timestamp}`);
  lines.push(`**Entry ID:** ${entry.id}`);
  lines.push("");
  lines.push("## Decision");
  lines.push("");
  lines.push(`- **Symbol:** ${entry.symbol}`);
  lines.push(`- **Action:** ${entry.action}`);
  lines.push(`- **Confidence:** ${(entry.confidence * 100).toFixed(0)}%`);
  lines.push(`- **Tags:** ${entry.tags.length > 0 ? entry.tags.join(", ") : "none"}`);
  lines.push("");
  lines.push("## Rationale");
  lines.push("");
  lines.push(entry.rationale);
  lines.push("");

  if (entry.marketContext) {
    lines.push("## Market Context");
    lines.push("");
    lines.push(entry.marketContext);
    lines.push("");
  }

  lines.push("## Outcome");
  lines.push("");
  if (entry.outcome) {
    lines.push(`- **Result:** ${entry.outcome.result}`);
    if (entry.outcome.pnl !== undefined) {
      lines.push(`- **PnL:** $${entry.outcome.pnl.toFixed(2)}`);
    }
    if (entry.outcome.notes) {
      lines.push(`- **Notes:** ${entry.outcome.notes}`);
    }
    if (entry.outcome.resolvedAt) {
      lines.push(`- **Resolved:** ${entry.outcome.resolvedAt}`);
    }
  } else {
    lines.push("*Pending - outcome not yet recorded*");
  }
  lines.push("");

  // Add YAML frontmatter metadata at the end (for parsing)
  lines.push("---");
  lines.push("<!-- Entry Metadata (JSON) -->");
  lines.push("```json");
  lines.push(JSON.stringify(entry, null, 2));
  lines.push("```");

  return lines.join("\n");
}

/**
 * Parse a journal entry from markdown file
 */
function parseEntryFromMarkdown(content: string): JournalEntry | null {
  try {
    // Look for JSON metadata block at the end
    const jsonMatch = content.match(/```json\n([\s\S]*?)\n```\s*$/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]) as JournalEntry;
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

/**
 * Load all journal entries from disk
 */
function loadAllEntries(): JournalEntry[] {
  if (!existsSync(journalDir)) {
    return [];
  }

  const entries: JournalEntry[] = [];
  const files = readdirSync(journalDir).filter((f) => f.endsWith(".md"));

  for (const file of files) {
    try {
      const content = readFileSync(join(journalDir, file), "utf-8");
      const entry = parseEntryFromMarkdown(content);
      if (entry) {
        entries.push(entry);
      }
    } catch {
      // Skip files that can't be parsed
    }
  }

  return entries;
}

// ============================================================================
// MCP Server Factory
// ============================================================================

/**
 * Create the Trade Journal MCP server
 */
export function createJournalMcpServer() {
  return createSdkMcpServer({
    name: "journal",
    version: "0.1.0",
    tools: [journalEntryTool, journalSearchTool, journalSummaryTool],
  });
}

/**
 * All journal tool names
 */
export const JOURNAL_TOOLS = [
  "journal_entry",
  "journal_search",
  "journal_summary",
] as const;
