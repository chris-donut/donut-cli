/**
 * Tutorial Theme - Visual styling for the interactive demo system
 *
 * Extends the main CLI theme with tutorial-specific components.
 */

import chalk from "chalk";

// ============================================================================
// Colors (inherited from main theme)
// ============================================================================

export const PRIMARY = chalk.hex("#FF6B35");
export const SECONDARY = chalk.cyan;
export const SUCCESS = chalk.green;
export const ERROR = chalk.red;
export const WARNING = chalk.yellow;
export const MUTED = chalk.gray;
export const EMPHASIS = chalk.bold.white;
export const INFO = chalk.blue;

// ============================================================================
// Box Drawing Characters
// ============================================================================

export const BOX = {
  topLeft: "╭",
  topRight: "╮",
  bottomLeft: "╰",
  bottomRight: "╯",
  horizontal: "─",
  vertical: "│",
  divider: "━",
  // Double line box for main menu
  dTopLeft: "╔",
  dTopRight: "╗",
  dBottomLeft: "╚",
  dBottomRight: "╝",
  dHorizontal: "═",
  dVertical: "║",
} as const;

// ============================================================================
// Tutorial Icons
// ============================================================================

export const ICONS = {
  tutorial: "📚",
  step: "▸",
  completed: "✓",
  inProgress: "◉",
  pending: "○",
  back: "←",
  next: "→",
  menu: "☰",
  quit: "×",
  info: "ℹ",
  action: "⚡",
  interactive: "💬",
  strategy: "📊",
  backtest: "📈",
  trade: "💹",
  rocket: "🚀",
  check: "✅",
  clock: "⏱",
  star: "⭐",
  trophy: "🏆",
  robot: "🤖",
} as const;

// ============================================================================
// Tutorial Box Components
// ============================================================================

/**
 * Create a tutorial content box
 */
export function tutorialBox(
  title: string,
  stepInfo: string,
  content: string
): string {
  const width = 65;
  const innerWidth = width - 2;
  const titleLine = ` ${ICONS.tutorial} ${title} (${stepInfo}) `;
  const titlePadding = width - titleLine.length - 2;

  const lines: string[] = [];

  // Top border with title
  lines.push(
    PRIMARY(BOX.topLeft) +
      PRIMARY(BOX.horizontal.repeat(2)) +
      EMPHASIS(titleLine) +
      PRIMARY(BOX.horizontal.repeat(Math.max(0, titlePadding))) +
      PRIMARY(BOX.topRight)
  );

  // Empty line
  lines.push(PRIMARY(BOX.vertical) + " ".repeat(innerWidth) + PRIMARY(BOX.vertical));

  // Content lines
  const contentLines = wrapText(content, innerWidth - 4);
  for (const line of contentLines) {
    const padding = innerWidth - line.length - 2;
    lines.push(
      PRIMARY(BOX.vertical) +
        "  " +
        line +
        " ".repeat(Math.max(0, padding)) +
        PRIMARY(BOX.vertical)
    );
  }

  // Empty line
  lines.push(PRIMARY(BOX.vertical) + " ".repeat(innerWidth) + PRIMARY(BOX.vertical));

  // Bottom border
  lines.push(
    PRIMARY(BOX.bottomLeft) +
      PRIMARY(BOX.horizontal.repeat(innerWidth)) +
      PRIMARY(BOX.bottomRight)
  );

  return lines.join("\n");
}

/**
 * Create the main menu header
 */
export function menuHeader(): string {
  const width = 50;
  const title = "Donut CLI Interactive Tutorial";
  const titlePadding = Math.floor((width - title.length - 2) / 2);

  return [
    SECONDARY(
      BOX.dTopLeft + BOX.dHorizontal.repeat(width) + BOX.dTopRight
    ),
    SECONDARY(BOX.dVertical) +
      " ".repeat(titlePadding) +
      EMPHASIS(title) +
      " ".repeat(width - titlePadding - title.length) +
      SECONDARY(BOX.dVertical),
    SECONDARY(
      BOX.dBottomLeft + BOX.dHorizontal.repeat(width) + BOX.dBottomRight
    ),
  ].join("\n");
}

