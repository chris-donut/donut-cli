/**
 * Tutorial Input Handling
 *
 * Provides consistent input methods for tutorial navigation.
 */

import { createInterface, Interface } from "readline";

/**
 * Wait for user to press Enter
 */
export async function waitForEnter(prompt: string = ""): Promise<void> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}

/**
 * Show a menu and get user selection
 */
export async function showMenu(
  options: { key: string; label: string; hint?: string }[],
  prompt: string = "Enter choice: "
): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      // Check if it matches any key
      const matched = options.find(
        (opt) => opt.key.toLowerCase() === trimmed
      );
      resolve(matched ? matched.key : trimmed);
    });
  });
}

/**
 * Ask yes/no confirmation
 */
export async function confirm(
  question: string,
  defaultYes: boolean = true
): Promise<boolean> {
  const hint = defaultYes ? "[Y/n]" : "[y/N]";
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${question} ${hint} `, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      if (trimmed === "") {
        resolve(defaultYes);
      } else {
        resolve(trimmed.startsWith("y"));
      }
    });
  });
}

/**
 * Get free-form text input
 */
export async function prompt(
  question: string,
  defaultValue?: string
): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const defaultText = defaultValue ? ` (${defaultValue})` : "";

  return new Promise((resolve) => {
    rl.question(`${question}${defaultText}: `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue || "");
    });
  });
}

/**
 * Navigation key handler result
 */
export type NavAction =
  | { type: "next" }
  | { type: "back" }
  | { type: "menu" }
  | { type: "quit" }
  | { type: "input"; value: string };

/**
 * Wait for navigation input during tutorial
 * Supports: Enter (next), b (back), m (menu), q (quit)
 */
export async function waitForNavigation(): Promise<NavAction> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question("", (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();

      switch (trimmed) {
        case "":
          resolve({ type: "next" });
          break;
        case "b":
        case "back":
          resolve({ type: "back" });
          break;
        case "m":
        case "menu":
          resolve({ type: "menu" });
          break;
        case "q":
        case "quit":
        case "exit":
          resolve({ type: "quit" });
          break;
        default:
          resolve({ type: "input", value: trimmed });
      }
    });
  });
}

/**
 * Clear the terminal screen
 */
export function clearScreen(): void {
  process.stdout.write("\x1B[2J\x1B[0f");
}
