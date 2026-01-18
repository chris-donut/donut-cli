/**
 * Strategy Storage Service - PostgreSQL-based strategy persistence
 * Provides save, load, list, delete, and version management for trading strategies
 */

import { Pool } from "pg";
import { v4 as uuidv4 } from "uuid";
import { StrategyConfig, StrategyConfigSchema } from "../core/types.js";
import { z } from "zod";

// ============================================================================
// Types
// ============================================================================

export interface StoredStrategy {
  id: string;
  name: string;
  version: number;
  config: StrategyConfig;
  createdAt: string;
  updatedAt: string;
}

export interface StrategyVersion {
  id: string;
  strategyId: string;
  version: number;
  config: StrategyConfig;
  createdAt: string;
}

export interface StrategyListOptions {
  limit?: number;
  offset?: number;
  orderBy?: "name" | "created_at" | "updated_at";
  orderDir?: "asc" | "desc";
}

// ============================================================================
// Schema Validation
// ============================================================================

export const StoredStrategySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  version: z.number().int().positive(),
  config: StrategyConfigSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ============================================================================
// Strategy Storage Class
// ============================================================================

export class StrategyStorage {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Initialize strategy tables if they don't exist
   */
  async ensureTables(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS strategies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) UNIQUE NOT NULL,
        version INT DEFAULT 1,
        config JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_strategies_name ON strategies(name);
      CREATE INDEX IF NOT EXISTS idx_strategies_updated ON strategies(updated_at);
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS strategy_versions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
        version INT NOT NULL,
        config JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(strategy_id, version)
      );

      CREATE INDEX IF NOT EXISTS idx_strategy_versions_strategy_id ON strategy_versions(strategy_id);
    `);
  }

  /**
   * Save a strategy (creates or updates)
   */
  async save(config: StrategyConfig): Promise<StoredStrategy> {
    // Validate config
    const validConfig = StrategyConfigSchema.parse(config);

    // Check if strategy exists by name
    const existing = await this.pool.query(
      "SELECT id, version FROM strategies WHERE name = $1",
      [validConfig.name]
    );

    if (existing.rows.length > 0) {
      // Update existing strategy
      const { id, version } = existing.rows[0];
      const newVersion = version + 1;

      // Store current version in history
      await this.pool.query(
        `INSERT INTO strategy_versions (strategy_id, version, config)
         SELECT id, version, config FROM strategies WHERE id = $1`,
        [id]
      );

      // Update strategy
      const result = await this.pool.query(
        `UPDATE strategies
         SET config = $1, version = $2, updated_at = NOW()
         WHERE id = $3
         RETURNING id, name, version, config, created_at, updated_at`,
        [JSON.stringify(validConfig), newVersion, id]
      );

      return this.rowToStrategy(result.rows[0]);
    } else {
      // Create new strategy
      const result = await this.pool.query(
        `INSERT INTO strategies (name, config)
         VALUES ($1, $2)
         RETURNING id, name, version, config, created_at, updated_at`,
        [validConfig.name, JSON.stringify(validConfig)]
      );

      return this.rowToStrategy(result.rows[0]);
    }
  }

  /**
   * Load a strategy by name or ID
   */
  async load(nameOrId: string): Promise<StoredStrategy | null> {
    // Try by name first, then by ID
    let result = await this.pool.query(
      `SELECT id, name, version, config, created_at, updated_at
       FROM strategies WHERE name = $1`,
      [nameOrId]
    );

    if (result.rows.length === 0) {
      // Try by UUID
      try {
        result = await this.pool.query(
          `SELECT id, name, version, config, created_at, updated_at
           FROM strategies WHERE id = $1`,
          [nameOrId]
        );
      } catch {
        // Invalid UUID format, return null
        return null;
      }
    }

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToStrategy(result.rows[0]);
  }

  /**
   * List all strategies
   */
  async list(options: StrategyListOptions = {}): Promise<StoredStrategy[]> {
    const {
      limit = 50,
      offset = 0,
      orderBy = "updated_at",
      orderDir = "desc",
    } = options;

    // Validate order column to prevent SQL injection
    const validColumns = ["name", "created_at", "updated_at"];
    const orderColumn = validColumns.includes(orderBy) ? orderBy : "updated_at";
    const direction = orderDir === "asc" ? "ASC" : "DESC";

    const result = await this.pool.query(
      `SELECT id, name, version, config, created_at, updated_at
       FROM strategies
       ORDER BY ${orderColumn} ${direction}
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return result.rows.map((row) => this.rowToStrategy(row));
  }

  /**
   * Delete a strategy by name or ID
   */
  async delete(nameOrId: string): Promise<boolean> {
    // Try by name first
    let result = await this.pool.query(
      "DELETE FROM strategies WHERE name = $1 RETURNING id",
      [nameOrId]
    );

    if (result.rows.length === 0) {
      // Try by UUID
      try {
        result = await this.pool.query(
          "DELETE FROM strategies WHERE id = $1 RETURNING id",
          [nameOrId]
        );
      } catch {
        return false;
      }
    }

    return result.rows.length > 0;
  }

  /**
   * Get version history for a strategy
   */
  async getVersionHistory(nameOrId: string): Promise<StrategyVersion[]> {
    // First get the strategy ID
    const strategy = await this.load(nameOrId);
    if (!strategy) {
      return [];
    }

    const result = await this.pool.query(
      `SELECT id, strategy_id, version, config, created_at
       FROM strategy_versions
       WHERE strategy_id = $1
       ORDER BY version DESC`,
      [strategy.id]
    );

    return result.rows.map((row) => ({
      id: row.id,
      strategyId: row.strategy_id,
      version: row.version,
      config: row.config,
      createdAt: row.created_at.toISOString(),
    }));
  }

  /**
   * Rollback to a previous version
   */
  async rollback(nameOrId: string, targetVersion: number): Promise<StoredStrategy | null> {
    const strategy = await this.load(nameOrId);
    if (!strategy) {
      return null;
    }

    // Get the target version config
    const versionResult = await this.pool.query(
      `SELECT config FROM strategy_versions
       WHERE strategy_id = $1 AND version = $2`,
      [strategy.id, targetVersion]
    );

    if (versionResult.rows.length === 0) {
      return null;
    }

    const targetConfig = versionResult.rows[0].config;

    // Store current version in history
    await this.pool.query(
      `INSERT INTO strategy_versions (strategy_id, version, config)
       SELECT id, version, config FROM strategies WHERE id = $1`,
      [strategy.id]
    );

    // Update to new version (increment)
    const newVersion = strategy.version + 1;
    const result = await this.pool.query(
      `UPDATE strategies
       SET config = $1, version = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING id, name, version, config, created_at, updated_at`,
      [JSON.stringify(targetConfig), newVersion, strategy.id]
    );

    return this.rowToStrategy(result.rows[0]);
  }

  /**
   * Check if a strategy exists
   */
  async exists(name: string): Promise<boolean> {
    const result = await this.pool.query(
      "SELECT 1 FROM strategies WHERE name = $1",
      [name]
    );
    return result.rows.length > 0;
  }

  /**
   * Get count of strategies
   */
  async count(): Promise<number> {
    const result = await this.pool.query("SELECT COUNT(*) FROM strategies");
    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Convert database row to StoredStrategy
   */
  private rowToStrategy(row: any): StoredStrategy {
    return {
      id: row.id,
      name: row.name,
      version: row.version,
      config: row.config,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let storageInstance: StrategyStorage | null = null;

/**
 * Initialize the strategy storage with a database pool
 */
export function initializeStrategyStorage(pool: Pool): StrategyStorage {
  storageInstance = new StrategyStorage(pool);
  return storageInstance;
}

/**
 * Get the strategy storage instance
 */
export function getStrategyStorage(): StrategyStorage | null {
  return storageInstance;
}