/**
 * Create a progress bar
 */
export function progressBar(
  current: number,
  total: number,
  width: number = 20
): string {
  const percent = Math.floor((current / total) * 100);
  const filled = Math.floor((current / total) * width);
  const empty = width - filled;

  const bar = SUCCESS("█".repeat(filled)) + MUTED("░".repeat(empty));
  return `${bar} ${percent}%`;
}

/**
 * Navigation hints for tutorial steps
 */
export function navHints(): string {
  return (
    MUTED("[") +
    SECONDARY("Enter") +
    MUTED("] Continue  [") +
    SECONDARY("b") +
    MUTED("] Back  [") +
    SECONDARY("m") +
    MUTED("] Menu  [") +
    SECONDARY("q") +
    MUTED("] Quit")
  );
}

/**
 * Menu option formatter
 */
export function menuOption(
  key: string,
  label: string,
  hint?: string,
  completed?: boolean
): string {
  const checkmark = completed ? " " + SUCCESS(ICONS.completed) : "";
  const hintStr = hint ? MUTED(` (${hint})`) : "";
  return `  ${SECONDARY(`[${key}]`)} ${label}${hintStr}${checkmark}`;
}

/**
 * Step type indicator
 */
export function stepTypeIndicator(
  type: "info" | "action" | "interactive"
): string {
  switch (type) {
    case "info":
      return INFO(ICONS.info);
    case "action":
      return WARNING(ICONS.action);
    case "interactive":
      return SUCCESS(ICONS.interactive);
  }
}

/**
 * Section header within tutorial content
 */
export function sectionHeader(title: string): string {
  return `\n${EMPHASIS(title)}\n${MUTED("─".repeat(title.length))}`;
}

/**
 * Bullet list item
 */
export function bulletItem(text: string, index?: number): string {
  const bullet = index !== undefined ? `${index}.` : ICONS.step;
  return `  ${SECONDARY(bullet)} ${text}`;
}

/**
 * Code/command highlight
 */
export function codeHighlight(code: string): string {
  return chalk.bgGray.white(` ${code} `);
}

/**
 * Success message
 */
export function successMessage(text: string): string {
  return SUCCESS(`${ICONS.completed} ${text}`);
}

/**
 * Error message
 */
export function errorMessage(text: string): string {
  return ERROR(`✗ ${text}`);
}

/**
 * Tutorial completion banner
 */
export function completionBanner(scenarioName: string): string {
  return [
    "",
    SUCCESS("─".repeat(50)),
    "",
    `  ${ICONS.trophy} ${EMPHASIS("Congratulations!")}`,
    "",
    `  You've completed: ${PRIMARY(scenarioName)}`,
    "",
    SUCCESS("─".repeat(50)),
    "",
  ].join("\n");
}

/**
 * Demo data indicator
 */
export function demoIndicator(): string {
  return WARNING("[DEMO]");
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Wrap text to fit within a given width
 */
function wrapText(text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  const paragraphs = text.split("\n");

  for (const paragraph of paragraphs) {
    if (paragraph.trim() === "") {
      lines.push("");
      continue;
    }

    const words = paragraph.split(" ");
    let currentLine = "";

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      // Strip ANSI codes for length calculation
      const plainLength = testLine.replace(/\x1b\[[0-9;]*m/g, "").length;

      if (plainLength <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(currentLine);
        }
        currentLine = word;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }
  }

  return lines;
}

/**
 * Center text within a given width
 */
export function centerText(text: string, width: number): string {
  const plainLength = text.replace(/\x1b\[[0-9;]*m/g, "").length;
  const padding = Math.floor((width - plainLength) / 2);
  return " ".repeat(Math.max(0, padding)) + text;
}

/**
 * Right-align text within a given width
 */
export function rightAlign(text: string, width: number): string {
  const plainLength = text.replace(/\x1b\[[0-9;]*m/g, "").length;
  const padding = width - plainLength;
  return " ".repeat(Math.max(0, padding)) + text;
}
