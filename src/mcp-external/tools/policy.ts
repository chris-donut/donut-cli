/**
 * Policy Engine - Trading Risk Limit Enforcement
 *
 * Provides:
 * - Policy configuration persistence (~/.donut/policies.json)
 * - checkPolicy(plan): Validate trade plans against configured limits
 * - Kill switch for emergency halt
 * - Position sizing limits (maxPositionSize, maxPortfolioRisk)
 */

import * as fs from "fs";
import * as path from "path";
import type { TradePlan } from "./workflow.js";

// ============================================================================
// Types
// ============================================================================

export interface PolicyConfig {
  // Position limits
  maxPositionSize: number; // Max % of portfolio per position (default: 10%)
  maxPortfolioRisk: number; // Max total risk across all positions (default: 25%)
  maxAssetConcentration: number; // Max % of portfolio in single asset (default: 20%)

  // Timing limits
  cooldownMinutes: number; // Minimum minutes between trades (default: 5)

  // Kill switch
  killSwitchEnabled: boolean;
  killSwitchReason?: string;
  killSwitchTimestamp?: string;

  // Metadata
  lastUpdated: string;
  version: number;
}

export interface PolicyResult {
  passed: boolean;
  violations: string[];
  warnings: string[];
  timestamp: string;
}

export interface PolicySetResult {
  success: boolean;
  policy?: PolicyConfig;
  error?: string;
}

export interface KillSwitchResult {
  success: boolean;
  enabled: boolean;
  reason?: string;
  timestamp?: string;
  error?: string;
}

// ============================================================================
// Storage
// ============================================================================

const DONUT_DIR = path.join(process.env.HOME || "~", ".donut");
const POLICIES_FILE = path.join(DONUT_DIR, "policies.json");
const EXECUTION_LOG_FILE = path.join(DONUT_DIR, "executions.log");

function ensureDonutDir(): void {
  if (!fs.existsSync(DONUT_DIR)) {
    fs.mkdirSync(DONUT_DIR, { recursive: true });
  }
}

// ============================================================================
// Default Policy
// ============================================================================

function getDefaultPolicy(): PolicyConfig {
  return {
    maxPositionSize: 10, // 10% of portfolio max per position
    maxPortfolioRisk: 25, // 25% total portfolio risk
    maxAssetConcentration: 20, // 20% max in single asset
    cooldownMinutes: 5, // 5 minute cooldown between trades
    killSwitchEnabled: false,
    lastUpdated: new Date().toISOString(),
    version: 1,
  };
}

// ============================================================================
// Policy CRUD
// ============================================================================

export function loadPolicy(): PolicyConfig {
  ensureDonutDir();

  if (!fs.existsSync(POLICIES_FILE)) {
    // Create default policy on first run
    const defaultPolicy = getDefaultPolicy();
    savePolicy(defaultPolicy);
    return defaultPolicy;
  }

  try {
    const data = fs.readFileSync(POLICIES_FILE, "utf-8");
    return JSON.parse(data) as PolicyConfig;
  } catch {
    // If file is corrupted, reset to defaults
    const defaultPolicy = getDefaultPolicy();
    savePolicy(defaultPolicy);
    return defaultPolicy;
  }
}

export function savePolicy(policy: PolicyConfig): void {
  ensureDonutDir();
  policy.lastUpdated = new Date().toISOString();
  fs.writeFileSync(POLICIES_FILE, JSON.stringify(policy, null, 2));
}

// ============================================================================
// Execution Log (for cooldown tracking)
// ============================================================================

interface ExecutionLogEntry {
  planId: string;
  timestamp: string;
  token: string;
  direction: string;
  riskPercent?: number;
  sizeUsd?: number;
}

function getRecentExecutions(): ExecutionLogEntry[] {
  ensureDonutDir();

  if (!fs.existsSync(EXECUTION_LOG_FILE)) {
    return [];
  }

  try {
    const data = fs.readFileSync(EXECUTION_LOG_FILE, "utf-8");
    return data
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as ExecutionLogEntry);
  } catch {
    return [];
  }
}

