/**
 * Data Table Component - SRCL-inspired data tables
 *
 * Full-featured tables with headers, borders, alignment, sorting indicators
 */

import { box, colors, padEnd, padCenter, visualLength, truncate, style } from "./theme.js";

// ============================================================================
// Types
// ============================================================================

export type ColumnAlign = "left" | "center" | "right";
export type ColumnFormat = "string" | "number" | "currency" | "percent" | "date" | "pnl" | "percentColored";
export type SortOrder = "asc" | "desc" | null;

export interface Column<T = Record<string, unknown>> {
  /** Column key in data object */
  key: keyof T | string;
  /** Column header label */
  label: string;
  /** Column width (auto if not specified) */
  width?: number;
  /** Minimum width */
  minWidth?: number;
  /** Maximum width */
  maxWidth?: number;
  /** Text alignment */
  align?: ColumnAlign;
  /** Value format */
  format?: ColumnFormat;
  /** Custom formatter function */
  formatter?: (value: unknown, row: T) => string;
  /** Sort indicator */
  sortOrder?: SortOrder;
}

export interface DataTableOptions<T = Record<string, unknown>> {
  /** Column definitions */
  columns: Column<T>[];
  /** Data rows */
  data: T[];
  /** Border style */
  border?: "single" | "double" | "none";
  /** Show header row */
  showHeader?: boolean;
  /** Show row numbers */
  showRowNumbers?: boolean;
  /** Maximum rows to display */
  maxRows?: number;
  /** Highlight selected row index */
  selectedRow?: number;
  /** Compact mode (less padding) */
  compact?: boolean;
  /** Zebra striping */
  zebra?: boolean;
  /** Title above table */
  title?: string;
  /** Footer below table */
  footer?: string;
  /** Empty state message */
  emptyMessage?: string;
}

// ============================================================================
// Formatters
// ============================================================================

function formatValue(value: unknown, format: ColumnFormat): string {
  if (value === null || value === undefined) return "-";

  switch (format) {
    case "number":
      return typeof value === "number" ? value.toLocaleString() : String(value);

    case "currency":
      if (typeof value !== "number") return String(value);
      if (Math.abs(value) >= 1_000_000) {
        return `$${(value / 1_000_000).toFixed(2)}M`;
      }
      if (Math.abs(value) >= 1_000) {
        return `$${(value / 1_000).toFixed(1)}K`;
      }
      return `$${value.toFixed(2)}`;

    case "percent":
      if (typeof value !== "number") return String(value);
      const sign = value >= 0 ? "+" : "";
      return `${sign}${(value * 100).toFixed(2)}%`;

    case "pnl":
      if (typeof value !== "number") return String(value);
      const formatted =
        Math.abs(value) >= 1_000_000
          ? `$${(value / 1_000_000).toFixed(2)}M`
          : Math.abs(value) >= 1_000
            ? `$${(value / 1_000).toFixed(1)}K`
            : `$${value.toFixed(2)}`;
      return value >= 0 ? colors.successBright(formatted) : colors.errorBright(formatted);

    case "percentColored":
      if (typeof value !== "number") return String(value);
      const pctSign = value >= 0 ? "+" : "";
      const pctStr = `${pctSign}${(value * 100).toFixed(2)}%`;
      return value >= 0 ? colors.successBright(pctStr) : colors.errorBright(pctStr);

    case "date":
      if (value instanceof Date) {
        return value.toLocaleDateString();
      }
      return String(value);

    default:
      return String(value);
  }
}

// ============================================================================
// Table Rendering
// ============================================================================

/**
 * Create a data table
 */
