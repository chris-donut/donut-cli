/**
 * TUI Display - Message formatting and streaming output
 *
 * Handles displaying agent responses, tool usage, and user messages
 */

import chalk from "chalk";
import {
  agentHeader,
  agentFooter,
  toolIndicator,
  USER_PREFIX,
  MUTED,
  SUCCESS,
  ERROR,
  WARNING,
  SEPARATOR,
  HELP_TEXT,
  SHORT_SEPARATOR,
} from "./theme.js";

// ============================================================================
// Types
// ============================================================================

interface AgentMessage {
  type: "system" | "tool_use" | "tool_result" | "result" | "text";
  subtype?: "init" | "success" | "error";
  session_id?: string;
  result?: string;
  tool_name?: string;
  tool_input?: unknown;
  text?: string;
}

// ============================================================================
// Display Functions
// ============================================================================

/**
 * Display user input
 */
export function displayUserMessage(message: string): void {
  console.log(`\n${USER_PREFIX}${message}`);
}

/**
 * Display agent header (before streaming starts)
 */
export function displayAgentStart(agentType: string): void {
  process.stdout.write(agentHeader(agentType));
}

/**
 * Display agent footer (after streaming completes)
 */
export function displayAgentEnd(): void {
  console.log(agentFooter());
}

/**
 * Stream a text chunk from agent response
 */
export function streamText(text: string): void {
  process.stdout.write(text);
}

/**
 * Display tool usage indicator
 */
export function displayToolUse(toolName: string): void {
  console.log(`\n${toolIndicator(toolName, "pending")}`);
}

/**
 * Display tool result
 */
export function displayToolResult(toolName: string, success: boolean): void {
  // Move cursor up and overwrite the pending indicator
  process.stdout.write("\x1b[1A\x1b[2K"); // Move up one line and clear it
  console.log(toolIndicator(toolName, success ? "success" : "error"));
}

/**
 * Display an error message
 */
export function displayError(message: string): void {
  console.log(`\n${ERROR("Error:")} ${message}`);
}

/**
 * Display a warning message
 */
export function displayWarning(message: string): void {
  console.log(`\n${WARNING("Warning:")} ${message}`);
}

/**
 * Display a success message
 */
export function displaySuccess(message: string): void {
  console.log(`\n${SUCCESS("✓")} ${message}`);
}

/**
 * Display an info message (muted)
 */
export function displayInfo(message: string): void {
  console.log(MUTED(message));
}

/**
 * Display the help text
 */
export function displayHelp(): void {
  console.log(HELP_TEXT);
}

/**
 * Clear the terminal screen
 */
export function clearScreen(): void {
  process.stdout.write("\x1b[2J\x1b[H");
}

/**
 * Display a simple separator
 */
export function displaySeparator(): void {
  console.log(SHORT_SEPARATOR);
}

// ============================================================================
// Session Status Display
// ============================================================================

export interface SessionStatusInfo {
  sessionId: string;
  stage: string;
  createdAt: Date;
  updatedAt: Date;
  strategyName?: string;
  backtestRunId?: string;
  pendingTrades: number;
}

export function displaySessionStatus(status: SessionStatusInfo): void {
  console.log(chalk.bold("\nSession Status"));
  console.log(SHORT_SEPARATOR);
  console.log(`Session ID:     ${chalk.cyan(status.sessionId)}`);
  console.log(`Current Stage:  ${chalk.yellow(status.stage)}`);
  console.log(`Created:        ${status.createdAt.toISOString()}`);
  console.log(`Updated:        ${status.updatedAt.toISOString()}`);

  if (status.strategyName) {
    console.log(`Strategy:       ${chalk.green(status.strategyName)}`);
  }

  if (status.backtestRunId) {
    console.log(`Backtest Run:   ${chalk.magenta(status.backtestRunId)}`);
  }

  if (status.pendingTrades > 0) {
    console.log(`Pending Trades: ${chalk.red(status.pendingTrades.toString())}`);
  }
}

// ============================================================================
// Sessions List Display
// ============================================================================

export interface SessionListItem {
  id: string;
  stage: string;
  createdAt: Date;
}

