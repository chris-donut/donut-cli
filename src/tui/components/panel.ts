/**
 * Panel Component - MS-DOS style bordered panels
 *
 * Creates boxed content areas with titles, footers, and various border styles
 */

import { box, colors, padEnd, padCenter, visualLength, wrapText } from "./theme.js";

// ============================================================================
// Types
// ============================================================================

export type BorderStyle = "single" | "double" | "rounded" | "heavy" | "none";
export type PanelVariant = "default" | "primary" | "success" | "warning" | "error" | "info";

export interface PanelOptions {
  /** Panel title (displayed in top border) */
  title?: string;
  /** Panel footer (displayed in bottom border) */
  footer?: string;
  /** Panel width (auto-calculated if not specified) */
  width?: number;
  /** Minimum width */
  minWidth?: number;
  /** Maximum width */
  maxWidth?: number;
  /** Border style */
  border?: BorderStyle;
  /** Color variant */
  variant?: PanelVariant;
  /** Padding inside the panel */
  padding?: number;
  /** Title alignment */
  titleAlign?: "left" | "center" | "right";
  /** Footer alignment */
  footerAlign?: "left" | "center" | "right";
}

// ============================================================================
// Variant Colors
// ============================================================================

const variantColors: Record<PanelVariant, typeof colors.primary> = {
  default: colors.textMuted,
  primary: colors.primary,
  success: colors.success,
  warning: colors.warning,
  error: colors.error,
  info: colors.info,
};

// ============================================================================
// Panel Rendering
// ============================================================================

/**
 * Create a bordered panel with optional title and footer
 */
export function panel(content: string | string[], options: PanelOptions = {}): string {
  const {
    title,
    footer,
    border = "single",
    variant = "default",
    padding = 1,
    titleAlign = "left",
    footerAlign = "left",
    minWidth = 20,
    maxWidth = 80,
  } = options;

  // Get box characters
  const chars = border === "none" ? null : box[border];
  const color = variantColors[variant];

  // Convert content to lines
  const contentLines = Array.isArray(content) ? content : content.split("\n");

  // Calculate width
  let contentWidth = Math.max(...contentLines.map((line) => visualLength(line)));
  if (title) contentWidth = Math.max(contentWidth, visualLength(title) + 4);
  if (footer) contentWidth = Math.max(contentWidth, visualLength(footer) + 4);

  let width = options.width ?? contentWidth + padding * 2;
  width = Math.max(width, minWidth);
  width = Math.min(width, maxWidth);

  const innerWidth = width - (chars ? 2 : 0);

  // Build output lines
  const output: string[] = [];

  if (chars) {
    // Top border with title
    let topLine = chars.horizontal.repeat(innerWidth);
    if (title) {
      const titleText = ` ${title} `;
      const titleLen = visualLength(titleText);
      if (titleAlign === "center") {
        const pos = Math.floor((innerWidth - titleLen) / 2);
        topLine = chars.horizontal.repeat(pos) + titleText + chars.horizontal.repeat(innerWidth - pos - titleLen);
      } else if (titleAlign === "right") {
        topLine = chars.horizontal.repeat(innerWidth - titleLen - 1) + titleText + chars.horizontal;
      } else {
        topLine = chars.horizontal + titleText + chars.horizontal.repeat(innerWidth - titleLen - 1);
      }
    }
    output.push(color(chars.topLeft + topLine + chars.topRight));

    // Content lines with padding
    for (let i = 0; i < padding; i++) {
      output.push(color(chars.vertical) + " ".repeat(innerWidth) + color(chars.vertical));
    }

    for (const line of contentLines) {
      const paddedLine = padEnd(line, innerWidth - padding * 2);
      output.push(
        color(chars.vertical) +
          " ".repeat(padding) +
          paddedLine +
          " ".repeat(Math.max(0, innerWidth - padding - visualLength(paddedLine))) +
          color(chars.vertical)
      );
    }

    for (let i = 0; i < padding; i++) {
      output.push(color(chars.vertical) + " ".repeat(innerWidth) + color(chars.vertical));
    }

    // Bottom border with footer
    let bottomLine = chars.horizontal.repeat(innerWidth);
    if (footer) {
      const footerText = ` ${footer} `;
      const footerLen = visualLength(footerText);
      if (footerAlign === "center") {
        const pos = Math.floor((innerWidth - footerLen) / 2);
        bottomLine =
          chars.horizontal.repeat(pos) + footerText + chars.horizontal.repeat(innerWidth - pos - footerLen);
      } else if (footerAlign === "right") {
        bottomLine = chars.horizontal.repeat(innerWidth - footerLen - 1) + footerText + chars.horizontal;
      } else {
        bottomLine = chars.horizontal + footerText + chars.horizontal.repeat(innerWidth - footerLen - 1);
      }
    }
    output.push(color(chars.bottomLeft + bottomLine + chars.bottomRight));
  } else {
    // No border, just content with padding
    for (const line of contentLines) {
      output.push(" ".repeat(padding) + line);
    }
  }

  return output.join("\n");
}

