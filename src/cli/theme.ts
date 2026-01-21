/**
 * CLI Theme - Shared styling constants for CLI output
 */

import chalk from "chalk";

// ============================================================================
// Banners
// ============================================================================

/** SRCL-inspired double-line bordered banner */
export const BANNER = `
${chalk.hex("#FF6B35")("╔═══════════════════════════════════════════════════════════════╗")}
${chalk.hex("#FF6B35")("║")}                                                               ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("║")}      ${chalk.bold.white("🍩 DONUT CLI")}                                            ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("║")}      ${chalk.gray("━━━━━━━━━━━━━")}                                            ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("║")}      ${chalk.italic.gray("AI-Powered Crypto Trading Terminal")}                       ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("║")}                                                               ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("╠═══════════════════════════════════════════════════════════════╣")}
${chalk.hex("#FF6B35")("║")}                                                               ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("║")}   ${chalk.cyan("▸ Strategy Building")}    ${chalk.green("▸ Backtesting")}                      ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("║")}   ${chalk.yellow("▸ AI Analysis")}          ${chalk.magenta("▸ Execution")}                        ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("║")}                                                               ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("╚═══════════════════════════════════════════════════════════════╝")}
`;

/** SRCL-inspired banner with quick start hints */
export const BANNER_WITH_HINTS = `
${chalk.hex("#FF6B35")("╔═══════════════════════════════════════════════════════════════╗")}
${chalk.hex("#FF6B35")("║")}                                                               ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("║")}      ${chalk.bold.white("🍩 DONUT CLI")}                                            ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("║")}      ${chalk.gray("━━━━━━━━━━━━━")}                                            ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("║")}      ${chalk.italic.gray("AI-Powered Crypto Trading Terminal")}                       ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("║")}                                                               ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("╠═══════════════════════════════════════════════════════════════╣")}
${chalk.hex("#FF6B35")("║")}                                                               ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("║")}   ${chalk.bold.white("Quick Start")}                                                ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("║")}   ${chalk.gray("─────────────────────────────────────────────────────────")}  ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("║")}                                                               ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("║")}   ${chalk.cyan("donut demo tour")}   ${chalk.gray("│")} Interactive tutorial ${chalk.gray("(no API key)")}   ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("║")}   ${chalk.cyan("donut setup")}       ${chalk.gray("│")} Configure API key                    ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("║")}   ${chalk.cyan("donut chat")}        ${chalk.gray("│")} Start AI assistant                   ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("║")}                                                               ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("╚═══════════════════════════════════════════════════════════════╝")}
`;

/**
 * Get the appropriate banner based on context
 * @param showHints Whether to show quick start hints
 */
export function getBanner(showHints: boolean = false): string {
  return showHints ? BANNER_WITH_HINTS : BANNER;
}

/** SRCL-inspired demo mode banner */
export const DEMO_BANNER = `
${chalk.hex("#FF6B35")("╔═══════════════════════════════════════════════════════════════╗")}
${chalk.hex("#FF6B35")("║")}                                                               ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("║")}      ${chalk.bold.white("🍩 DONUT CLI")}  ${chalk.bgYellow.black(" DEMO MODE ")}                           ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("║")}      ${chalk.gray("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")}                        ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("║")}                                                               ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("║")}      ${chalk.yellow("⚠")} ${chalk.yellow("All data is simulated")}                                ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("║")}      ${chalk.gray("No backends or API keys required")}                       ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("║")}                                                               ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("╚═══════════════════════════════════════════════════════════════╝")}
`;

export const DEMO_INDICATOR = chalk.bgYellow.black(" DEMO MODE ");

// ============================================================================
// Colors
// ============================================================================

export const PRIMARY = chalk.hex("#FF6B35");
export const SUCCESS = chalk.green;
export const ERROR = chalk.red;
export const WARNING = chalk.yellow;
export const INFO = chalk.cyan;
export const MUTED = chalk.gray;

// ============================================================================
// Formatting Helpers
// ============================================================================

/**
 * Format a number with thousand separators
 */
