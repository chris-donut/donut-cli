/**
 * Progress Components - SRCL-inspired progress bars and loaders
 *
 * Various styles of progress indicators, spinners, and loading states
 */

import { blocks, spinners, colors, icons, padEnd, visualLength } from "./theme.js";

// ============================================================================
// Types
// ============================================================================

export type ProgressStyle = "bar" | "blocks" | "braille" | "ascii" | "dots" | "custom";

export interface ProgressBarOptions {
  /** Current progress (0-100 or 0-1) */
  value: number;
  /** Total value (for calculating percentage) */
  total?: number;
  /** Bar width in characters */
  width?: number;
  /** Progress bar style */
  style?: ProgressStyle;
  /** Show percentage text */
  showPercent?: boolean;
  /** Show value text */
  showValue?: boolean;
  /** Label text */
  label?: string;
  /** Custom fill character */
  fillChar?: string;
  /** Custom empty character */
  emptyChar?: string;
  /** Color variant */
  variant?: "default" | "success" | "warning" | "error" | "info" | "primary";
}

export interface SpinnerOptions {
  /** Spinner style */
  style?: keyof typeof spinners;
  /** Text to display after spinner */
  text?: string;
  /** Color variant */
  variant?: "default" | "primary" | "info";
}

// ============================================================================
// Progress Bar
// ============================================================================

const variantColors = {
  default: colors.textBright,
  success: colors.success,
  warning: colors.warning,
  error: colors.error,
  info: colors.info,
  primary: colors.primary,
};

/**
 * Create a progress bar
 */
export function progressBar(options: ProgressBarOptions): string {
  const {
    value,
    total = 100,
    width = 20,
    style = "bar",
    showPercent = true,
    showValue = false,
    label,
    fillChar,
    emptyChar,
    variant = "default",
  } = options;

  // Calculate percentage
  const percent = total > 0 ? Math.min(100, Math.max(0, (value / total) * 100)) : 0;
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;

  // Get fill and empty characters based on style
  let fill: string;
  let emptyFill: string;

  switch (style) {
    case "blocks":
      fill = fillChar || blocks.full;
      emptyFill = emptyChar || blocks.quarter;
      break;
    case "braille":
      fill = fillChar || "⣿";
      emptyFill = emptyChar || "⣀";
      break;
    case "ascii":
      fill = fillChar || "#";
      emptyFill = emptyChar || "-";
      break;
    case "dots":
      fill = fillChar || "●";
      emptyFill = emptyChar || "○";
      break;
    case "custom":
      fill = fillChar || "█";
      emptyFill = emptyChar || "░";
      break;
    default:
      fill = fillChar || "█";
      emptyFill = emptyChar || "░";
  }

  const color = variantColors[variant];

  // Build progress bar
  const bar = color(fill.repeat(filled)) + colors.textMuted(emptyFill.repeat(empty));

  // Build output parts
  const parts: string[] = [];

  if (label) {
    parts.push(label);
  }

  parts.push(`[${bar}]`);

  if (showPercent) {
    parts.push(colors.textMuted(`${Math.round(percent)}%`));
  }

  if (showValue) {
    parts.push(colors.textMuted(`(${value}/${total})`));
  }

  return parts.join(" ");
}

/**
 * Create a mini progress indicator (no bar, just percentage)
 */
export function miniProgress(value: number, total = 100): string {
  const percent = total > 0 ? Math.min(100, Math.max(0, (value / total) * 100)) : 0;
  const color = percent >= 100 ? colors.success : percent >= 50 ? colors.warning : colors.error;
  return color(`${Math.round(percent)}%`);
}

/**
 * Create a step progress indicator
 */
export function stepProgress(
  current: number,
  total: number,
  options: { showLabels?: boolean; labels?: string[] } = {}
): string {
  const { showLabels = false, labels = [] } = options;

  const steps: string[] = [];

  for (let i = 0; i < total; i++) {
    if (i < current) {
      steps.push(colors.success(icons.radioSelected));
    } else if (i === current) {
      steps.push(colors.primary(icons.radioSelected));
    } else {
      steps.push(colors.textMuted(icons.radio));
    }
  }

  let output = steps.join(" ");

  if (showLabels && labels.length > 0) {
    output += "\n";
    const labelParts: string[] = [];
    for (let i = 0; i < total; i++) {
      const label = labels[i] || `Step ${i + 1}`;
      const color = i < current ? colors.success : i === current ? colors.primary : colors.textMuted;
      labelParts.push(color(label));
    }
    output += labelParts.join("   ");
  }

  return output;
}

/**
 * Create a multi-stage pipeline progress
 */