export function displaySessionsList(sessions: SessionListItem[]): void {
  if (sessions.length === 0) {
    console.log(WARNING("\nNo sessions found."));
    console.log(MUTED("Start a new session with: donut start"));
    return;
  }

  console.log(chalk.bold("\nSessions"));
  console.log(SHORT_SEPARATOR);

  for (const session of sessions) {
    const date = session.createdAt.toLocaleDateString();
    console.log(
      `${chalk.cyan(session.id.slice(0, 8))}... ` +
      `${chalk.yellow(session.stage.padEnd(15))} ` +
      `${MUTED(date)}`
    );
  }
}

// ============================================================================
// Agent Message Processing
// ============================================================================

/**
 * Process and display a streaming agent message
 * Returns the session ID if one was found
 */
export function processAgentMessage(
  message: AgentMessage,
  agentType: string
): { sessionId?: string; done: boolean; success: boolean } {
  let sessionId: string | undefined;
  let done = false;
  let success = true;

  switch (message.type) {
    case "system":
      if (message.subtype === "init" && message.session_id) {
        sessionId = message.session_id;
      }
      break;

    case "text":
      if (message.text) {
        streamText(message.text);
      }
      break;

    case "tool_use":
      if (message.tool_name) {
        displayToolUse(message.tool_name);
      }
      break;

    case "tool_result":
      // Tool results are handled separately
      break;

    case "result":
      done = true;
      if (message.subtype === "error") {
        success = false;
        if (message.result) {
          displayError(message.result);
        }
      }
      break;
  }

  return { sessionId, done, success };
}

// ============================================================================
// Goodbye Message
// ============================================================================

export function displayGoodbye(): void {
  console.log(`\n${chalk.hex("#FF6B35")("🍩")} ${MUTED("Goodbye! Happy trading.")}\n`);
}

// ============================================================================
// SRCL-Inspired Display Enhancements
// ============================================================================

/**
 * Display a bordered panel with title
 */
export function displayPanel(title: string, content: string[], variant: "default" | "primary" | "success" | "warning" | "error" = "default"): void {
  const colorFn = variant === "primary" ? chalk.hex("#FF6B35") :
                  variant === "success" ? chalk.green :
                  variant === "warning" ? chalk.yellow :
                  variant === "error" ? chalk.red :
                  chalk.gray;

  const width = 60;
  const innerWidth = width - 2;

  // Top border with title
  const titleText = ` ${title} `;
  const titleLen = titleText.length;
  const leftPad = Math.floor((innerWidth - titleLen) / 2);
  const rightPad = innerWidth - leftPad - titleLen;

  console.log(colorFn(`╔${"═".repeat(leftPad)}${titleText}${"═".repeat(rightPad)}╗`));

  // Content
  for (const line of content) {
    const paddedLine = line.padEnd(innerWidth);
    console.log(colorFn("║") + paddedLine + colorFn("║"));
  }

  // Bottom border
  console.log(colorFn(`╚${"═".repeat(innerWidth)}╝`));
}

/**
 * Display a progress bar
 */
export function displayProgress(label: string, value: number, total: number = 100, width: number = 30): void {
  const percent = Math.min(100, Math.max(0, (value / total) * 100));
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;

  const bar = chalk.hex("#FF6B35")("█".repeat(filled)) + chalk.gray("░".repeat(empty));
  console.log(`${label} [${bar}] ${percent.toFixed(0)}%`);
}

/**
 * Display a key-value table
 */
export function displayKeyValue(data: Array<{ label: string; value: string }>, labelWidth: number = 20): void {
  for (const { label, value } of data) {
    console.log(`${chalk.gray(label.padEnd(labelWidth))} ${value}`);
  }
}

/**
 * Display a loading spinner frame
 */
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
export function getSpinnerFrame(frameIndex: number): string {
  return chalk.hex("#FF6B35")(SPINNER_FRAMES[frameIndex % SPINNER_FRAMES.length]);
}

/**
 * Display a banner notification
 */
export function displayBanner(message: string, variant: "info" | "success" | "warning" | "error" = "info"): void {
  const icon = variant === "success" ? "✓" :
               variant === "warning" ? "⚠" :
               variant === "error" ? "✗" : "ℹ";

  const colorFn = variant === "success" ? chalk.green :
                  variant === "warning" ? chalk.yellow :
                  variant === "error" ? chalk.red :
                  chalk.cyan;

  const width = 60;
  console.log(colorFn(`┌${"─".repeat(width - 2)}┐`));
  console.log(colorFn(`│ ${icon} ${message.padEnd(width - 5)} │`));
  console.log(colorFn(`└${"─".repeat(width - 2)}┘`));
}