export function logExecution(entry: ExecutionLogEntry): void {
  ensureDonutDir();
  fs.appendFileSync(EXECUTION_LOG_FILE, JSON.stringify(entry) + "\n");
}

// ============================================================================
// POL-001: Core Policy Check
// ============================================================================

/**
 * Check a trade plan against configured policies
 */
export function checkPolicy(plan: TradePlan): PolicyResult {
  const policy = loadPolicy();
  const violations: string[] = [];
  const warnings: string[] = [];

  // Kill switch check (hard stop)
  if (policy.killSwitchEnabled) {
    violations.push(
      `Kill switch active: ${policy.killSwitchReason || "No reason provided"}`
    );
  }

  // Position size check
  if (plan.riskPercent > policy.maxPositionSize) {
    violations.push(
      `Position risk ${plan.riskPercent}% exceeds maxPositionSize limit of ${policy.maxPositionSize}%`
    );
  }

  // Cooldown check
  const recentExecutions = getRecentExecutions();
  const now = Date.now();
  const cooldownMs = policy.cooldownMinutes * 60 * 1000;

  const lastExecution = recentExecutions
    .filter((e) => e.token === plan.token)
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )[0];

  if (lastExecution) {
    const timeSinceLastTrade =
      now - new Date(lastExecution.timestamp).getTime();
    if (timeSinceLastTrade < cooldownMs) {
      const remainingMinutes = Math.ceil(
        (cooldownMs - timeSinceLastTrade) / 60000
      );
      violations.push(
        `Cooldown active for ${plan.token}: ${remainingMinutes} minute(s) remaining`
      );
    }
  }

  // POL-004: Portfolio Risk Check
  // Calculate total risk from recent (last 24h) long positions
  const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
  const recentLongPositions = recentExecutions.filter(
    (e) =>
      e.direction === "long" &&
      new Date(e.timestamp).getTime() > twentyFourHoursAgo &&
      e.riskPercent !== undefined
  );
  const currentPortfolioRisk = recentLongPositions.reduce(
    (sum, e) => sum + (e.riskPercent || 0),
    0
  );
  const projectedPortfolioRisk = currentPortfolioRisk + plan.riskPercent;

  if (projectedPortfolioRisk > policy.maxPortfolioRisk) {
    violations.push(
      `Total portfolio risk would be ${projectedPortfolioRisk.toFixed(1)}% (current: ${currentPortfolioRisk.toFixed(1)}% + proposed: ${plan.riskPercent}%), exceeds limit of ${policy.maxPortfolioRisk}%`
    );
  }

  // POL-004: Asset Concentration Check
  // Calculate concentration in same token
  const sameTokenPositions = recentExecutions.filter(
    (e) =>
      e.token === plan.token &&
      e.direction === "long" &&
      new Date(e.timestamp).getTime() > twentyFourHoursAgo &&
      e.riskPercent !== undefined
  );
  const currentAssetRisk = sameTokenPositions.reduce(
    (sum, e) => sum + (e.riskPercent || 0),
    0
  );
  const projectedAssetRisk = currentAssetRisk + plan.riskPercent;

  if (projectedAssetRisk > policy.maxAssetConcentration) {
    violations.push(
      `Asset concentration for ${plan.token} would be ${projectedAssetRisk.toFixed(1)}% (current: ${currentAssetRisk.toFixed(1)}% + proposed: ${plan.riskPercent}%), exceeds limit of ${policy.maxAssetConcentration}%`
    );
  }

  // Soft warnings
  if (plan.riskPercent > policy.maxPositionSize * 0.8) {
    warnings.push(
      `Position risk ${plan.riskPercent}% is near limit of ${policy.maxPositionSize}%`
    );
  }

  // Portfolio risk warning (when approaching limit)
  if (projectedPortfolioRisk > policy.maxPortfolioRisk * 0.8) {
    warnings.push(
      `Portfolio risk ${projectedPortfolioRisk.toFixed(1)}% is near limit of ${policy.maxPortfolioRisk}%`
    );
  }

  // Asset concentration warning
  if (projectedAssetRisk > policy.maxAssetConcentration * 0.8) {
    warnings.push(
      `${plan.token} concentration ${projectedAssetRisk.toFixed(1)}% is near limit of ${policy.maxAssetConcentration}%`
    );
  }

  if (plan.confidence === "low") {
    warnings.push("Trade plan has low confidence - review thesis carefully");
  }

  if (plan.warnings && plan.warnings.length > 0) {
    warnings.push(...plan.warnings);
  }

  return {
    passed: violations.length === 0,
    violations,
    warnings,
    timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// POL-002: Policy Configuration
// ============================================================================

/**
 * Update policy configuration
 */
export function handlePolicySet(params: {
  maxPositionSize?: number;
  maxPortfolioRisk?: number;
  maxAssetConcentration?: number;
  cooldownMinutes?: number;
}): PolicySetResult {
  try {
    const policy = loadPolicy();

    // Validate and update maxPositionSize
    if (params.maxPositionSize !== undefined) {
      if (params.maxPositionSize <= 0 || params.maxPositionSize > 100) {
        return {
          success: false,
          error: "maxPositionSize must be between 0 and 100",
        };
      }
      policy.maxPositionSize = params.maxPositionSize;
    }

    // Validate and update maxPortfolioRisk
    if (params.maxPortfolioRisk !== undefined) {
      if (params.maxPortfolioRisk <= 0 || params.maxPortfolioRisk > 100) {
        return {
          success: false,
          error: "maxPortfolioRisk must be between 0 and 100",
        };
      }
      policy.maxPortfolioRisk = params.maxPortfolioRisk;
    }

    // Validate and update maxAssetConcentration
    if (params.maxAssetConcentration !== undefined) {
      if (
        params.maxAssetConcentration <= 0 ||
        params.maxAssetConcentration > 100
      ) {
        return {
          success: false,
          error: "maxAssetConcentration must be between 0 and 100",
        };
      }
      policy.maxAssetConcentration = params.maxAssetConcentration;
    }

    // Validate and update cooldownMinutes
    if (params.cooldownMinutes !== undefined) {
      if (params.cooldownMinutes < 0 || params.cooldownMinutes > 1440) {
        return {
          success: false,
          error: "cooldownMinutes must be between 0 and 1440 (24 hours)",
        };
      }
      policy.cooldownMinutes = params.cooldownMinutes;
    }

    policy.version += 1;
    savePolicy(policy);

    return {
      success: true,
      policy,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to update policy: ${message}`,
    };
  }
}

/**
 * Get current policy configuration
 */
export function handlePolicyGet(): PolicySetResult {
  try {
    const policy = loadPolicy();
    return {
      success: true,
      policy,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to load policy: ${message}`,
    };
  }
}

// ============================================================================
// POL-003: Kill Switch
// ============================================================================

/**
 * Enable or disable the kill switch
 */
export function handleKillSwitch(params: {
  enabled: boolean;
  reason?: string;
}): KillSwitchResult {
  try {
    const policy = loadPolicy();

    policy.killSwitchEnabled = params.enabled;

    if (params.enabled) {
      policy.killSwitchReason = params.reason || "Manual activation";
      policy.killSwitchTimestamp = new Date().toISOString();
    } else {
      policy.killSwitchReason = undefined;
      policy.killSwitchTimestamp = undefined;
    }

    savePolicy(policy);

    return {
      success: true,
      enabled: policy.killSwitchEnabled,
      reason: policy.killSwitchReason,
      timestamp: policy.killSwitchTimestamp,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      enabled: false,
      error: `Failed to toggle kill switch: ${message}`,
    };
  }
}
