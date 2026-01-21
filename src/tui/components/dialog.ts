/**
 * Dialog Component - Modal dialogs and alerts
 *
 * Centered overlay dialogs for confirmations, alerts, and user input
 */

import * as readline from "readline";
import { box, colors, icons, padEnd, padCenter, visualLength, wrapText, style } from "./theme.js";

// ============================================================================
// Types
// ============================================================================

export type DialogVariant = "default" | "info" | "success" | "warning" | "error";

export interface DialogOptions {
  /** Dialog title */
  title: string;
  /** Dialog message/content */
  message: string | string[];
  /** Dialog variant (affects colors) */
  variant?: DialogVariant;
  /** Dialog width */
  width?: number;
  /** Buttons */
  buttons?: Array<{ key: string; label: string; primary?: boolean }>;
  /** Border style */
  border?: "single" | "double";
}

export interface AlertOptions {
  /** Alert title */
  title?: string;
  /** Alert message */
  message: string;
  /** Alert variant */
  variant?: DialogVariant;
  /** Auto-dismiss after ms */
  timeout?: number;
}

export interface ConfirmOptions {
  /** Confirm title */
  title: string;
  /** Confirm message */
  message: string;
  /** Confirm button label */
  confirmLabel?: string;
  /** Cancel button label */
  cancelLabel?: string;
  /** Variant */
  variant?: DialogVariant;
}

// ============================================================================
// Variant Styling
// ============================================================================

const variantConfig: Record<
  DialogVariant,
  { color: typeof colors.primary; icon: string; borderColor: typeof colors.primary }
> = {
  default: { color: colors.textBright, icon: "", borderColor: colors.textMuted },
  info: { color: colors.info, icon: icons.info, borderColor: colors.info },
  success: { color: colors.success, icon: icons.success, borderColor: colors.success },
  warning: { color: colors.warning, icon: icons.warning, borderColor: colors.warning },
  error: { color: colors.error, icon: icons.error, borderColor: colors.error },
};

// ============================================================================
// Dialog Rendering
// ============================================================================

/**
 * Render a dialog box
 */
export function renderDialog(options: DialogOptions): string {
  const {
    title,
    message,
    variant = "default",
    width = 50,
    buttons = [{ key: "ok", label: "OK", primary: true }],
    border = "double",
  } = options;

  const chars = box[border];
  const config = variantConfig[variant];
  const innerWidth = width - 2;

  const output: string[] = [];

  // Top border with title
  const titleIcon = config.icon ? config.icon + " " : "";
  const titleText = ` ${titleIcon}${title} `;
  const titleLen = visualLength(titleText);
  const leftPad = Math.floor((innerWidth - titleLen) / 2);
  const rightPad = innerWidth - leftPad - titleLen;

  output.push(
    config.borderColor(
      chars.topLeft +
        chars.horizontal.repeat(leftPad) +
        config.color(titleText) +
        chars.horizontal.repeat(rightPad) +
        chars.topRight
    )
  );

  // Empty line
  output.push(config.borderColor(chars.vertical) + " ".repeat(innerWidth) + config.borderColor(chars.vertical));

  // Message content
  const messageLines = Array.isArray(message) ? message : wrapText(message, innerWidth - 4);

  for (const line of messageLines) {
    const paddedLine = padCenter(line, innerWidth);
    output.push(config.borderColor(chars.vertical) + paddedLine + config.borderColor(chars.vertical));
  }

  // Empty line
  output.push(config.borderColor(chars.vertical) + " ".repeat(innerWidth) + config.borderColor(chars.vertical));

  // Buttons
  const buttonStrings = buttons.map((btn) => {
    const btnText = `[ ${btn.label} ]`;
    return btn.primary ? config.color(btnText) : colors.textMuted(btnText);
  });

  const buttonsLine = buttonStrings.join("  ");
  const buttonsPadded = padCenter(buttonsLine, innerWidth);
  output.push(config.borderColor(chars.vertical) + buttonsPadded + config.borderColor(chars.vertical));

  // Empty line
  output.push(config.borderColor(chars.vertical) + " ".repeat(innerWidth) + config.borderColor(chars.vertical));

  // Bottom border
  output.push(
    config.borderColor(chars.bottomLeft + chars.horizontal.repeat(innerWidth) + chars.bottomRight)
  );

  return output.join("\n");
}

/**
 * Display a dialog and wait for user response
 */
