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
export { registerApproveCommands } from "./commands/approve.js";
export { registerAutoTradeCommands } from "./commands/auto-trade.js";
export { registerMonitorCommands } from "./commands/monitor.js";

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
