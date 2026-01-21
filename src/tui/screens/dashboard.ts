/**
 * Trading Dashboard Screen - Full-screen multi-panel dashboard
 *
 * SRCL-inspired trading dashboard with portfolio, market data, positions, and activity
 */

import { box, colors, icons, padEnd, padCenter, visualLength, style, blocks } from "../components/theme.js";
import { panel, sideBySide, grid, divider } from "../components/panel.js";
import { dataTable, positionsTable, keyValueTable } from "../components/data-table.js";
import { progressBar, sparkline, confidenceIndicator } from "../components/progress.js";
import { actionBar, breadcrumb } from "../components/menu.js";

// ============================================================================
// Types
// ============================================================================

export interface DashboardData {
  // Session info
  sessionId: string;
  stage: string;

  // Portfolio
  portfolio: {
    totalValue: number;
    totalPnl: number;
    totalPnlPercent: number;
    assets: Array<{
      symbol: string;
      quantity: number;
      value: number;
      allocation: number;
    }>;
  };

  // Market data
  markets: Array<{
    symbol: string;
    price: number;
    change: number;
    changePercent: number;
    volume?: number;
  }>;

  // Positions
  positions: Array<{
    symbol: string;
    side: "long" | "short";
    quantity: number;
    entryPrice: number;
    currentPrice: number;
    pnl: number;
    pnlPercent: number;
  }>;

  // Recent trades
  recentTrades: Array<{
    time: Date;
    symbol: string;
    side: "buy" | "sell";
    quantity: number;
    price: number;
  }>;

  // Strategy info
  strategy?: {
    name: string;
    type: string;
    confidence: number;
    signals?: Array<{ name: string; value: string }>;
  };

  // Performance history (for sparkline)
  performanceHistory?: number[];
}

// ============================================================================
// Dashboard Rendering
// ============================================================================

/**
 * Format currency with color for positive/negative
 */
function formatPnL(value: number, prefix = "$"): string {
  const absValue = Math.abs(value);
  let formatted: string;

  if (absValue >= 1_000_000) {
    formatted = `${prefix}${(absValue / 1_000_000).toFixed(2)}M`;
  } else if (absValue >= 1_000) {
    formatted = `${prefix}${(absValue / 1_000).toFixed(1)}K`;
  } else {
    formatted = `${prefix}${absValue.toFixed(2)}`;
  }

  if (value >= 0) {
    return colors.successBright(`+${formatted}`);
  }
  return colors.errorBright(`-${formatted}`);
}

/**
 * Format percentage with color
 */
