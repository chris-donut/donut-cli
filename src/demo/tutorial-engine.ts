/**
 * Tutorial Engine - Core navigation and state machine
 *
 * Manages tutorial execution, navigation, and user interaction.
 */

import chalk from "chalk";
import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Scenario, TutorialStep } from "./steps/base-step.js";
import {
  waitForNavigation,
  showMenu,
  clearScreen,
  prompt,
  NavAction,
} from "./input.js";
import {
  updateScenarioProgress,
  getScenarioProgress,
  markScenarioCompleted,
} from "./progress.js";
import {
  tutorialBox,
  progressBar,
  navHints,
  stepTypeIndicator,
  bulletItem,
  codeHighlight,
  completionBanner,
  MUTED,
  SUCCESS,
  WARNING,
  ERROR,
  SECONDARY,
  EMPHASIS,
  ICONS,
} from "./theme.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, "..", "..");

// ============================================================================
// Types
// ============================================================================

export interface TutorialState {
  scenario: Scenario;
  currentStep: number;
  running: boolean;
}

export type EngineAction = "next" | "back" | "menu" | "quit" | "restart";
export type TransitionAction = "continue" | "setup" | "real";

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check if API key is configured
 */
function hasApiKey(): boolean {
  const envPath = join(PROJECT_ROOT, ".env");
  if (!existsSync(envPath)) return false;
  const envContent = readFileSync(envPath, "utf-8");
  return /^ANTHROPIC_API_KEY=sk-ant-.+$/m.test(envContent);
}

/**
 * Get context-specific real command suggestion based on scenario
 */
function getRealCommandForScenario(scenarioId: string): { command: string; description: string } {
  const commandMap: Record<string, { command: string; description: string }> = {
    "getting-started": { command: "donut chat", description: "Start AI chat mode" },
    "strategy-basics": { command: "donut strategy build", description: "Build a real strategy" },
    "backtest-workflow": { command: "donut backtest run", description: "Run a real backtest" },
    "trade-analysis": { command: "donut backtest analyze", description: "Analyze real results" },
    "full-workflow": { command: "donut chat", description: "Start building your portfolio" },
  };
  return commandMap[scenarioId] || { command: "donut chat", description: "Start AI assistant" };
}

// ============================================================================
// Tutorial Engine
// ============================================================================

export class TutorialEngine {
  private state: TutorialState;

  constructor(scenario: Scenario, startStep: number = 0) {
    this.state = {
      scenario,
      currentStep: Math.max(0, Math.min(startStep, scenario.steps.length - 1)),
      running: true,
    };
  }

  /**
   * Run the tutorial until completion or user exits
   */
  async run(): Promise<EngineAction> {
    // Set up Ctrl+C handler
    const handleSigint = () => {
      console.log("\n" + MUTED("Exiting tutorial..."));
      this.state.running = false;
      process.exit(0);
    };
    process.on("SIGINT", handleSigint);

    try {
      while (this.state.running) {
        const action = await this.executeStep();

        switch (action) {
          case "next":
            if (this.state.currentStep < this.state.scenario.steps.length - 1) {
              this.state.currentStep++;
              updateScenarioProgress(
                this.state.scenario.id,
                this.state.currentStep,
                this.state.scenario.steps.length
              );
            } else {
              // Tutorial complete
              markScenarioCompleted(this.state.scenario.id);
              await this.showCompletion();
              return "menu";
            }
            break;

          case "back":
            if (this.state.currentStep > 0) {
              this.state.currentStep--;
              updateScenarioProgress(
                this.state.scenario.id,
                this.state.currentStep,
                this.state.scenario.steps.length
              );
            }
            break;

          case "menu":
            return "menu";

          case "quit":
            return "quit";

          case "restart":
            this.state.currentStep = 0;
            updateScenarioProgress(
              this.state.scenario.id,
              0,
              this.state.scenario.steps.length
            );
            break;
        }
      }
    } finally {
      process.removeListener("SIGINT", handleSigint);
    }

    return "quit";
  }

  /**
   * Execute the current step and return the next action
   */
  private async executeStep(): Promise<EngineAction> {
    const step = this.state.scenario.steps[this.state.currentStep];
    const stepNumber = this.state.currentStep + 1;
    const totalSteps = this.state.scenario.steps.length;

    clearScreen();

    // Render step content
    await this.renderStep(step, stepNumber, totalSteps);

    // Show progress bar
    console.log();
    console.log(
      `Progress: ${progressBar(stepNumber, totalSteps)}`
    );
    console.log();

    // Handle input based on step type
    return await this.handleStepInput(step);
  }

