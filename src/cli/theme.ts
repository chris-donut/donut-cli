/**
 * CLI Theme - Shared styling constants for CLI output
 */

import chalk from "chalk";

// ============================================================================
// Banners
// ============================================================================

export const BANNER = `
${chalk.hex("#FF6B35")("╔═══════════════════════════════════════════════════════════════╗")}
${chalk.hex("#FF6B35")("║")}                                                               ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("║")}   ${chalk.bold.white("🍩 Donut CLI")} - ${chalk.gray("Unified Trading Terminal")}                    ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("║")}                                                               ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("║")}   ${chalk.cyan("Strategy Building")} · ${chalk.green("Backtesting")} · ${chalk.yellow("AI Analysis")} · ${chalk.magenta("Execution")}   ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("║")}                                                               ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("╚═══════════════════════════════════════════════════════════════╝")}
`;

export const BANNER_WITH_HINTS = `
${chalk.hex("#FF6B35")("╔═══════════════════════════════════════════════════════════════╗")}
${chalk.hex("#FF6B35")("║")}                                                               ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("║")}   ${chalk.bold.white("🍩 Donut CLI")} - ${chalk.gray("Unified Trading Terminal")}                    ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("║")}                                                               ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("║")}   ${chalk.cyan("Strategy Building")} · ${chalk.green("Backtesting")} · ${chalk.yellow("AI Analysis")} · ${chalk.magenta("Execution")}   ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("║")}                                                               ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("╠═══════════════════════════════════════════════════════════════╣")}
${chalk.hex("#FF6B35")("║")}                                                               ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("║")}   ${chalk.bold.white("Quick Start:")}                                               ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("║")}     ${chalk.cyan("donut demo tour")}     Interactive tutorial (no API key)      ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("║")}     ${chalk.cyan("donut setup")}         Configure API key                      ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("║")}     ${chalk.cyan("donut chat")}          Start AI assistant                     ${chalk.hex("#FF6B35")("║")}
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

export const DEMO_BANNER = `
${chalk.hex("#FF6B35")("╔═══════════════════════════════════════════════════════════════╗")}
${chalk.hex("#FF6B35")("║")}                                                               ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("║")}   ${chalk.bold.white("🍩 Donut CLI")} - ${chalk.bgYellow.black(" DEMO MODE ")}                              ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("║")}                                                               ${chalk.hex("#FF6B35")("║")}
${chalk.hex("#FF6B35")("║")}   ${chalk.yellow("All data is simulated - no backends required")}                ${chalk.hex("#FF6B35")("║")}
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