export function pipelineProgress(
  stages: Array<{ name: string; progress: number; status?: "pending" | "active" | "done" | "error" }>
): string {
  const stageWidth = 10;
  const output: string[] = [];

  // Progress bars
  const bars = stages.map((stage) => {
    const filled = Math.round((stage.progress / 100) * stageWidth);
    const empty = stageWidth - filled;

    let color = colors.textMuted;
    if (stage.status === "done") color = colors.success;
    else if (stage.status === "active") color = colors.primary;
    else if (stage.status === "error") color = colors.error;

    return `[${color(blocks.full.repeat(filled))}${colors.textDim(blocks.quarter.repeat(empty))}]`;
  });

  output.push(bars.join(" → "));

  // Labels
  const labels = stages.map((stage) => {
    let color = colors.textMuted;
    if (stage.status === "done") color = colors.success;
    else if (stage.status === "active") color = colors.primary;
    else if (stage.status === "error") color = colors.error;

    return padEnd(color(stage.name), stageWidth + 2);
  });

  output.push(labels.join("   "));

  return output.join("\n");
}

// ============================================================================
// Spinners / Loaders
// ============================================================================

/**
 * Get spinner frame for animation
 */
export function spinnerFrame(style: keyof typeof spinners = "dots", frameIndex: number): string {
  const frames = spinners[style];
  return frames[frameIndex % frames.length];
}

/**
 * Create a spinner instance for animation
 */
export function createSpinner(options: SpinnerOptions = {}) {
  const { style = "dots", text = "Loading...", variant = "primary" } = options;
  const frames = spinners[style];
  const color = variant === "info" ? colors.info : variant === "primary" ? colors.primary : colors.text;

  let frameIndex = 0;
  let interval: NodeJS.Timeout | null = null;

  return {
    /** Start the spinner animation */
    start() {
      interval = setInterval(() => {
        const frame = frames[frameIndex % frames.length];
        process.stdout.write(`\r${color(frame)} ${text}`);
        frameIndex++;
      }, 80);
    },

    /** Update spinner text */
    update(newText: string) {
      if (interval) {
        process.stdout.write(`\r\x1B[K`);
      }
    },

    /** Stop with success message */
    success(message?: string) {
      if (interval) clearInterval(interval);
      process.stdout.write(`\r\x1B[K`);
      console.log(`${colors.success(icons.success)} ${message || text}`);
    },

    /** Stop with error message */
    error(message?: string) {
      if (interval) clearInterval(interval);
      process.stdout.write(`\r\x1B[K`);
      console.log(`${colors.error(icons.error)} ${message || text}`);
    },

    /** Stop without message */
    stop() {
      if (interval) clearInterval(interval);
      process.stdout.write(`\r\x1B[K`);
    },
  };
}

/**
 * Block loader characters (SRCL-style)
 */
export const blockLoaders = {
  braille: ["⡀", "⢀", "⠄", "⢂", "⢁", "⡁", "⡈", "⡐", "⡠", "⣀", "⣁", "⢿"],
  blocks: ["▖", "▘", "▝", "▗"],
  quadrant: ["◰", "◳", "◲", "◱"],
  circle: ["◐", "◓", "◑", "◒"],
  arrow: ["←", "↖", "↑", "↗", "→", "↘", "↓", "↙"],
  box: ["┤", "┘", "┴", "└", "├", "┌", "┬", "┐"],
};

/**
 * Render a single block loader character
 */
export function blockLoader(style: keyof typeof blockLoaders = "braille", frameIndex: number): string {
  const frames = blockLoaders[style];
  return colors.primary(frames[frameIndex % frames.length]);
}

// ============================================================================
// Visual Indicators
// ============================================================================

/**
 * Confidence indicator (visual bar)
 */
export function confidenceIndicator(value: number, width = 10): string {
  const percent = Math.min(100, Math.max(0, value * 100));
  const filled = Math.round((percent / 100) * width);

  let color = colors.error;
  if (percent >= 70) color = colors.success;
  else if (percent >= 40) color = colors.warning;

  const bar = color(blocks.full.repeat(filled)) + colors.textMuted(blocks.quarter.repeat(width - filled));

  return `${bar} ${color(`${percent.toFixed(0)}%`)}`;
}

/**
 * Sparkline chart (mini line chart)
 */
export function sparkline(values: number[], width?: number): string {
  if (values.length === 0) return "";

  const targetWidth = width || values.length;
  const step = values.length / targetWidth;

  // Resample if needed
  const resampled: number[] = [];
  for (let i = 0; i < targetWidth; i++) {
    const idx = Math.floor(i * step);
    resampled.push(values[Math.min(idx, values.length - 1)]);
  }

  const min = Math.min(...resampled);
  const max = Math.max(...resampled);
  const range = max - min || 1;

  const chars = blocks.bottom;

  return resampled
    .map((v) => {
      const normalized = (v - min) / range;
      const charIdx = Math.floor(normalized * (chars.length - 1));
      return chars[charIdx];
    })
    .join("");
}

/**
 * Percentage bar with color gradient
 */
export function percentageBar(value: number, width = 20): string {
  const percent = Math.min(100, Math.max(0, value));
  const filled = Math.round((percent / 100) * width);

  let color = colors.error;
  if (percent >= 80) color = colors.success;
  else if (percent >= 50) color = colors.warning;
  else if (percent >= 25) color = colors.warningBright;

  return (
    color(blocks.full.repeat(filled)) +
    colors.textMuted(blocks.quarter.repeat(width - filled)) +
    " " +
    color(`${percent.toFixed(1)}%`)
  );
}
