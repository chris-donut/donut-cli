/**
 * Scenario Registry
 *
 * Central registry of all available tutorial scenarios.
 */

import { Scenario } from "../steps/base-step.js";
import { gettingStartedScenario } from "./getting-started.js";
import { strategyBasicsScenario } from "./strategy-basics.js";
import { backtestWorkflowScenario } from "./backtest-workflow.js";
import { tradeAnalysisScenario } from "./trade-analysis.js";
import { fullWorkflowScenario } from "./full-workflow.js";

// ============================================================================
// Scenario Registry
// ============================================================================

/**
 * All available scenarios in recommended order
 */
export const SCENARIOS: Scenario[] = [
  gettingStartedScenario,
  strategyBasicsScenario,
  backtestWorkflowScenario,
  tradeAnalysisScenario,
  fullWorkflowScenario,
];

/**
 * Scenario lookup by ID
 */
export const SCENARIO_MAP: Map<string, Scenario> = new Map(
  SCENARIOS.map((s) => [s.id, s])
);

/**
 * Get a scenario by ID
 */
export function getScenario(id: string): Scenario | undefined {
  return SCENARIO_MAP.get(id);
}

/**
 * Get scenario at index (1-based for menu display)
 */
export function getScenarioByIndex(index: number): Scenario | undefined {
  return SCENARIOS[index - 1];
}

/**
 * Get all scenario IDs
 */
export function getScenarioIds(): string[] {
  return SCENARIOS.map((s) => s.id);
}

// Re-export individual scenarios for convenience
export {
  gettingStartedScenario,
  strategyBasicsScenario,
  backtestWorkflowScenario,
  tradeAnalysisScenario,
  fullWorkflowScenario,
};
