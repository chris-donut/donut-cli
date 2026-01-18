/**
 * Strategy Storage MCP Server - Tools for strategy persistence
 * Provides save, load, list, delete, and version management tools
 */

import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { Pool } from "pg";
import {
  StrategyStorage,
  initializeStrategyStorage,
  getStrategyStorage,
} from "../storage/strategy-storage.js";
import { StrategyConfigSchema } from "../core/types.js";

// ============================================================================
// Tool Definitions
// ============================================================================

/**
 * Save a strategy to persistent storage
 */
export const strategySaveTool = tool(
  "strategy_save",
  "Save a trading strategy to persistent storage. Creates new or updates existing strategy by name.",
  {
    config: StrategyConfigSchema.describe("The complete strategy configuration to save"),
  },
  async (args) => {
    const storage = getStrategyStorage();
    if (!storage) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: "Strategy storage not initialized. Set DATABASE_URL.",
            }),
          },
        ],
      };
    }

    try {
      const result = await storage.save(args.config);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              strategy: {
                id: result.id,
                name: result.name,
                version: result.version,
                updatedAt: result.updatedAt,
              },
              message: result.version === 1
                ? `Strategy "${result.name}" created successfully`
                : `Strategy "${result.name}" updated to version ${result.version}`,
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
            }),
          },
        ],
      };
    }
  }
);

/**
 * Load a strategy by name or ID
 */
export const strategyLoadTool = tool(
  "strategy_load",
  "Load a trading strategy from storage by name or ID.",
  {
    nameOrId: z.string().describe("Strategy name or UUID to load"),
  },
  async (args) => {
    const storage = getStrategyStorage();
    if (!storage) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: "Strategy storage not initialized",
              strategy: null,
            }),
          },
        ],
      };
    }

    try {
      const result = await storage.load(args.nameOrId);
      if (!result) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                found: false,
                strategy: null,
                message: `Strategy "${args.nameOrId}" not found`,
              }),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              found: true,
              strategy: result,
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              strategy: null,
            }),
          },
        ],
      };
    }
  }
);

/**
 * List all stored strategies
 */
export const strategyListTool = tool(
  "strategy_list",
  "List all stored trading strategies with optional filtering and sorting.",
  {
    limit: z.number().int().positive().max(100).default(50).describe("Maximum strategies to return"),
    offset: z.number().int().min(0).default(0).describe("Offset for pagination"),
    orderBy: z.enum(["name", "created_at", "updated_at"]).default("updated_at").describe("Sort field"),
    orderDir: z.enum(["asc", "desc"]).default("desc").describe("Sort direction"),
  },
  async (args) => {
    const storage = getStrategyStorage();
    if (!storage) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: "Strategy storage not initialized",
              strategies: [],
              count: 0,
            }),
          },
        ],
      };
    }

    try {
      const strategies = await storage.list({
        limit: args.limit,
        offset: args.offset,
        orderBy: args.orderBy,
        orderDir: args.orderDir,
      });

      const count = await storage.count();

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              strategies: strategies.map((s) => ({
                id: s.id,
                name: s.name,
                version: s.version,
                description: s.config.description,
                createdAt: s.createdAt,
                updatedAt: s.updatedAt,
              })),
              count: strategies.length,
              total: count,
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              strategies: [],
              count: 0,
            }),
          },
        ],
      };
    }
  }
);

/**
 * Delete a strategy by name or ID
 */
export const strategyDeleteTool = tool(
  "strategy_delete",
  "Delete a trading strategy from storage. This is irreversible.",
  {
    nameOrId: z.string().describe("Strategy name or UUID to delete"),
    confirm: z.boolean().describe("Must be true to confirm deletion"),
  },
  async (args) => {
    if (!args.confirm) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: "Deletion not confirmed. Set confirm=true to delete.",
            }),
          },
        ],
      };
    }

    const storage = getStrategyStorage();
    if (!storage) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: "Strategy storage not initialized",
            }),
          },
        ],
      };
    }

    try {
      const deleted = await storage.delete(args.nameOrId);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: deleted,
              message: deleted
                ? `Strategy "${args.nameOrId}" deleted successfully`
                : `Strategy "${args.nameOrId}" not found`,
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
            }),
          },
        ],
      };
    }
  }
);

/**
 * Get version history for a strategy
 */
export const strategyVersionsTool = tool(
  "strategy_versions",
  "Get the version history of a strategy for auditing and rollback purposes.",
  {
    nameOrId: z.string().describe("Strategy name or UUID"),
  },
  async (args) => {
    const storage = getStrategyStorage();
    if (!storage) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: "Strategy storage not initialized",
              versions: [],
            }),
          },
        ],
      };
    }

    try {
      const versions = await storage.getVersionHistory(args.nameOrId);
      const current = await storage.load(args.nameOrId);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              currentVersion: current?.version ?? null,
              versions: versions.map((v) => ({
                version: v.version,
                createdAt: v.createdAt,
                configSummary: {
                  name: v.config.name,
                  description: v.config.description,
                },
              })),
              count: versions.length,
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              versions: [],
            }),
          },
        ],
      };
    }
  }
);

/**
 * Rollback to a previous version
 */
export const strategyRollbackTool = tool(
  "strategy_rollback",
  "Rollback a strategy to a previous version. Creates a new version with the old config.",
  {
    nameOrId: z.string().describe("Strategy name or UUID"),
    targetVersion: z.number().int().positive().describe("Version number to rollback to"),
  },
  async (args) => {
    const storage = getStrategyStorage();
    if (!storage) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: "Strategy storage not initialized",
            }),
          },
        ],
      };
    }

    try {
      const result = await storage.rollback(args.nameOrId, args.targetVersion);
      if (!result) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: false,
                error: `Strategy or version ${args.targetVersion} not found`,
              }),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              strategy: {
                id: result.id,
                name: result.name,
                version: result.version,
                updatedAt: result.updatedAt,
              },
              message: `Rolled back to version ${args.targetVersion}, now at version ${result.version}`,
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
            }),
          },
        ],
      };
    }
  }
);

// ============================================================================
// MCP Server Creation
// ============================================================================

let isInitialized = false;

/**
 * Create the Strategy Storage MCP server
 */
export async function createStrategyStorageMcpServer(pool: Pool) {
  if (!isInitialized) {
    const storage = initializeStrategyStorage(pool);
    await storage.ensureTables();
    isInitialized = true;
  }

  return createSdkMcpServer({
    name: "strategy-storage",
    version: "0.1.0",
    tools: [
      strategySaveTool,
      strategyLoadTool,
      strategyListTool,
      strategyDeleteTool,
      strategyVersionsTool,
      strategyRollbackTool,
    ],
  });
}

/**
 * All strategy storage tool names
 */
export const STRATEGY_STORAGE_TOOLS = [
  "strategy_save",
  "strategy_load",
  "strategy_list",
  "strategy_delete",
  "strategy_versions",
  "strategy_rollback",
] as const;

/**
 * Read-only strategy tools
 */
export const STRATEGY_READ_TOOLS = [
  "strategy_load",
  "strategy_list",
  "strategy_versions",
] as const;

/**
 * Write strategy tools
 */
export const STRATEGY_WRITE_TOOLS = [
  "strategy_save",
  "strategy_delete",
  "strategy_rollback",
] as const;