  /**
   * Render a tutorial step
   */
  private async renderStep(
    step: TutorialStep,
    stepNumber: number,
    totalSteps: number
  ): Promise<void> {
    const stepInfo = `Step ${stepNumber}/${totalSteps}`;

    // Show the main tutorial box
    console.log(
      tutorialBox(
        `${this.state.scenario.name}`,
        stepInfo,
        `${stepTypeIndicator(step.type)} ${step.title}\n\n${step.content}`
      )
    );

    // Handle step-specific rendering
    switch (step.type) {
      case "info":
        if (step.bulletPoints && step.bulletPoints.length > 0) {
          console.log();
          for (let i = 0; i < step.bulletPoints.length; i++) {
            console.log(bulletItem(step.bulletPoints[i], i + 1));
          }
        }
        if (step.tip) {
          console.log();
          console.log(`  ${WARNING("💡 Tip:")} ${step.tip}`);
        }
        break;

      case "action":
        console.log();
        console.log(MUTED("  Executing: ") + codeHighlight(step.command));
        console.log();

        // Execute with optional delay
        if (step.delay) {
          await this.sleep(step.delay);
        }

        const result = await step.execute();
        console.log(result);
        break;

      case "interactive":
        console.log();
        console.log(MUTED("  " + step.prompt));
        if (step.suggestedInput) {
          console.log(
            MUTED(`  Suggested: `) + SECONDARY(step.suggestedInput)
          );
        }
        break;
    }
  }

  /**
   * Handle user input after a step is rendered
   */
  private async handleStepInput(step: TutorialStep): Promise<EngineAction> {
    // For interactive steps, get input first
    if (step.type === "interactive") {
      const input = await prompt("  Your input");
      const validationError = step.validate?.(input);

      if (validationError) {
        console.log();
        console.log(ERROR(`  ${validationError}`));
        console.log(MUTED("  Press Enter to try again..."));
        await waitForNavigation();
        return "restart"; // Stay on same step
      }

      const response = await step.execute(input);
      console.log();
      console.log(response);
    }

    // Show navigation hints
    console.log();
    console.log(navHints());

    // Wait for navigation input
    const action = await waitForNavigation();

    switch (action.type) {
      case "next":
        return "next";
      case "back":
        return "back";
      case "menu":
        return "menu";
      case "quit":
        return "quit";
      case "input":
        // Handle special commands
        if (action.value === "r" || action.value === "restart") {
          return "restart";
        }
        // Default to next
        return "next";
    }
  }

  /**
   * Show completion screen with transition prompt
   */
  private async showCompletion(): Promise<void> {
    clearScreen();
    console.log(completionBanner(this.state.scenario.name));

    // Show summary
    console.log(EMPHASIS("  What you learned:"));
    console.log();

    // Extract key learnings from info steps
    const infoSteps = this.state.scenario.steps.filter(
      (s) => s.type === "info"
    );
    for (let i = 0; i < Math.min(3, infoSteps.length); i++) {
      console.log(bulletItem(infoSteps[i].title, i + 1));
    }

    console.log();

    // Show transition prompt
    const transitionAction = await this.showTransitionPrompt();

    if (transitionAction === "setup") {
      // Launch setup wizard
      const { runSetupWizard } = await import("../cli/commands/setup.js");
      await runSetupWizard();
    } else if (transitionAction === "real") {
      // Show the suggested real command
      const suggestion = getRealCommandForScenario(this.state.scenario.id);
      console.log();
      console.log(SUCCESS(`  Ready to try it for real!`));
      console.log(`  Run: ${chalk.cyan(suggestion.command)}`);
      console.log();
      console.log(MUTED("  Press Enter to return to menu..."));
      await waitForNavigation();
    } else {
      // Continue to menu
      console.log(MUTED("  Press Enter to return to menu..."));
      await waitForNavigation();
    }
  }

  /**
   * Show transition prompt after scenario completion
   */
  private async showTransitionPrompt(): Promise<TransitionAction> {
    const apiKeyConfigured = hasApiKey();
    const suggestion = getRealCommandForScenario(this.state.scenario.id);

    console.log(chalk.bold("  What's next?\n"));

    if (!apiKeyConfigured) {
      // No API key - offer setup wizard vs continue demos
      console.log(`  ${chalk.cyan("1)")} Continue exploring demos`);
      console.log(`  ${chalk.cyan("2)")} Set up API key to use real features`);
      console.log();

      const answer = await prompt("  Your choice [1/2]");
      return answer === "2" ? "setup" : "continue";
    } else {
      // Has API key - suggest context-specific real command
      console.log(`  ${chalk.cyan("1)")} Continue exploring demos`);
      console.log(`  ${chalk.cyan("2)")} ${suggestion.description} ${MUTED(`(${suggestion.command})`)}`);
      console.log();

      const answer = await prompt("  Your choice [1/2]");
      return answer === "2" ? "real" : "continue";
    }
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current state (for debugging/testing)
   */
  getState(): TutorialState {
    return { ...this.state };
  }
}

// ============================================================================
// Engine Factory
// ============================================================================

/**
 * Create and optionally resume a tutorial engine for a scenario
 */
export function createEngine(
  scenario: Scenario,
  resume: boolean = true
): TutorialEngine {
  let startStep = 0;

  if (resume) {
    const progress = getScenarioProgress(scenario.id);
    if (progress && !progress.completed) {
      startStep = progress.currentStep;
    }
  }

  return new TutorialEngine(scenario, startStep);
}
