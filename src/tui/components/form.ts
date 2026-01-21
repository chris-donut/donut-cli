/**
 * Form Components - Visual form inputs inspired by SRCL
 *
 * Text inputs, checkboxes, radio buttons, and select dropdowns
 */

import * as readline from "readline";
import { box, colors, icons, padEnd, visualLength, style } from "./theme.js";

// ============================================================================
// Types
// ============================================================================

export interface TextInputOptions {
  /** Input label */
  label: string;
  /** Default value */
  defaultValue?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Input width */
  width?: number;
  /** Password mode (hide input) */
  password?: boolean;
  /** Validation function */
  validate?: (value: string) => string | null;
  /** Help text */
  help?: string;
}

export interface CheckboxOption {
  /** Unique key */
  key: string;
  /** Display label */
  label: string;
  /** Whether checked by default */
  checked?: boolean;
  /** Whether disabled */
  disabled?: boolean;
}

export interface RadioOption {
  /** Unique value */
  value: string;
  /** Display label */
  label: string;
  /** Whether disabled */
  disabled?: boolean;
}

export interface SelectOption {
  /** Unique value */
  value: string;
  /** Display label */
  label: string;
  /** Whether disabled */
  disabled?: boolean;
}

// ============================================================================
// Text Input
// ============================================================================

/**
 * Render a text input field (static display)
 */
export function renderTextInput(
  value: string,
  options: TextInputOptions,
  focused = false,
  error?: string
): string {
  const { label, placeholder, width = 30, password } = options;

  const displayValue = password ? "•".repeat(value.length) : value;
  const displayText = displayValue || placeholder || "";

  const inputContent = focused
    ? displayText + colors.primary("_")
    : displayText;

  const inputBox = `[${padEnd(inputContent, width - 2)}]`;

  const output: string[] = [];

  output.push(style.label(label.toUpperCase()));
  output.push(focused ? colors.primary(inputBox) : colors.textMuted(inputBox));

  if (error) {
    output.push(colors.error(`${icons.error} ${error}`));
  } else if (options.help) {
    output.push(colors.textMuted(options.help));
  }

  return output.join("\n");
}

/**
 * Interactive text input
 */
export async function textInput(options: TextInputOptions): Promise<string> {
  const { defaultValue = "", validate } = options;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    // Display label
    console.log(renderTextInput(defaultValue, options, true));

    const promptText = colors.primary("> ");

    rl.question(promptText, (answer) => {
      const value = answer || defaultValue;

      if (validate) {
        const error = validate(value);
        if (error) {
          console.log(colors.error(`${icons.error} ${error}`));
          rl.close();
          // Retry
          resolve(textInput(options));
          return;
        }
      }

      rl.close();
      resolve(value);
    });
  });
}

/**
 * Confirm prompt (yes/no)
 */
export async function confirm(message: string, defaultYes = true): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const hint = defaultYes ? "[Y/n]" : "[y/N]";
  const prompt = `${message} ${colors.textMuted(hint)} `;

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      const normalized = answer.toLowerCase().trim();
      if (normalized === "") {
        resolve(defaultYes);
      } else {
        resolve(normalized === "y" || normalized === "yes");
      }
    });
  });
}

// ============================================================================
// Checkbox
// ============================================================================

/**
 * Render checkbox list (static display)
 */
export function renderCheckboxes(
  options: CheckboxOption[],
  title?: string,
  focusedIndex?: number
): string {
  const output: string[] = [];

  if (title) {
    output.push(style.label(title.toUpperCase()));
    output.push("");
  }

  options.forEach((opt, idx) => {
    const checkbox = opt.checked ? icons.checkboxChecked : icons.checkbox;
    const focused = idx === focusedIndex;
    const disabled = opt.disabled;

    let line = `  ${checkbox} ${opt.label}`;

    if (focused) {
      line = colors.highlight(line);
    } else if (disabled) {
      line = colors.textDim(line);
    } else if (opt.checked) {
      line = colors.success(line);
    }

    output.push(line);
  });

  return output.join("\n");
}

/**
 * Interactive checkbox selection
 */