function formatPctColor(value: number): string {
  const formatted = `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;
  return value >= 0 ? colors.successBright(formatted) : colors.errorBright(formatted);
}

/**
 * Render portfolio panel
 */
function renderPortfolio(data: DashboardData): string {
  const { portfolio, performanceHistory } = data;
  const chars = box.single;
  const width = 38;
  const innerWidth = width - 2;

  const lines: string[] = [];

  // Header
  lines.push(colors.primary(`${chars.topLeft}${"─ PORTFOLIO ".padEnd(innerWidth, chars.horizontal)}${chars.topRight}`));
  lines.push(colors.primary(chars.vertical) + " ".repeat(innerWidth) + colors.primary(chars.vertical));

  // Total value
  const totalLine = padEnd(`  Total: ${colors.textBright(`$${portfolio.totalValue.toLocaleString()}`)}`, innerWidth);
  lines.push(colors.primary(chars.vertical) + totalLine + colors.primary(chars.vertical));

  // P&L
  const pnlLine = padEnd(`  P&L:   ${formatPnL(portfolio.totalPnl)} (${formatPctColor(portfolio.totalPnlPercent)})`, innerWidth);
  lines.push(colors.primary(chars.vertical) + pnlLine + colors.primary(chars.vertical));

  // Sparkline
  if (performanceHistory && performanceHistory.length > 0) {
    lines.push(colors.primary(chars.vertical) + " ".repeat(innerWidth) + colors.primary(chars.vertical));
    const spark = sparkline(performanceHistory, innerWidth - 4);
    const sparkLine = `  ${colors.info(spark)}`;
    lines.push(colors.primary(chars.vertical) + padEnd(sparkLine, innerWidth) + colors.primary(chars.vertical));
  }

  // Separator
  lines.push(colors.primary(chars.teeLeft + chars.horizontal.repeat(innerWidth) + chars.teeRight));

  // Assets
  for (const asset of portfolio.assets.slice(0, 5)) {
    const allocation = `${(asset.allocation * 100).toFixed(0)}%`;
    const assetLine = `  ${padEnd(asset.symbol, 8)} ${padEnd(`$${asset.value.toLocaleString()}`, 12)} ${colors.textMuted(allocation)}`;
    lines.push(colors.primary(chars.vertical) + padEnd(assetLine, innerWidth) + colors.primary(chars.vertical));
  }

  // Footer
  lines.push(colors.primary(chars.vertical) + " ".repeat(innerWidth) + colors.primary(chars.vertical));
  lines.push(colors.primary(chars.bottomLeft + chars.horizontal.repeat(innerWidth) + chars.bottomRight));

  return lines.join("\n");
}

/**
 * Render market data panel
 */
function renderMarkets(data: DashboardData): string {
  const { markets } = data;
  const chars = box.single;
  const width = 38;
  const innerWidth = width - 2;

  const lines: string[] = [];

  // Header
  lines.push(colors.info(`${chars.topLeft}${"─ MARKET DATA ".padEnd(innerWidth, chars.horizontal)}${chars.topRight}`));
  lines.push(colors.info(chars.vertical) + " ".repeat(innerWidth) + colors.info(chars.vertical));

  // Market rows
  for (const market of markets.slice(0, 8)) {
    const priceStr = `$${market.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    const changeStr = formatPctColor(market.changePercent);
    const arrow = market.change >= 0 ? colors.successBright(icons.up) : colors.errorBright(icons.down);

    const line = `  ${padEnd(market.symbol, 10)} ${padEnd(priceStr, 12)} ${arrow} ${changeStr}`;
    lines.push(colors.info(chars.vertical) + padEnd(line, innerWidth) + colors.info(chars.vertical));
  }

  // Padding
  const remaining = 10 - markets.length;
  for (let i = 0; i < remaining; i++) {
    lines.push(colors.info(chars.vertical) + " ".repeat(innerWidth) + colors.info(chars.vertical));
  }

  // Footer
  lines.push(colors.info(chars.vertical) + " ".repeat(innerWidth) + colors.info(chars.vertical));
  lines.push(colors.info(chars.bottomLeft + chars.horizontal.repeat(innerWidth) + chars.bottomRight));

  return lines.join("\n");
}

/**
 * Render positions panel
 */
function renderPositions(data: DashboardData): string {
  const { positions } = data;
  const chars = box.single;
  const width = 38;
  const innerWidth = width - 2;

  const lines: string[] = [];

  // Header
  lines.push(colors.warning(`${chars.topLeft}${"─ POSITIONS ".padEnd(innerWidth, chars.horizontal)}${chars.topRight}`));
  lines.push(colors.warning(chars.vertical) + " ".repeat(innerWidth) + colors.warning(chars.vertical));

  if (positions.length === 0) {
    const emptyLine = padCenter(colors.textMuted("No open positions"), innerWidth);
    lines.push(colors.warning(chars.vertical) + emptyLine + colors.warning(chars.vertical));
  } else {
    for (const pos of positions.slice(0, 5)) {
      const sideIcon = pos.side === "long" ? colors.successBright("L") : colors.errorBright("S");
      const pnlStr = formatPnL(pos.pnl);

      const line = `  ${sideIcon} ${padEnd(pos.symbol, 8)} ${padEnd(pos.quantity.toString(), 6)} ${pnlStr}`;
      lines.push(colors.warning(chars.vertical) + padEnd(line, innerWidth) + colors.warning(chars.vertical));
    }
  }

  // Padding
  const padRows = Math.max(0, 6 - positions.length);
  for (let i = 0; i < padRows; i++) {
    lines.push(colors.warning(chars.vertical) + " ".repeat(innerWidth) + colors.warning(chars.vertical));
  }

  // Footer
  lines.push(colors.warning(chars.vertical) + " ".repeat(innerWidth) + colors.warning(chars.vertical));
  lines.push(colors.warning(chars.bottomLeft + chars.horizontal.repeat(innerWidth) + chars.bottomRight));

  return lines.join("\n");
}

/**
 * Render strategy panel
 */