export async function dialog(options: DialogOptions): Promise<string> {
  const { buttons = [{ key: "ok", label: "OK", primary: true }] } = options;

  console.log("\n" + renderDialog(options) + "\n");

  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    readline.emitKeypressEvents(process.stdin, rl);

    const cleanup = () => {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      rl.close();
    };

    process.stdin.on("keypress", (str, key) => {
      if (!key) return;

      // Check for Enter (select primary/first button)
      if (key.name === "return") {
        cleanup();
        const primaryBtn = buttons.find((b) => b.primary) || buttons[0];
        resolve(primaryBtn.key);
        return;
      }

      // Check for Escape (cancel)
      if (key.name === "escape") {
        cleanup();
        resolve("cancel");
        return;
      }

      // Check for button shortcuts
      if (str) {
        const matchingBtn = buttons.find(
          (b) => b.label.toLowerCase().startsWith(str.toLowerCase()) || b.key.toLowerCase() === str.toLowerCase()
        );
        if (matchingBtn) {
          cleanup();
          resolve(matchingBtn.key);
        }
      }

      // Ctrl+C
      if (key.ctrl && key.name === "c") {
        cleanup();
        process.exit(0);
      }
    });
  });
}

// ============================================================================
// Alert Dialogs
// ============================================================================

/**
 * Show an info alert
 */
export function alertInfo(message: string, title = "INFO"): string {
  return renderDialog({
    title,
    message,
    variant: "info",
    buttons: [{ key: "ok", label: "OK", primary: true }],
  });
}

/**
 * Show a success alert
 */
export function alertSuccess(message: string, title = "SUCCESS"): string {
  return renderDialog({
    title,
    message,
    variant: "success",
    buttons: [{ key: "ok", label: "OK", primary: true }],
  });
}

/**
 * Show a warning alert
 */
export function alertWarning(message: string, title = "WARNING"): string {
  return renderDialog({
    title,
    message,
    variant: "warning",
    buttons: [{ key: "ok", label: "OK", primary: true }],
  });
}

/**
 * Show an error alert
 */
export function alertError(message: string, title = "ERROR"): string {
  return renderDialog({
    title,
    message,
    variant: "error",
    buttons: [{ key: "ok", label: "OK", primary: true }],
  });
}

/**
 * Show an interactive alert and wait for dismissal
 */
export async function alert(options: AlertOptions): Promise<void> {
  const { title, message, variant = "info", timeout } = options;

  const dialogTitle = title || variant.toUpperCase();

  console.log(
    "\n" +
      renderDialog({
        title: dialogTitle,
        message,
        variant,
        buttons: [{ key: "ok", label: "OK", primary: true }],
      }) +
      "\n"
  );

  if (timeout) {
    await new Promise((resolve) => setTimeout(resolve, timeout));
  } else {
    await dialog({
      title: dialogTitle,
      message,
      variant,
      buttons: [{ key: "ok", label: "OK", primary: true }],
    });
  }
}

// ============================================================================
// Confirm Dialog
// ============================================================================

/**
 * Show a confirmation dialog
 */
export async function confirm(options: ConfirmOptions): Promise<boolean> {
  const {
    title,
    message,
    confirmLabel = "OK",
    cancelLabel = "Cancel",
    variant = "warning",
  } = options;

  const result = await dialog({
    title,
    message,
    variant,
    buttons: [
      { key: "confirm", label: confirmLabel, primary: true },
      { key: "cancel", label: cancelLabel },
    ],
  });

  return result === "confirm";
}

// ============================================================================
// Notification Banners (inline, not modal)
// ============================================================================

/**
 * Render a notification banner (inline alert)
 */
export function banner(
  message: string,
  variant: DialogVariant = "info",
  options: { width?: number; dismissible?: boolean } = {}
): string {
  const { width = 70, dismissible = true } = options;
  const config = variantConfig[variant];
  const chars = box.single;

  const icon = config.icon ? config.icon + " " : "";
  const dismiss = dismissible ? ` ${colors.textMuted("[×]")}` : "";
  const dismissLen = dismissible ? 4 : 0;

  const contentWidth = width - 4 - dismissLen;
  const content = padEnd(`${icon}${message}`, contentWidth);

  return config.borderColor(
    chars.topLeft +
      chars.horizontal.repeat(width - 2) +
      chars.topRight +
      "\n" +
      chars.vertical +
      " " +
      config.color(content) +
      dismiss +
      " " +
      chars.vertical +
      "\n" +
      chars.bottomLeft +
      chars.horizontal.repeat(width - 2) +
      chars.bottomRight
  );
}

/**
 * Render a toast notification (compact inline alert)
 */
export function toast(message: string, variant: DialogVariant = "info"): string {
  const config = variantConfig[variant];
  const icon = config.icon ? config.icon + " " : "";
  return config.color(`${icon}${message}`);
}