export function formatNumber(num: number, decimals = 2): string {
  return num.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format currency value
 */
export function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `$${formatNumber(value / 1_000_000, 2)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `$${formatNumber(value / 1_000, 1)}K`;
  }
  return `$${formatNumber(value, 2)}`;
}

/**
 * Format percentage
 */
export function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${formatNumber(value * 100, 2)}%`;
}

/**
 * Format PnL with color
 */
export function formatPnL(value: number): string {
  const formatted = formatCurrency(value);
  return value >= 0 ? SUCCESS(formatted) : ERROR(formatted);
}

/**
 * Format percent with color
 */
export function formatPercentColored(value: number): string {
  const formatted = formatPercent(value);
  return value >= 0 ? SUCCESS(formatted) : ERROR(formatted);
}

/**
 * Format a date relative to now
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

// ============================================================================
// Tables
// ============================================================================

/**
 * Create a simple table row
 */
export function tableRow(label: string, value: string, width = 20): string {
  return `${MUTED(label.padEnd(width))} ${value}`;
}

/**
 * Create a separator line
 */
export function separator(width = 50): string {
  return MUTED("─".repeat(width));
}

/**
 * Create a section header
 */
export function sectionHeader(title: string): string {
  return `\n${chalk.bold(title)}\n${separator()}`;
}

// ============================================================================
// SRCL-Inspired Components
// ============================================================================

/** Block characters for progress bars */
export const BLOCKS = {
  full: "█",
  threeQuarter: "▓",
  half: "▒",
  quarter: "░",
} as const;

/**
 * Create an SRCL-style progress bar
 */
export function progressBar(value: number, total = 100, width = 20): string {
  const percent = Math.min(100, Math.max(0, (value / total) * 100));
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;

  return SUCCESS(BLOCKS.full.repeat(filled)) + MUTED(BLOCKS.quarter.repeat(empty));
}

/**
 * Create a bordered panel
 */
export function panel(title: string, content: string[], width = 60): string {
  const innerWidth = width - 2;
  const lines: string[] = [];

  // Top border with title
  const titleText = ` ${title} `;
  const titleLen = titleText.length;
  const leftPad = Math.floor((innerWidth - titleLen) / 2);
  const rightPad = innerWidth - leftPad - titleLen;

  lines.push(PRIMARY(`╔${"═".repeat(leftPad)}${titleText}${"═".repeat(rightPad)}╗`));

  // Empty line
  lines.push(PRIMARY("║") + " ".repeat(innerWidth) + PRIMARY("║"));

  // Content
  for (const line of content) {
    const paddedLine = line.padEnd(innerWidth);
    lines.push(PRIMARY("║") + paddedLine + PRIMARY("║"));
  }

  // Empty line
  lines.push(PRIMARY("║") + " ".repeat(innerWidth) + PRIMARY("║"));

  // Bottom border
  lines.push(PRIMARY(`╚${"═".repeat(innerWidth)}╝`));

  return lines.join("\n");
}

/**
 * Create a data table row
 */
export function dataRow(label: string, value: string, labelWidth = 18): string {
  return `${MUTED(label.padEnd(labelWidth))} ${value}`;
}

/**
 * Create a list item
 */
export function listItem(text: string, selected = false): string {
  const pointer = selected ? PRIMARY("▸") : " ";
  return `${pointer} ${text}`;
}

/**
 * Create a key-value display
 */
export function keyValue(items: Array<{ key: string; value: string }>, keyWidth = 20): string {
  return items.map(({ key, value }) => dataRow(key, value, keyWidth)).join("\n");
}

/**
 * Create an alert banner
 */
export function alertBanner(message: string, variant: "info" | "success" | "warning" | "error" = "info"): string {
  const icons = { info: "ℹ", success: "✓", warning: "⚠", error: "✗" };
  const colors = { info: INFO, success: SUCCESS, warning: WARNING, error: ERROR };
  const color = colors[variant];
  const icon = icons[variant];

  const width = 60;
  return [
    color(`┌${"─".repeat(width - 2)}┐`),
    color(`│ ${icon} ${message.padEnd(width - 5)} │`),
    color(`└${"─".repeat(width - 2)}┘`),
  ].join("\n");
}