export async function checkboxes(
  options: CheckboxOption[],
  title?: string
): Promise<Record<string, boolean>> {
  // Clone options to track state
  const state = options.map((opt) => ({ ...opt, checked: opt.checked ?? false }));
  let focusedIndex = 0;

  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    readline.emitKeypressEvents(process.stdin, rl);

    const render = () => {
      const lines = renderCheckboxes(state, title, focusedIndex).split("\n").length;
      process.stdout.write(`\x1B[${lines}A\x1B[J`);
      console.log(renderCheckboxes(state, title, focusedIndex));
    };

    // Initial render
    console.log(renderCheckboxes(state, title, focusedIndex));
    console.log(colors.textMuted("\n↑/↓: Navigate  Space: Toggle  Enter: Confirm"));

    const cleanup = () => {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      rl.close();
    };

    process.stdin.on("keypress", (str, key) => {
      if (!key) return;

      if (key.name === "up" || key.name === "k") {
        if (focusedIndex > 0) {
          focusedIndex--;
          render();
        }
      } else if (key.name === "down" || key.name === "j") {
        if (focusedIndex < state.length - 1) {
          focusedIndex++;
          render();
        }
      } else if (key.name === "space") {
        if (!state[focusedIndex].disabled) {
          state[focusedIndex].checked = !state[focusedIndex].checked;
          render();
        }
      } else if (key.name === "return") {
        cleanup();
        const result: Record<string, boolean> = {};
        for (const opt of state) {
          result[opt.key] = opt.checked;
        }
        resolve(result);
      } else if (key.name === "escape" || (key.ctrl && key.name === "c")) {
        cleanup();
        process.exit(0);
      }
    });
  });
}

// ============================================================================
// Radio Buttons
// ============================================================================

/**
 * Render radio button list (static display)
 */
export function renderRadios(
  options: RadioOption[],
  selectedValue: string | null,
  title?: string,
  focusedIndex?: number
): string {
  const output: string[] = [];

  if (title) {
    output.push(style.label(title.toUpperCase()));
    output.push("");
  }

  options.forEach((opt, idx) => {
    const isSelected = opt.value === selectedValue;
    const radio = isSelected ? icons.radioSelected : icons.radio;
    const focused = idx === focusedIndex;
    const disabled = opt.disabled;

    let line = `  ${radio} ${opt.label}`;

    if (focused) {
      line = colors.highlight(line);
    } else if (disabled) {
      line = colors.textDim(line);
    } else if (isSelected) {
      line = colors.primary(line);
    }

    output.push(line);
  });

  return output.join("\n");
}

/**
 * Interactive radio button selection
 */
export async function radio(
  options: RadioOption[],
  title?: string,
  defaultValue?: string
): Promise<string> {
  let selectedValue = defaultValue || null;
  let focusedIndex = options.findIndex((opt) => opt.value === selectedValue);
  if (focusedIndex === -1) focusedIndex = 0;

  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    readline.emitKeypressEvents(process.stdin, rl);

    const render = () => {
      const lines = renderRadios(options, selectedValue, title, focusedIndex).split("\n").length;
      process.stdout.write(`\x1B[${lines}A\x1B[J`);
      console.log(renderRadios(options, selectedValue, title, focusedIndex));
    };

    // Initial render
    console.log(renderRadios(options, selectedValue, title, focusedIndex));
    console.log(colors.textMuted("\n↑/↓: Navigate  Enter: Select"));

    const cleanup = () => {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      rl.close();
    };

    process.stdin.on("keypress", (str, key) => {
      if (!key) return;

      if (key.name === "up" || key.name === "k") {
        if (focusedIndex > 0) {
          focusedIndex--;
          render();
        }
      } else if (key.name === "down" || key.name === "j") {
        if (focusedIndex < options.length - 1) {
          focusedIndex++;
          render();
        }
      } else if (key.name === "return" || key.name === "space") {
        const opt = options[focusedIndex];
        if (!opt.disabled) {
          selectedValue = opt.value;
          cleanup();
          resolve(selectedValue);
        }
      } else if (key.name === "escape" || (key.ctrl && key.name === "c")) {
        cleanup();
        process.exit(0);
      }
    });
  });
}

// ============================================================================
// Select Dropdown
// ============================================================================

/**
 * Render select dropdown (static display)
 */
export function renderSelect(
  options: SelectOption[],
  selectedValue: string | null,
  label: string,
  isOpen = false,
  focusedIndex?: number
): string {
  const output: string[] = [];

  output.push(style.label(label.toUpperCase()));

  const selectedOption = options.find((opt) => opt.value === selectedValue);
  const displayText = selectedOption?.label || "Select...";
  const arrow = isOpen ? "▲" : "▼";

  const selectBox = `[${displayText} ${arrow}]`;
  output.push(isOpen ? colors.primary(selectBox) : colors.textMuted(selectBox));

  if (isOpen) {
    output.push("");
    options.forEach((opt, idx) => {
      const isSelected = opt.value === selectedValue;
      const focused = idx === focusedIndex;

      let line = `  ${isSelected ? icons.pointer : " "} ${opt.label}`;

      if (focused) {
        line = colors.highlight(line);
      } else if (opt.disabled) {
        line = colors.textDim(line);
      }

      output.push(line);
    });
  }

  return output.join("\n");
}

/**
 * Interactive select dropdown
 */
