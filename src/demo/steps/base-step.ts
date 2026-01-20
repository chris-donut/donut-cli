/**
 * Tutorial Step Interfaces
 *
 * Defines the structure for different types of tutorial steps.
 */

// ============================================================================
// Step Types
// ============================================================================

/**
 * Available step types:
 * - info: Display content and wait for user to continue
 * - action: Execute a demo command and show results
 * - interactive: Simulate CLI interaction with user input
 */
export type StepType = "info" | "action" | "interactive";

// ============================================================================
// Base Step Interface
// ============================================================================

export interface BaseStep {
  /** Unique identifier for the step */
  id: string;

  /** Step type determines rendering and behavior */
  type: StepType;

  /** Title shown in the step header */
  title: string;

  /** Main content to display */
  content: string;
}

// ============================================================================
// Info Step
// ============================================================================

/**
 * Info steps display educational content and wait for Enter to continue.
 */
export interface InfoStep extends BaseStep {
  type: "info";

  /** Optional bullet points to display */
  bulletPoints?: string[];

  /** Optional tip or note to highlight */
  tip?: string;
}

// ============================================================================
// Action Step
// ============================================================================

/**
 * Action steps execute demo functions and display results.
 */
export interface ActionStep extends BaseStep {
  type: "action";

  /** Simulated command being run (for display) */
  command: string;

  /** Function to execute that returns displayable content */
  execute: () => string | Promise<string>;

  /** Optional delay before showing results (ms) */
  delay?: number;
}

// ============================================================================
// Interactive Step
// ============================================================================

/**
 * Interactive steps prompt the user for input and respond accordingly.
 */
export interface InteractiveStep extends BaseStep {
  type: "interactive";

  /** Prompt to show the user */
  prompt: string;

  /** Expected/suggested input (shown as hint) */
  suggestedInput?: string;

  /** Validate user input, returns error message or null if valid */
  validate?: (input: string) => string | null;

  /** Function to execute with user input, returns response */
  execute: (input: string) => string | Promise<string>;
}

// ============================================================================
// Union Type
// ============================================================================

export type TutorialStep = InfoStep | ActionStep | InteractiveStep;

// ============================================================================
// Scenario Definition
// ============================================================================

export interface Scenario {
  /** Unique identifier */
  id: string;

  /** Display name */
  name: string;

  /** Short description */
  description: string;

  /** Estimated duration (e.g., "5 min") */
  duration: string;

  /** Difficulty level */
  difficulty: "beginner" | "intermediate" | "advanced";

  /** Steps in this scenario */
  steps: TutorialStep[];
}

// ============================================================================
// Step Builders (Factory Functions)
// ============================================================================

/**
 * Create an info step
 */
export function createInfoStep(
  id: string,
  title: string,
  content: string,
  options?: { bulletPoints?: string[]; tip?: string }
): InfoStep {
  return {
    id,
    type: "info",
    title,
    content,
    ...options,
  };
}

/**
 * Create an action step
 */
export function createActionStep(
  id: string,
  title: string,
  content: string,
  command: string,
  execute: () => string | Promise<string>,
  delay?: number
): ActionStep {
  return {
    id,
    type: "action",
    title,
    content,
    command,
    execute,
    delay,
  };
}

/**
 * Create an interactive step
 */
export function createInteractiveStep(
  id: string,
  title: string,
  content: string,
  prompt: string,
  execute: (input: string) => string | Promise<string>,
  options?: {
    suggestedInput?: string;
    validate?: (input: string) => string | null;
  }
): InteractiveStep {
  return {
    id,
    type: "interactive",
    title,
    content,
    prompt,
    execute,
    ...options,
  };
}
