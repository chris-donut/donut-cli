/**
 * TUI Theme - Colors, icons, and UI constants
 *
 * Consistent visual styling for the interactive terminal UI
 * Enhanced with SRCL-inspired terminal aesthetics
 */

import chalk from "chalk";

// ============================================================================
// Colors
// ============================================================================

/** Primary brand color (orange) */
export const PRIMARY = chalk.hex("#FF6B35");

/** Secondary color for highlights */
export const SECONDARY = chalk.cyan;

/** Success color */
export const SUCCESS = chalk.green;

/** Error color */
export const ERROR = chalk.red;

/** Warning color */
export const WARNING = chalk.yellow;

/** Muted text */
export const MUTED = chalk.gray;

/** Bold white for emphasis */
export const EMPHASIS = chalk.bold.white;

/** Info color */
export const INFO = chalk.cyan;

// ============================================================================
// Icons
// ============================================================================

export const ICONS = {
  donut: "🍩",
  robot: "🤖",
  strategy: "📊",
  backtest: "📈",
  paper: "📝",
  success: "✓",
  error: "✗",
  warning: "⚠",
  thinking: "💭",
  tool: "🔧",
  loading: "⏳",
  done: "✅",
  // Navigation
  pointer: "▸",
  pointerEmpty: "▹",
  chevronRight: "❯",
  // Selection
  checkbox: "☐",
  checkboxChecked: "☑",
  radio: "○",
  radioSelected: "◉",
  // Trading
  up: "▲",
  down: "▼",
  buy: "↑",
  sell: "↓",
} as const;

// ============================================================================
// UI Components
// ============================================================================

/** Box drawing characters - single line */
export const BOX = {
  topLeft: "╭",
  topRight: "╮",
  bottomLeft: "╰",
  bottomRight: "╯",
  horizontal: "─",
  vertical: "│",
  divider: "━",
  teeLeft: "├",
  teeRight: "┤",
  teeUp: "┴",
  teeDown: "┬",
  cross: "┼",
} as const;

/** Box drawing characters - double line (MS-DOS style) */
export const BOX_DOUBLE = {
  topLeft: "╔",
  topRight: "╗",
  bottomLeft: "╚",
  bottomRight: "╝",
  horizontal: "═",
  vertical: "║",
  teeLeft: "╠",
  teeRight: "╣",
  teeUp: "╩",
  teeDown: "╦",
  cross: "╬",
} as const;

/** Block characters for progress bars */
export const BLOCKS = {
  full: "█",
  threeQuarter: "▓",
  half: "▒",
  quarter: "░",
} as const;

/** Welcome banner for interactive mode - SRCL-inspired double-line border */
export const INTERACTIVE_BANNER = `
${PRIMARY(BOX_DOUBLE.topLeft + BOX_DOUBLE.horizontal.repeat(63) + BOX_DOUBLE.topRight)}
${PRIMARY(BOX_DOUBLE.vertical)}                                                               ${PRIMARY(BOX_DOUBLE.vertical)}
${PRIMARY(BOX_DOUBLE.vertical)}   ${ICONS.donut} ${EMPHASIS("DONUT CLI")} ${MUTED("━━━")} ${chalk.italic("AI-Powered Trading Terminal")}                ${PRIMARY(BOX_DOUBLE.vertical)}
${PRIMARY(BOX_DOUBLE.vertical)}                                                               ${PRIMARY(BOX_DOUBLE.vertical)}
${PRIMARY(BOX_DOUBLE.teeLeft + BOX_DOUBLE.horizontal.repeat(63) + BOX_DOUBLE.teeRight)}
${PRIMARY(BOX_DOUBLE.vertical)}   ${MUTED("Commands")}                                                      ${PRIMARY(BOX_DOUBLE.vertical)}
${PRIMARY(BOX_DOUBLE.vertical)}   ${SECONDARY("/strategy")} ${MUTED("Build strategies")}    ${SECONDARY("/backtest")} ${MUTED("Test on history")}      ${PRIMARY(BOX_DOUBLE.vertical)}
${PRIMARY(BOX_DOUBLE.vertical)}   ${SECONDARY("/paper")} ${MUTED("Paper trading")}       ${SECONDARY("/status")} ${MUTED("Session status")}         ${PRIMARY(BOX_DOUBLE.vertical)}
${PRIMARY(BOX_DOUBLE.vertical)}   ${SECONDARY("/help")} ${MUTED("Show help")}           ${SECONDARY("/quit")} ${MUTED("Exit")}                     ${PRIMARY(BOX_DOUBLE.vertical)}
${PRIMARY(BOX_DOUBLE.vertical)}                                                               ${PRIMARY(BOX_DOUBLE.vertical)}
${PRIMARY(BOX_DOUBLE.bottomLeft + BOX_DOUBLE.horizontal.repeat(63) + BOX_DOUBLE.bottomRight)}
`;

