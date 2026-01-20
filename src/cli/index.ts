/**
 * CLI Module Index
 *
 * Central export point for all CLI command modules and utilities.
 */

// Command registration functions
export { registerSessionCommands } from "./commands/session.js";
export { registerPaperTradingCommands } from "./commands/paper-trading.js";
export { registerNotificationCommands } from "./commands/notifications.js";
export { registerDemoCommands } from "./commands/demo.js";
export { registerStrategyCommands } from "./commands/strategy.js";
export { registerBacktestCommands } from "./commands/backtest.js";
export { registerSetupCommands } from "./commands/setup.js";

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

// Animation exports
export { playDonutAnimation } from "./animation.js";