/**
 * Create a simple horizontal divider
 */
export function divider(width = 50, style: BorderStyle = "single", variant: PanelVariant = "default"): string {
  const char = style === "none" ? " " : box[style].horizontal;
  const color = variantColors[variant];
  return color(char.repeat(width));
}

/**
 * Create a section header with divider
 */
export function sectionHeader(title: string, width = 50, variant: PanelVariant = "default"): string {
  const color = variantColors[variant];
  const titleLine = color(colors.textBright(title));
  const dividerLine = divider(width, "single", variant);
  return `${titleLine}\n${dividerLine}`;
}

/**
 * Create a card with content (shorthand for common panel usage)
 */
export function card(
  title: string,
  content: string | string[],
  options: Omit<PanelOptions, "title"> = {}
): string {
  return panel(content, { title, border: "double", variant: "primary", ...options });
}

/**
 * Create an info box
 */
export function infoBox(content: string | string[], title = "INFO"): string {
  return panel(content, { title, border: "single", variant: "info", padding: 1 });
}

/**
 * Create a warning box
 */
export function warningBox(content: string | string[], title = "WARNING"): string {
  return panel(content, { title, border: "double", variant: "warning", padding: 1 });
}

/**
 * Create an error box
 */
export function errorBox(content: string | string[], title = "ERROR"): string {
  return panel(content, { title, border: "double", variant: "error", padding: 1 });
}

/**
 * Create a success box
 */
export function successBox(content: string | string[], title = "SUCCESS"): string {
  return panel(content, { title, border: "double", variant: "success", padding: 1 });
}

// ============================================================================
// Multi-Panel Layouts
// ============================================================================

/**
 * Create side-by-side panels
 */
export function sideBySide(
  leftContent: string,
  rightContent: string,
  options: { gap?: number; totalWidth?: number } = {}
): string {
  const { gap = 2, totalWidth = 80 } = options;

  const leftLines = leftContent.split("\n");
  const rightLines = rightContent.split("\n");

  const leftWidth = Math.max(...leftLines.map(visualLength));
  const rightWidth = Math.max(...rightLines.map(visualLength));

  const maxLines = Math.max(leftLines.length, rightLines.length);
  const output: string[] = [];

  for (let i = 0; i < maxLines; i++) {
    const left = padEnd(leftLines[i] || "", leftWidth);
    const right = rightLines[i] || "";
    output.push(left + " ".repeat(gap) + right);
  }

  return output.join("\n");
}

/**
 * Create a grid of panels
 */
export function grid(
  panels: string[],
  options: { columns?: number; gap?: number; cellWidth?: number } = {}
): string {
  const { columns = 2, gap = 2, cellWidth = 38 } = options;

  const rows: string[][] = [];
  for (let i = 0; i < panels.length; i += columns) {
    rows.push(panels.slice(i, i + columns));
  }

  const output: string[] = [];

  for (const row of rows) {
    const panelLines = row.map((p) => p.split("\n"));
    const maxLines = Math.max(...panelLines.map((l) => l.length));

    for (let lineIdx = 0; lineIdx < maxLines; lineIdx++) {
      const lineParts: string[] = [];
      for (let colIdx = 0; colIdx < columns; colIdx++) {
        const lines = panelLines[colIdx] || [];
        const line = lines[lineIdx] || "";
        lineParts.push(padEnd(line, cellWidth));
      }
      output.push(lineParts.join(" ".repeat(gap)));
    }
  }

  return output.join("\n");
}
