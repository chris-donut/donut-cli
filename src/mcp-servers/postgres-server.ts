/**
 * PostgreSQL MCP Server - Decision persistence and agent state storage
 * Provides tools for logging decisions and managing agent state
 */

import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { Pool, PoolConfig } from "pg";

// Global pool instance
let pool: Pool | null = null;
let isAvailable = false;

// ============================================================================
// Schemas
// ============================================================================

const DecisionRecordSchema = z.object({
  agentId: z.string(),
  decisionType: z.string(),
  symbol: z.string().optional(),
  action: z.string(),
  rationale: z.string(),
  confidence: z.number().min(0).max(1).optional(),
  context: z.record(z.unknown()).optional(),
});

const StateRecordSchema = z.object({
  agentId: z.string(),
  stateKey: z.string(),
  stateValue: z.unknown(),
});

// ============================================================================
// Database Initialization
// ============================================================================

/**
 * Initialize the PostgreSQL connection pool
 */
export async function initializePostgresPool(
  config?: PoolConfig
): Promise<boolean> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl && !config) {
    console.warn(
      "[postgres-server] No DATABASE_URL or config provided, database unavailable"
    );
    isAvailable = false;
    return false;
  }

  try {
    pool = new Pool(
      config || {
        connectionString: databaseUrl,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      }
    );

    // Test connection
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();

    // Ensure tables exist
    await ensureTables();

    isAvailable = true;
    console.log("[postgres-server] Database connection established");
    return true;
  } catch (error) {
    console.warn(
      "[postgres-server] Failed to connect to database:",
      error instanceof Error ? error.message : error
    );
    isAvailable = false;
    pool = null;
    return false;
  }
}

/**
 * Create tables if they don't exist
 */