/** Separator line */
export const SEPARATOR = MUTED(BOX.divider.repeat(65));

/** Short separator */
export const SHORT_SEPARATOR = MUTED(BOX.horizontal.repeat(50));

// ============================================================================
// Agent Display Config
// ============================================================================

export interface AgentDisplay {
  name: string;
  icon: string;
  color: typeof chalk;
}

export const AGENT_DISPLAYS: Record<string, AgentDisplay> = {
  STRATEGY_BUILDER: {
    name: "Strategy Builder",
    icon: ICONS.strategy,
    color: chalk.cyan,
  },
  BACKTEST_ANALYST: {
    name: "Backtest Analyst",
    icon: ICONS.backtest,
    color: chalk.magenta,
  },
  CHART_ANALYST: {
    name: "Chart Analyst",
    icon: "📉",
    color: chalk.yellow,
  },
  EXECUTION_ASSISTANT: {
    name: "Execution Assistant",
    icon: "⚡",
    color: chalk.green,
  },
  DEFAULT: {
    name: "Assistant",
    icon: ICONS.robot,
    color: chalk.white,
  },
};

// ============================================================================
// Help Text
// ============================================================================

export const HELP_TEXT = `
${EMPHASIS("Available Commands")}
${SHORT_SEPARATOR}

${SECONDARY("/strategy")} ${MUTED("[prompt]")}    Build or modify a trading strategy
${SECONDARY("/backtest")} ${MUTED("[runId]")}     Run a new backtest or analyze results
${SECONDARY("/analyze")} ${MUTED("<runId>")}      Analyze backtest results in detail
${SECONDARY("/paper")} ${MUTED("[action]")}       Paper trading commands
${SECONDARY("/status")}               Show current session status
${SECONDARY("/sessions")}             List all sessions
${SECONDARY("/resume")} ${MUTED("<id>")}          Resume a previous session
${SECONDARY("/clear")}                Clear the screen
${SECONDARY("/help")}                 Show this help message
${SECONDARY("/quit")} or ${SECONDARY("/exit")}       Exit interactive mode

${MUTED("Or just type a message to chat with the current agent.")}
`;

// ============================================================================
// Prompt Styling
// ============================================================================

export const PROMPT = PRIMARY("donut> ");

export const USER_PREFIX = chalk.bold.white("You: ");

// ============================================================================
// Status Indicators
// ============================================================================

export function toolIndicator(toolName: string, status: "pending" | "success" | "error"): string {
  const statusIcon = status === "pending" ? ICONS.loading : status === "success" ? SUCCESS(ICONS.success) : ERROR(ICONS.error);
  return MUTED(`[Tool: ${toolName}] `) + statusIcon;
}

export function agentHeader(agentType: string): string {
  const display = AGENT_DISPLAYS[agentType] || AGENT_DISPLAYS.DEFAULT;
  return `\n${display.icon} ${display.color(display.name)}\n${SEPARATOR}\n`;
}

export function agentFooter(): string {
  return `\n${SEPARATOR}\n`;
}
