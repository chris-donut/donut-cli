/**
 * CLI Module Index
 *
 * Central export point for all CLI command modules and utilities.
 */

// Command registration functions
export { registerSessionCommands } from "./commands/session.js";

// Theme exports (for use in other command modules)
export {
  BANNER,
  DEMO_BANNER,
  DEMO_INDICATOR,
  PRIMARY,
  SUCCESS,
  ERROR,
  WARNING,
  INFO,
  MUTED,
  formatNumber,
  formatCurrency,
  formatPercent,
  formatPnL,
  formatPercentColored,
  formatRelativeTime,
  tableRow,
  separator,
  sectionHeader,
} from "./theme.js";