export function dataTable<T extends Record<string, unknown>>(options: DataTableOptions<T>): string {
  const {
    columns,
    data,
    border = "single",
    showHeader = true,
    showRowNumbers = false,
    maxRows,
    selectedRow,
    compact = false,
    zebra = false,
    title,
    footer,
    emptyMessage = "No data available",
  } = options;

  const chars = border === "none" ? null : box[border];
  const padding = compact ? 0 : 1;

  // Calculate column widths
  const calculatedWidths: number[] = columns.map((col, idx) => {
    // Start with header length
    let width = visualLength(col.label);

    // Check all data values
    for (const row of data) {
      const value = row[col.key as keyof T];
      const formatted = col.formatter
        ? col.formatter(value, row)
        : formatValue(value, col.format || "string");
      width = Math.max(width, visualLength(formatted));
    }

    // Add sort indicator space
    if (col.sortOrder) width += 2;

    // Apply min/max constraints
    if (col.minWidth) width = Math.max(width, col.minWidth);
    if (col.maxWidth) width = Math.min(width, col.maxWidth);
    if (col.width) width = col.width;

    return width;
  });

  // Add row number column if needed
  const rowNumWidth = showRowNumbers ? Math.max(3, String(data.length).length) : 0;

  // Calculate total width
  const totalWidth =
    calculatedWidths.reduce((a, b) => a + b, 0) +
    calculatedWidths.length * (padding * 2) +
    (calculatedWidths.length - 1) +
    (rowNumWidth ? rowNumWidth + padding * 2 + 1 : 0) +
    (chars ? 2 : 0);

  const output: string[] = [];

  // Helper to create a row
  const createRow = (cells: string[], isHeader = false, isSelected = false): string => {
    const parts: string[] = [];

    if (showRowNumbers) {
      parts.push(padEnd("", rowNumWidth + padding * 2));
    }

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const width = calculatedWidths[i];
      const align = columns[i].align || (isHeader ? "left" : "left");

      let paddedCell: string;
      if (align === "center") {
        paddedCell = padCenter(cell, width);
      } else if (align === "right") {
        const padLen = width - visualLength(cell);
        paddedCell = " ".repeat(Math.max(0, padLen)) + cell;
      } else {
        paddedCell = padEnd(cell, width);
      }

      parts.push(" ".repeat(padding) + paddedCell + " ".repeat(padding));
    }

    let line = parts.join(chars ? chars.vertical : " ");

    if (chars) {
      line = chars.vertical + line + chars.vertical;
    }

    if (isSelected) {
      line = colors.highlight(line);
    } else if (isHeader) {
      line = colors.textBright(line);
    }

    return line;
  };

  // Create horizontal border
  const createBorder = (type: "top" | "middle" | "bottom"): string => {
    if (!chars) return "";

    const leftChar = type === "top" ? chars.topLeft : type === "bottom" ? chars.bottomLeft : chars.teeLeft;
    const rightChar = type === "top" ? chars.topRight : type === "bottom" ? chars.bottomRight : chars.teeRight;
    const midChar = type === "top" ? chars.teeDown : type === "bottom" ? chars.teeUp : chars.cross;

    const segments: string[] = [];

    if (showRowNumbers) {
      segments.push(chars.horizontal.repeat(rowNumWidth + padding * 2));
    }

    for (let i = 0; i < calculatedWidths.length; i++) {
      segments.push(chars.horizontal.repeat(calculatedWidths[i] + padding * 2));
    }

    return colors.textMuted(leftChar + segments.join(midChar) + rightChar);
  };

  // Title
  if (title) {
    output.push(style.h2(title));
  }

  // Top border
  if (chars) {
    output.push(createBorder("top"));
  }

  // Header row
  if (showHeader) {
    const headerCells = columns.map((col) => {
      let label = col.label;
      if (col.sortOrder === "asc") label += " ▲";
      else if (col.sortOrder === "desc") label += " ▼";
      return label;
    });
    output.push(createRow(headerCells, true));

    if (chars) {
      output.push(createBorder("middle"));
    }
  }

  // Empty state
  if (data.length === 0) {
    const emptyWidth = totalWidth - (chars ? 2 : 0);
    const emptyLine = chars
      ? chars.vertical + padCenter(colors.textMuted(emptyMessage), emptyWidth) + chars.vertical
      : padCenter(colors.textMuted(emptyMessage), emptyWidth);
    output.push(emptyLine);
  } else {
    // Data rows
    const displayData = maxRows ? data.slice(0, maxRows) : data;

    displayData.forEach((row, rowIdx) => {
      const cells = columns.map((col) => {
        const value = row[col.key as keyof T];
        if (col.formatter) {
          return col.formatter(value, row);
        }
        return formatValue(value, col.format || "string");
      });

      let rowLine = createRow(cells, false, rowIdx === selectedRow);

      if (zebra && rowIdx % 2 === 1) {
        // Apply subtle background for zebra striping
        rowLine = colors.bgSecondary(rowLine);
      }

      output.push(rowLine);
    });

    // Show truncation indicator
    if (maxRows && data.length > maxRows) {
      const moreText = `... and ${data.length - maxRows} more rows`;
      const moreWidth = totalWidth - (chars ? 2 : 0);
      const moreLine = chars
        ? chars.vertical + padCenter(colors.textMuted(moreText), moreWidth) + chars.vertical
        : padCenter(colors.textMuted(moreText), moreWidth);
      output.push(moreLine);
    }
  }

  // Bottom border
  if (chars) {
    output.push(createBorder("bottom"));
  }

  // Footer
  if (footer) {
    output.push(colors.textMuted(footer));
  }

  return output.join("\n");
}

