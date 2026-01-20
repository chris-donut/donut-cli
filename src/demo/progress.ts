/**
 * Tutorial Progress Persistence
 *
 * Saves and loads tutorial progress to allow resume functionality.
 * Progress is stored in ~/.donut-cli/demo-progress.json
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// ============================================================================
// Types
// ============================================================================

export interface ScenarioProgress {
  scenarioId: string;
  currentStep: number;
  completed: boolean;
  completedAt?: string;
  lastAccessedAt: string;
}

export interface TutorialProgress {
  version: number;
  scenarios: Record<string, ScenarioProgress>;
  lastScenarioId?: string;
}

// ============================================================================
// Constants
// ============================================================================

const PROGRESS_VERSION = 1;
const CONFIG_DIR = join(homedir(), ".donut-cli");
const PROGRESS_FILE = join(CONFIG_DIR, "demo-progress.json");

// ============================================================================
// Functions
// ============================================================================

/**
 * Ensure config directory exists
 */
function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Get default empty progress
 */
function getDefaultProgress(): TutorialProgress {
  return {
    version: PROGRESS_VERSION,
    scenarios: {},
  };
}

/**
 * Load tutorial progress from disk
 */
export function loadProgress(): TutorialProgress {
  try {
    if (existsSync(PROGRESS_FILE)) {
      const content = readFileSync(PROGRESS_FILE, "utf-8");
      const data = JSON.parse(content) as TutorialProgress;

      // Version migration if needed
      if (data.version !== PROGRESS_VERSION) {
        return getDefaultProgress();
      }

      return data;
    }
  } catch (error) {
    // If file is corrupted, start fresh
    console.error("Warning: Could not load progress, starting fresh");
  }

  return getDefaultProgress();
}

/**
 * Save tutorial progress to disk
 */
export function saveProgress(progress: TutorialProgress): void {
  try {
    ensureConfigDir();
    writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
  } catch (error) {
    console.error("Warning: Could not save progress");
  }
}

/**
 * Get progress for a specific scenario
 */
export function getScenarioProgress(
  scenarioId: string
): ScenarioProgress | null {
  const progress = loadProgress();
  return progress.scenarios[scenarioId] || null;
}

/**
 * Update progress for a scenario
 */
export function updateScenarioProgress(
  scenarioId: string,
  currentStep: number,
  totalSteps: number
): void {
  const progress = loadProgress();

  const completed = currentStep >= totalSteps - 1;

  progress.scenarios[scenarioId] = {
    scenarioId,
    currentStep,
    completed,
    completedAt: completed ? new Date().toISOString() : undefined,
    lastAccessedAt: new Date().toISOString(),
  };

  progress.lastScenarioId = scenarioId;
  saveProgress(progress);
}

/**
 * Mark scenario as completed
 */
export function markScenarioCompleted(scenarioId: string): void {
  const progress = loadProgress();

  if (progress.scenarios[scenarioId]) {
    progress.scenarios[scenarioId].completed = true;
    progress.scenarios[scenarioId].completedAt = new Date().toISOString();
  } else {
    progress.scenarios[scenarioId] = {
      scenarioId,
      currentStep: 0,
      completed: true,
      completedAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
    };
  }

  saveProgress(progress);
}

/**
 * Check if a scenario is completed
 */
export function isScenarioCompleted(scenarioId: string): boolean {
  const progress = loadProgress();
  return progress.scenarios[scenarioId]?.completed ?? false;
}

/**
 * Get last accessed scenario ID
 */
export function getLastScenarioId(): string | undefined {
  const progress = loadProgress();
  return progress.lastScenarioId;
}

/**
 * Reset all progress
 */
export function resetAllProgress(): void {
  saveProgress(getDefaultProgress());
}

/**
 * Reset progress for a specific scenario
 */
export function resetScenarioProgress(scenarioId: string): void {
  const progress = loadProgress();
  delete progress.scenarios[scenarioId];
  saveProgress(progress);
}

/**
 * Get completion stats
 */
export function getCompletionStats(): {
  totalScenarios: number;
  completedScenarios: number;
  inProgressScenarios: number;
} {
  const progress = loadProgress();
  const scenarios = Object.values(progress.scenarios);

  return {
    totalScenarios: scenarios.length,
    completedScenarios: scenarios.filter((s) => s.completed).length,
    inProgressScenarios: scenarios.filter((s) => !s.completed).length,
  };
}