function renderStrategy(data: DashboardData): string {
  const { strategy } = data;
  const chars = box.single;
  const width = 38;
  const innerWidth = width - 2;

  const lines: string[] = [];

  // Header
  lines.push(colors.success(`${chars.topLeft}${"─ ACTIVE STRATEGY ".padEnd(innerWidth, chars.horizontal)}${chars.topRight}`));
  lines.push(colors.success(chars.vertical) + " ".repeat(innerWidth) + colors.success(chars.vertical));

  if (!strategy) {
    const emptyLine = padCenter(colors.textMuted("No strategy active"), innerWidth);
    lines.push(colors.success(chars.vertical) + emptyLine + colors.success(chars.vertical));
    lines.push(colors.success(chars.vertical) + " ".repeat(innerWidth) + colors.success(chars.vertical));
    lines.push(colors.success(chars.vertical) + " ".repeat(innerWidth) + colors.success(chars.vertical));
  } else {
    // Strategy name and type
    const nameLine = padEnd(`  ${colors.textBright(strategy.name)}`, innerWidth);
    lines.push(colors.success(chars.vertical) + nameLine + colors.success(chars.vertical));

    const typeLine = padEnd(`  ${colors.textMuted("Type:")} ${strategy.type}`, innerWidth);
    lines.push(colors.success(chars.vertical) + typeLine + colors.success(chars.vertical));

    // Confidence bar
    lines.push(colors.success(chars.vertical) + " ".repeat(innerWidth) + colors.success(chars.vertical));
    const confBar = confidenceIndicator(strategy.confidence, 15);
    const confLine = padEnd(`  Confidence: ${confBar}`, innerWidth);
    lines.push(colors.success(chars.vertical) + confLine + colors.success(chars.vertical));

    // Signals
    if (strategy.signals && strategy.signals.length > 0) {
      lines.push(colors.success(chars.vertical) + " ".repeat(innerWidth) + colors.success(chars.vertical));
      for (const signal of strategy.signals.slice(0, 3)) {
        const sigLine = padEnd(`  ${colors.textMuted(signal.name + ":")} ${signal.value}`, innerWidth);
        lines.push(colors.success(chars.vertical) + sigLine + colors.success(chars.vertical));
      }
    }
  }

  // Padding
  lines.push(colors.success(chars.vertical) + " ".repeat(innerWidth) + colors.success(chars.vertical));
  lines.push(colors.success(chars.bottomLeft + chars.horizontal.repeat(innerWidth) + chars.bottomRight));

  return lines.join("\n");
}

/**
 * Render the full trading dashboard
 */
export function renderDashboard(data: DashboardData): string {
  const totalWidth = 80;
  const chars = box.double;

  const output: string[] = [];

  // Top header bar
  const headerLeft = `${icons.donut} DONUT CLI`;
  const headerRight = `Session: ${data.sessionId.slice(0, 8)}`;
  const headerCenter = `Stage: ${colors.warning(data.stage)}`;
  const headerLine = ` ${headerLeft}${" ".repeat(totalWidth - visualLength(headerLeft) - visualLength(headerRight) - visualLength(headerCenter) - 4)}${headerCenter}  ${headerRight} `;

  output.push(colors.primary(chars.topLeft + chars.horizontal.repeat(totalWidth - 2) + chars.topRight));
  output.push(colors.primary(chars.vertical) + colors.textBright(headerLine) + colors.primary(chars.vertical));
  output.push(colors.primary(chars.teeLeft + chars.horizontal.repeat(totalWidth - 2) + chars.teeRight));

  // Main content area - two columns
  const leftPanel = renderPortfolio(data);
  const rightPanel = renderMarkets(data);

  const leftLines = leftPanel.split("\n");
  const rightLines = rightPanel.split("\n");
  const maxLines1 = Math.max(leftLines.length, rightLines.length);

  for (let i = 0; i < maxLines1; i++) {
    const left = leftLines[i] || " ".repeat(38);
    const right = rightLines[i] || " ".repeat(38);
    output.push(colors.primary(chars.vertical) + " " + left + " " + right + " " + colors.primary(chars.vertical));
  }

  // Middle separator
  output.push(colors.primary(chars.teeLeft + chars.horizontal.repeat(totalWidth - 2) + chars.teeRight));

  // Bottom panels - positions and strategy
  const posPanel = renderPositions(data);
  const stratPanel = renderStrategy(data);

  const posLines = posPanel.split("\n");
  const stratLines = stratPanel.split("\n");
  const maxLines2 = Math.max(posLines.length, stratLines.length);

  for (let i = 0; i < maxLines2; i++) {
    const left = posLines[i] || " ".repeat(38);
    const right = stratLines[i] || " ".repeat(38);
    output.push(colors.primary(chars.vertical) + " " + left + " " + right + " " + colors.primary(chars.vertical));
  }

  // Action bar
  output.push(colors.primary(chars.teeLeft + chars.horizontal.repeat(totalWidth - 2) + chars.teeRight));
  const actions = actionBar([
    { key: "F1", label: "Help" },
    { key: "F2", label: "Trade" },
    { key: "F3", label: "Strategy" },
    { key: "F4", label: "Backtest" },
    { key: "F5", label: "Settings" },
    { key: "ESC", label: "Menu" },
  ], { width: totalWidth - 4 });
  const actionLine = padCenter(actions, totalWidth - 2);
  output.push(colors.primary(chars.vertical) + actionLine + colors.primary(chars.vertical));

  // Bottom border
  output.push(colors.primary(chars.bottomLeft + chars.horizontal.repeat(totalWidth - 2) + chars.bottomRight));

  return output.join("\n");
}