async function ensureTables(): Promise<void> {
  if (!pool) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS decision_log (
      id SERIAL PRIMARY KEY,
      agent_id VARCHAR(255) NOT NULL,
      decision_type VARCHAR(100) NOT NULL,
      symbol VARCHAR(50),
      action VARCHAR(100) NOT NULL,
      rationale TEXT NOT NULL,
      confidence DECIMAL(3, 2),
      context JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_decision_log_agent_id ON decision_log(agent_id);
    CREATE INDEX IF NOT EXISTS idx_decision_log_symbol ON decision_log(symbol);
    CREATE INDEX IF NOT EXISTS idx_decision_log_created_at ON decision_log(created_at);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_state (
      id SERIAL PRIMARY KEY,
      agent_id VARCHAR(255) NOT NULL,
      state_key VARCHAR(255) NOT NULL,
      state_value JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(agent_id, state_key)
    );

    CREATE INDEX IF NOT EXISTS idx_agent_state_agent_id ON agent_state(agent_id);
  `);
}

/**
 * Check if database is available
 */
function checkAvailable(): void {
  if (!isAvailable || !pool) {
    throw new Error(
      "Database unavailable. Set DATABASE_URL or call initializePostgresPool."
    );
  }
}

// ============================================================================
// Tool Definitions
// ============================================================================

/**
 * Log a decision to the database
 */
export const decisionLogTool = tool(
  "decision_log",
  "Log an agent decision to the database for future analysis and audit trail.",
  {
    agentId: z.string().describe("Unique identifier for the agent"),
    decisionType: z
      .string()
      .describe("Type of decision (e.g., trade, rebalance, risk_adjustment)"),
    symbol: z.string().optional().describe("Trading symbol if applicable"),
    action: z
      .string()
      .describe("The action taken (e.g., buy, sell, hold, skip)"),
    rationale: z.string().describe("Explanation of why this decision was made"),
    confidence: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe("Confidence score 0-1"),
    context: z
      .record(z.unknown())
      .optional()
      .describe("Additional context as key-value pairs"),
  },
  async (args) => {
    if (!isAvailable || !pool) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: "Database unavailable",
            }),
          },
        ],
      };
    }

    try {
      const result = await pool.query(
        `INSERT INTO decision_log 
         (agent_id, decision_type, symbol, action, rationale, confidence, context)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, created_at`,
        [
          args.agentId,
          args.decisionType,
          args.symbol || null,
          args.action,
          args.rationale,
          args.confidence ?? null,
          args.context ? JSON.stringify(args.context) : null,
        ]
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              id: result.rows[0].id,
              createdAt: result.rows[0].created_at,
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
 * Query past decisions
 */
export const decisionQueryTool = tool(
  "decision_query",
  "Query past decisions from the database with optional filters.",
  {
    agentId: z.string().optional().describe("Filter by agent ID"),
    symbol: z.string().optional().describe("Filter by trading symbol"),
    decisionType: z.string().optional().describe("Filter by decision type"),
    startDate: z
      .string()
      .optional()
      .describe("Filter decisions after this ISO date"),
    endDate: z
      .string()
      .optional()
      .describe("Filter decisions before this ISO date"),
    limit: z.number().int().positive().default(50).describe("Max results"),
    offset: z.number().int().min(0).default(0).describe("Offset for pagination"),
  },
  async (args) => {
    if (!isAvailable || !pool) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: "Database unavailable",
              decisions: [],
            }),
          },
        ],
      };
    }

    try {
      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIndex = 1;

      if (args.agentId) {
        conditions.push(`agent_id = $${paramIndex++}`);
        params.push(args.agentId);
      }
      if (args.symbol) {
        conditions.push(`symbol = $${paramIndex++}`);
        params.push(args.symbol);
      }
      if (args.decisionType) {
        conditions.push(`decision_type = $${paramIndex++}`);
        params.push(args.decisionType);
      }
      if (args.startDate) {
        conditions.push(`created_at >= $${paramIndex++}`);
        params.push(args.startDate);
      }
      if (args.endDate) {
        conditions.push(`created_at <= $${paramIndex++}`);
        params.push(args.endDate);
      }

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      const query = `
        SELECT id, agent_id, decision_type, symbol, action, rationale, 
               confidence, context, created_at
        FROM decision_log
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex}
      `;
      params.push(args.limit, args.offset);

      const result = await pool.query(query, params);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              count: result.rows.length,
              decisions: result.rows.map((row) => ({
                id: row.id,
                agentId: row.agent_id,
                decisionType: row.decision_type,
                symbol: row.symbol,
                action: row.action,
                rationale: row.rationale,
                confidence: row.confidence,
                context: row.context,
                createdAt: row.created_at,
              })),
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
              decisions: [],
            }),
          },
        ],
      };
    }
  }
);

/**
 * Save agent state
 */
export const stateSaveTool = tool(
  "state_save",
  "Save agent state to the database. Uses upsert - will update if key exists.",
  {
    agentId: z.string().describe("Unique identifier for the agent"),
    stateKey: z.string().describe("Key to identify this piece of state"),
    stateValue: z.unknown().describe("The state value to store (any JSON)"),
  },
  async (args) => {
    if (!isAvailable || !pool) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: "Database unavailable",
            }),
          },
        ],
      };
    }

    try {
      const result = await pool.query(
        `INSERT INTO agent_state (agent_id, state_key, state_value, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (agent_id, state_key) 
         DO UPDATE SET state_value = $3, updated_at = NOW()
         RETURNING id, updated_at`,
        [args.agentId, args.stateKey, JSON.stringify(args.stateValue)]
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              id: result.rows[0].id,
              updatedAt: result.rows[0].updated_at,
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
 * Load agent state
 */
export const stateLoadTool = tool(
  "state_load",
  "Load agent state from the database.",
  {
    agentId: z.string().describe("Unique identifier for the agent"),
    stateKey: z
      .string()
      .optional()
      .describe("Specific key to load. If omitted, loads all state for agent."),
  },
  async (args) => {
    if (!isAvailable || !pool) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: "Database unavailable",
              state: null,
            }),
          },
        ],
      };
    }

    try {
      let result;
      if (args.stateKey) {
        result = await pool.query(
          `SELECT state_key, state_value, updated_at
           FROM agent_state
           WHERE agent_id = $1 AND state_key = $2`,
          [args.agentId, args.stateKey]
        );

        if (result.rows.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  success: true,
                  found: false,
                  state: null,
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
                state: result.rows[0].state_value,
                updatedAt: result.rows[0].updated_at,
              }),
            },
          ],
        };
      } else {
        result = await pool.query(
          `SELECT state_key, state_value, updated_at
           FROM agent_state
           WHERE agent_id = $1
           ORDER BY state_key`,
          [args.agentId]
        );

        const stateMap: Record<
          string,
          { value: unknown; updatedAt: string }
        > = {};
        for (const row of result.rows) {
          stateMap[row.state_key] = {
            value: row.state_value,
            updatedAt: row.updated_at,
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                count: result.rows.length,
                state: stateMap,
              }),
            },
          ],
        };
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              state: null,
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

/**
 * Create the PostgreSQL MCP server instance
 */
export async function createPostgresMcpServer(config?: PoolConfig) {
  // Initialize connection pool
  await initializePostgresPool(config);

  // Create and return the MCP server
  return createSdkMcpServer({
    name: "postgres-persistence",
    version: "0.1.0",
    tools: [decisionLogTool, decisionQueryTool, stateSaveTool, stateLoadTool],
  });
}

/**
 * Check if database is currently available
 */
export function isDatabaseAvailable(): boolean {
  return isAvailable;
}

/**
 * Gracefully close the connection pool
 */
export async function closePostgresPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    isAvailable = false;
  }
}

/**
 * All postgres tool names
 */
export const POSTGRES_TOOLS = [
  "decision_log",
  "decision_query",
  "state_save",
  "state_load",
] as const;

/**
 * Read-only postgres tools
 */
export const POSTGRES_READ_TOOLS = ["decision_query", "state_load"] as const;

/**
 * Write postgres tools
 */
export const POSTGRES_WRITE_TOOLS = ["decision_log", "state_save"] as const;
