/**
 * SRCL-Inspired Theme - Enhanced terminal aesthetics
 *
 * Box drawing characters, colors, and styling utilities
 * inspired by Sacred Computer React Library (SRCL)
 */

import chalk from "chalk";

// ============================================================================
// Color Palette - Retro Terminal Theme
// ============================================================================

export const colors = {
  // Brand
  primary: chalk.hex("#FF6B35"),
  primaryBg: chalk.bgHex("#FF6B35").black,

  // Semantic
  success: chalk.hex("#00AA00"),
  successBright: chalk.hex("#00FF00"),
  error: chalk.hex("#AA0000"),
  errorBright: chalk.hex("#FF5555"),
  warning: chalk.hex("#AA5500"),
  warningBright: chalk.hex("#FFAA00"),
  info: chalk.hex("#00AAAA"),
  infoBright: chalk.hex("#00FFFF"),

  // Neutrals
  text: chalk.hex("#AAAAAA"),
  textBright: chalk.hex("#FFFFFF"),
  textMuted: chalk.hex("#555555"),
  textDim: chalk.hex("#333333"),

  // Special
  highlight: chalk.bgHex("#0000AA").white,
  selection: chalk.bgHex("#444444").white,
  inverse: chalk.inverse,

  // Backgrounds (for when we need them)
  bgPrimary: chalk.bgHex("#000000"),
  bgSecondary: chalk.bgHex("#111111"),
  bgHighlight: chalk.bgHex("#0000AA"),
};

// ============================================================================
// Box Drawing Characters
// ============================================================================

export const box = {
  // Single line
  single: {
    topLeft: "┌",
    topRight: "┐",
    bottomLeft: "└",
    bottomRight: "┘",
    horizontal: "─",
    vertical: "│",
    teeLeft: "├",
    teeRight: "┤",
    teeUp: "┴",
    teeDown: "┬",
    cross: "┼",
  },

  // Double line
  double: {
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
  },

  // Rounded corners
  rounded: {
    topLeft: "╭",
    topRight: "╮",
    bottomLeft: "╰",
    bottomRight: "╯",
    horizontal: "─",
    vertical: "│",
    teeLeft: "├",
    teeRight: "┤",
    teeUp: "┴",
    teeDown: "┬",
    cross: "┼",
  },

  // Heavy line
  heavy: {
    topLeft: "┏",
    topRight: "┓",
    bottomLeft: "┗",
    bottomRight: "┛",
    horizontal: "━",
    vertical: "┃",
    teeLeft: "┣",
    teeRight: "┫",
    teeUp: "┻",
    teeDown: "┳",
    cross: "╋",
  },
};

// ============================================================================
// Block Characters for Progress/Loaders
// ============================================================================

export const blocks = {
  full: "█",
  threeQuarter: "▓",
  half: "▒",
  quarter: "░",
  empty: " ",

  // Horizontal bars
  left: ["▏", "▎", "▍", "▌", "▋", "▊", "▉", "█"],

  // Vertical bars
  bottom: ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"],

  // Quadrants
  quadrants: ["▖", "▗", "▘", "▙", "▚", "▛", "▜", "▝", "▞", "▟"],
};

// ============================================================================
// Spinner Characters
// ============================================================================

export const spinners = {
  // Braille dots
  braille: ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"],

  // Block spinner
  blocks: ["▖", "▘", "▝", "▗"],

  // Classic ASCII
  ascii: ["|", "/", "-", "\\"],

  // Dots
  dots: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],

  // Box drawing
  boxSpinner: ["┤", "┘", "┴", "└", "├", "┌", "┬", "┐"],

  // Arrows
  arrows: ["←", "↖", "↑", "↗", "→", "↘", "↓", "↙"],

  // Cute
  cute: ["◐", "◓", "◑", "◒"],

  // Binary
  binary: ["0", "1"],
};

// ============================================================================
// Icons
// ============================================================================

export const icons = {
  // Status
  success: "✓",
  error: "✗",
  warning: "⚠",
  info: "ℹ",

  // Actions
  play: "▶",
  pause: "⏸",
  stop: "■",
  record: "●",

  // Navigation
  arrowRight: "→",
  arrowLeft: "←",
  arrowUp: "↑",
  arrowDown: "↓",
  chevronRight: "❯",
  chevronLeft: "❮",
  pointer: "▸",
  pointerEmpty: "▹",

  // Selection
  checkbox: "☐",
  checkboxChecked: "☑",
  radio: "○",
  radioSelected: "◉",

  // Misc
  bullet: "•",
  dash: "─",
  ellipsis: "…",
  star: "★",
  starEmpty: "☆",
  heart: "♥",
  diamond: "◆",
  circle: "●",
  circleEmpty: "○",
  square: "■",
  squareEmpty: "□",

  // Trading specific
  up: "▲",
  down: "▼",
  neutral: "◆",
  buy: "↑",
  sell: "↓",

  // App specific
  donut: "🍩",
  robot: "🤖",
  chart: "📊",
  money: "💰",
  rocket: "🚀",
  fire: "🔥",
  trophy: "🏆",
};

// ============================================================================
// Text Utilities
// ============================================================================

/**
 * Strip ANSI codes for accurate length calculation
 */
export function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "");
}

/**
 * Get visual length of string (excluding ANSI codes)
 */
export function visualLength(str: string): number {
  return stripAnsi(str).length;
}

/**
 * Pad string to target length, accounting for ANSI codes
 */
export function padEnd(str: string, length: number, char = " "): string {
  const visualLen = visualLength(str);
  if (visualLen >= length) return str;
  return str + char.repeat(length - visualLen);
}

/**
 * Pad string to center, accounting for ANSI codes
 */
export function padCenter(str: string, length: number, char = " "): string {
  const visualLen = visualLength(str);
  if (visualLen >= length) return str;
  const padLen = length - visualLen;
  const leftPad = Math.floor(padLen / 2);
  const rightPad = padLen - leftPad;
  return char.repeat(leftPad) + str + char.repeat(rightPad);
}

/**
 * Truncate string with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (visualLength(str) <= maxLength) return str;
  return stripAnsi(str).slice(0, maxLength - 1) + "…";
}

/**
 * Wrap text to specified width
 */
export function wrapText(text: string, width: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if (currentLine.length + word.length + 1 <= width) {
      currentLine += (currentLine ? " " : "") + word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines;
}

// ============================================================================
// Semantic Styling Helpers
// ============================================================================

export const style = {
  // Headings
  h1: (text: string) => colors.textBright(chalk.bold(text)),
  h2: (text: string) => colors.primary(chalk.bold(text)),
  h3: (text: string) => colors.info(text),

  // Text variants
  bold: (text: string) => chalk.bold(text),
  dim: (text: string) => colors.textMuted(text),
  muted: (text: string) => colors.textDim(text),

  // Status
  success: (text: string) => colors.success(text),
  error: (text: string) => colors.error(text),
  warning: (text: string) => colors.warning(text),
  info: (text: string) => colors.info(text),

  // Financial
  positive: (text: string) => colors.successBright(text),
  negative: (text: string) => colors.errorBright(text),
  neutral: (text: string) => colors.text(text),

  // Interactive
  command: (text: string) => colors.info(text),
  key: (text: string) => colors.primary(text),
  value: (text: string) => colors.textBright(text),
  label: (text: string) => colors.textMuted(text),
};