/**
 * Simple key-value table (two columns)
 */
export function keyValueTable(
  data: Array<{ label: string; value: string }>,
  options: { labelWidth?: number; border?: boolean; title?: string } = {}
): string {
  const { labelWidth = 20, border = true, title } = options;

  return dataTable({
    columns: [
      { key: "label", label: "", width: labelWidth, align: "left" },
      { key: "value", label: "", align: "left" },
    ],
    data: data.map((item) => ({
      label: colors.textMuted(item.label),
      value: item.value,
    })),
    border: border ? "single" : "none",
    showHeader: false,
    title,
    compact: true,
  });
}

/**
 * Trading positions table
 */
export function positionsTable(
  positions: Array<{
    symbol: string;
    side: "long" | "short";
    quantity: number;
    entryPrice: number;
    currentPrice: number;
    pnl: number;
    pnlPercent: number;
  }>
): string {
  return dataTable({
    columns: [
      { key: "symbol", label: "SYMBOL", width: 12 },
      {
        key: "side",
        label: "SIDE",
        width: 6,
        formatter: (v) => (v === "long" ? colors.successBright("LONG") : colors.errorBright("SHORT")),
      },
      { key: "quantity", label: "QTY", width: 10, align: "right", format: "number" },
      { key: "entryPrice", label: "ENTRY", width: 12, align: "right", format: "currency" },
      { key: "currentPrice", label: "CURRENT", width: 12, align: "right", format: "currency" },
      { key: "pnl", label: "P&L", width: 12, align: "right", format: "pnl" },
      { key: "pnlPercent", label: "P&L %", width: 10, align: "right", format: "percentColored" },
    ],
    data: positions,
    border: "single",
    title: "OPEN POSITIONS",
  });
}

/**
 * Trade history table
 */
export function tradesTable(
  trades: Array<{
    time: Date;
    symbol: string;
    side: "buy" | "sell";
    quantity: number;
    price: number;
    total: number;
  }>
): string {
  return dataTable({
    columns: [
      {
        key: "time",
        label: "TIME",
        width: 10,
        formatter: (v) => (v instanceof Date ? v.toLocaleTimeString() : String(v)),
      },
      { key: "symbol", label: "SYMBOL", width: 12 },
      {
        key: "side",
        label: "SIDE",
        width: 6,
        formatter: (v) => (v === "buy" ? colors.successBright("BUY") : colors.errorBright("SELL")),
      },
      { key: "quantity", label: "QTY", width: 10, align: "right", format: "number" },
      { key: "price", label: "PRICE", width: 12, align: "right", format: "currency" },
      { key: "total", label: "TOTAL", width: 12, align: "right", format: "currency" },
    ],
    data: trades,
    border: "single",
    title: "RECENT TRADES",
    maxRows: 10,
  });
}