/**
 * Create sample dashboard data for demo
 */
export function sampleDashboardData(): DashboardData {
  return {
    sessionId: "abc123def456",
    stage: "STRATEGY_BUILD",
    portfolio: {
      totalValue: 125430.50,
      totalPnl: 15430.50,
      totalPnlPercent: 0.1403,
      assets: [
        { symbol: "BTC", quantity: 1.5, value: 100851, allocation: 0.804 },
        { symbol: "ETH", quantity: 10.0, value: 18500, allocation: 0.147 },
        { symbol: "SOL", quantity: 50.0, value: 6079.50, allocation: 0.049 },
      ],
    },
    markets: [
      { symbol: "BTC/USDT", price: 67234.12, change: 1567.23, changePercent: 0.0239 },
      { symbol: "ETH/USDT", price: 3456.78, change: -45.32, changePercent: -0.0129 },
      { symbol: "SOL/USDT", price: 178.45, change: 8.76, changePercent: 0.0517 },
      { symbol: "AVAX/USDT", price: 42.30, change: 1.20, changePercent: 0.0292 },
      { symbol: "LINK/USDT", price: 18.92, change: -0.34, changePercent: -0.0177 },
    ],
    positions: [
      { symbol: "BTC/USDT", side: "long", quantity: 0.5, entryPrice: 65000, currentPrice: 67234, pnl: 1117, pnlPercent: 0.0344 },
      { symbol: "ETH/USDT", side: "long", quantity: 5.0, entryPrice: 3200, currentPrice: 3456, pnl: 1280, pnlPercent: 0.08 },
    ],
    recentTrades: [
      { time: new Date(), symbol: "BTC/USDT", side: "buy", quantity: 0.1, price: 67100 },
      { time: new Date(Date.now() - 300000), symbol: "ETH/USDT", side: "sell", quantity: 1.0, price: 3450 },
    ],
    strategy: {
      name: "Momentum Alpha",
      type: "Momentum",
      confidence: 0.78,
      signals: [
        { name: "RSI", value: "65 (Neutral)" },
        { name: "MACD", value: "Bullish Crossover" },
        { name: "Volume", value: "+20% Above Avg" },
      ],
    },
    performanceHistory: [100, 102, 101, 105, 108, 106, 110, 115, 112, 118, 120, 125],
  };
}

/**
 * Compact status bar for embedding in TUI
 */
export function statusBar(data: { sessionId: string; stage: string; balance: number; pnl: number }): string {
  const chars = box.single;
  const width = 65;

  const session = `Session: ${colors.info(data.sessionId.slice(0, 8))}`;
  const stage = `Stage: ${colors.warning(data.stage)}`;
  const balance = `Balance: ${colors.textBright(`$${data.balance.toLocaleString()}`)}`;
  const pnl = `P&L: ${formatPnL(data.pnl)}`;

  const parts = [session, stage, balance, pnl];
  const content = parts.join("  │  ");

  return (
    colors.primary(chars.topLeft + chars.horizontal.repeat(width - 2) + chars.topRight) +
    "\n" +
    colors.primary(chars.vertical) +
    " " +
    padEnd(content, width - 4) +
    " " +
    colors.primary(chars.vertical) +
    "\n" +
    colors.primary(chars.bottomLeft + chars.horizontal.repeat(width - 2) + chars.bottomRight)
  );
}
