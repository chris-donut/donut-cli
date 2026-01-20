/**
 * Interactive Demo Module
 *
 * Main entry point for the interactive tutorial system.
 */

import chalk from "chalk";
import { SCENARIOS, getScenarioByIndex, getScenario } from "./scenarios/index.js";
import { createEngine, EngineAction } from "./tutorial-engine.js";
import {
  showMenu,
  clearScreen,
  confirm,
  waitForNavigation,
} from "./input.js";
import {
  loadProgress,
  resetAllProgress,
  isScenarioCompleted,
  getLastScenarioId,
} from "./progress.js";
import {
  menuHeader,
  menuOption,
  progressBar,
  MUTED,
  SUCCESS,
  WARNING,
  SECONDARY,
  EMPHASIS,
  ICONS,
} from "./theme.js";

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Start the interactive demo tutorial system
 */
export async function startInteractiveDemo(options?: {
  scenario?: string;
  reset?: boolean;
}): Promise<void> {
  // Handle reset flag
  if (options?.reset) {
    await handleReset();
    return;
  }

  // If specific scenario requested, jump directly to it
  if (options?.scenario) {
    const scenario = getScenario(options.scenario);
    if (!scenario) {
      console.log(WARNING(`Unknown scenario: ${options.scenario}`));
      console.log(MUTED("Available scenarios:"));
      for (const s of SCENARIOS) {
        console.log(`  ${SECONDARY(s.id)} - ${s.name}`);
      }
      return;
    }

    const engine = createEngine(scenario, true);
    await engine.run();
    return;
  }

  // Show main menu loop
  let running = true;
  while (running) {
    const action = await showMainMenu();

    switch (action) {
      case "quit":
        running = false;
        console.log(MUTED("\nGoodbye! Run 'donut demo tour' to return.\n"));
        break;

      case "reset":
        await handleReset();
        break;

      default:
        // Run selected scenario
        const engineAction = await runScenario(action);
        if (engineAction === "quit") {
          running = false;
          console.log(MUTED("\nGoodbye! Run 'donut demo tour' to return.\n"));
        }
    }
  }
}

// ============================================================================
// Menu Display
// ============================================================================

/**
 * Show the main scenario selection menu
 */
async function showMainMenu(): Promise<string> {
  clearScreen();

  // Header
  console.log();
  console.log(menuHeader());
  console.log();

  // Check for resume
  const lastScenarioId = getLastScenarioId();
  const lastScenario = lastScenarioId ? getScenario(lastScenarioId) : undefined;

  if (lastScenario && !isScenarioCompleted(lastScenarioId!)) {
    console.log(
      WARNING(`  ${ICONS.inProgress} Resume: ${lastScenario.name}`)
    );
    console.log();
  }

  // Scenario list
  console.log(EMPHASIS("Select a scenario:\n"));

  for (let i = 0; i < SCENARIOS.length; i++) {
    const scenario = SCENARIOS[i];
    const completed = isScenarioCompleted(scenario.id);
    const difficultyColor =
      scenario.difficulty === "beginner"
        ? SUCCESS
        : scenario.difficulty === "intermediate"
          ? WARNING
          : chalk.red;

    console.log(
      menuOption(
        String(i + 1),
        scenario.name,
        scenario.duration,
        completed
      )
    );
    console.log(
      `      ${MUTED(scenario.description)} ${difficultyColor(`[${scenario.difficulty}]`)}`
    );
    console.log();
  }

  // Actions
  console.log(MUTED("─".repeat(50)));
  console.log();
  console.log(menuOption("r", "Reset progress"));
  console.log(menuOption("q", "Quit"));
  console.log();

  // Completion progress
  const completedCount = SCENARIOS.filter((s) =>
    isScenarioCompleted(s.id)
  ).length;
  console.log(
    `Overall: ${progressBar(completedCount, SCENARIOS.length, 15)} (${completedCount}/${SCENARIOS.length})`
  );
  console.log();

  // Get selection
  const choice = await showMenu(
    [
      ...SCENARIOS.map((s, i) => ({ key: String(i + 1), label: s.name })),
      { key: "r", label: "Reset" },
      { key: "q", label: "Quit" },
    ],
    "Enter choice (1-5, r, q): "
  );

  // Handle selection
  const num = parseInt(choice, 10);
  if (!isNaN(num) && num >= 1 && num <= SCENARIOS.length) {
    return SCENARIOS[num - 1].id;
  }

  switch (choice) {
    case "r":
    case "reset":
      return "reset";
    case "q":
    case "quit":
    case "exit":
      return "quit";
    default:
      return "invalid";
  }
}

// ============================================================================
// Scenario Execution
// ============================================================================

/**
 * Run a specific scenario
 */
async function runScenario(scenarioId: string): Promise<EngineAction> {
  const scenario = getScenario(scenarioId);
  if (!scenario) {
    console.log(WARNING(`Unknown scenario: ${scenarioId}`));
    return "menu";
  }

  const engine = createEngine(scenario, true);
  return await engine.run();
}

// ============================================================================
// Reset Handling
// ============================================================================

/**
 * Handle progress reset with confirmation
 */
async function handleReset(): Promise<void> {
  console.log();
  const confirmed = await confirm(
    WARNING("Reset all tutorial progress?"),
    false
  );

  if (confirmed) {
    resetAllProgress();
    console.log(SUCCESS("\n✓ Progress reset successfully\n"));
  } else {
    console.log(MUTED("\nCancelled.\n"));
  }

  console.log(MUTED("Press Enter to continue..."));
  await waitForNavigation();
}

// ============================================================================
// Exports
// ============================================================================

export { SCENARIOS, getScenario, getScenarioByIndex } from "./scenarios/index.js";
export { loadProgress, resetAllProgress, isScenarioCompleted } from "./progress.js";
export { createEngine } from "./tutorial-engine.js";
export type { Scenario, TutorialStep } from "./steps/base-step.js";