export async function select(
  options: SelectOption[],
  label: string,
  defaultValue?: string
): Promise<string> {
  let selectedValue = defaultValue || null;
  let focusedIndex = options.findIndex((opt) => opt.value === selectedValue);
  if (focusedIndex === -1) focusedIndex = 0;

  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    readline.emitKeypressEvents(process.stdin, rl);

    const render = () => {
      const lines = renderSelect(options, selectedValue, label, true, focusedIndex).split("\n").length;
      process.stdout.write(`\x1B[${lines}A\x1B[J`);
      console.log(renderSelect(options, selectedValue, label, true, focusedIndex));
    };

    // Initial render (open state)
    console.log(renderSelect(options, selectedValue, label, true, focusedIndex));

    const cleanup = () => {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      rl.close();
    };

    process.stdin.on("keypress", (str, key) => {
      if (!key) return;

      if (key.name === "up" || key.name === "k") {
        if (focusedIndex > 0) {
          focusedIndex--;
          render();
        }
      } else if (key.name === "down" || key.name === "j") {
        if (focusedIndex < options.length - 1) {
          focusedIndex++;
          render();
        }
      } else if (key.name === "return") {
        const opt = options[focusedIndex];
        if (!opt.disabled) {
          selectedValue = opt.value;
          cleanup();
          resolve(selectedValue);
        }
      } else if (key.name === "escape" || (key.ctrl && key.name === "c")) {
        cleanup();
        process.exit(0);
      }
    });
  });
}

// ============================================================================
// Form Builder
// ============================================================================

export interface FormField {
  type: "text" | "password" | "checkbox" | "radio" | "select";
  name: string;
  label: string;
  options?: Array<{ value: string; label: string }>;
  defaultValue?: unknown;
  required?: boolean;
  validate?: (value: unknown) => string | null;
  help?: string;
}

export interface FormOptions {
  title?: string;
  fields: FormField[];
  submitLabel?: string;
  cancelLabel?: string;
}

/**
 * Render a complete form (static display)
 */
export function renderForm(
  options: FormOptions,
  values: Record<string, unknown>,
  focusedField?: number,
  errors?: Record<string, string>
): string {
  const { title, fields } = options;
  const chars = box.double;
  const width = 60;
  const innerWidth = width - 2;

  const output: string[] = [];

  // Top border with title
  if (title) {
    const titleText = ` ${title} `;
    const titleLen = visualLength(titleText);
    const leftPad = Math.floor((innerWidth - titleLen) / 2);
    const rightPad = innerWidth - leftPad - titleLen;
    output.push(
      colors.primary(
        chars.topLeft +
          chars.horizontal.repeat(leftPad) +
          titleText +
          chars.horizontal.repeat(rightPad) +
          chars.topRight
      )
    );
  } else {
    output.push(colors.primary(chars.topLeft + chars.horizontal.repeat(innerWidth) + chars.topRight));
  }

  // Empty line
  output.push(colors.primary(chars.vertical) + " ".repeat(innerWidth) + colors.primary(chars.vertical));

  // Fields
  fields.forEach((field, idx) => {
    const value = values[field.name];
    const isFocused = idx === focusedField;
    const error = errors?.[field.name];

    // Label
    let labelLine = `  ${style.label(field.label.toUpperCase())}`;
    if (field.required) labelLine += colors.error(" *");
    labelLine = padEnd(labelLine, innerWidth);
    output.push(colors.primary(chars.vertical) + labelLine + colors.primary(chars.vertical));

    // Field display based on type
    let fieldLine = "";
    switch (field.type) {
      case "text":
      case "password": {
        const displayValue =
          field.type === "password" ? "•".repeat(String(value || "").length) : String(value || "");
        const cursor = isFocused ? colors.primary("_") : "";
        fieldLine = `  [${padEnd(displayValue + cursor, 40)}]`;
        break;
      }
      case "checkbox": {
        const checked = Boolean(value);
        const checkbox = checked ? icons.checkboxChecked : icons.checkbox;
        fieldLine = `  ${checkbox} Enabled`;
        break;
      }
      case "radio":
      case "select": {
        const selectedOpt = field.options?.find((o) => o.value === value);
        fieldLine = `  [${selectedOpt?.label || "Select..."} ▼]`;
        break;
      }
    }

    if (isFocused) {
      fieldLine = colors.primary(fieldLine);
    }
    fieldLine = padEnd(fieldLine, innerWidth);
    output.push(colors.primary(chars.vertical) + fieldLine + colors.primary(chars.vertical));

    // Error or help
    if (error) {
      const errorLine = padEnd(`  ${colors.error(icons.error + " " + error)}`, innerWidth);
      output.push(colors.primary(chars.vertical) + errorLine + colors.primary(chars.vertical));
    } else if (field.help && isFocused) {
      const helpLine = padEnd(`  ${colors.textMuted(field.help)}`, innerWidth);
      output.push(colors.primary(chars.vertical) + helpLine + colors.primary(chars.vertical));
    }

    // Spacing
    output.push(colors.primary(chars.vertical) + " ".repeat(innerWidth) + colors.primary(chars.vertical));
  });

  // Bottom border
  output.push(colors.primary(chars.bottomLeft + chars.horizontal.repeat(innerWidth) + chars.bottomRight));

  return output.join("\n");
}
