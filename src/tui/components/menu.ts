/**
 * Menu Component - Interactive menus with keyboard navigation
 *
 * Arrow-key navigable menus with visual selection highlighting
 */

import * as readline from "readline";
import { box, colors, icons, padEnd, visualLength, style } from "./theme.js";

// ============================================================================
// Types
// ============================================================================

export interface MenuItem {
  /** Unique key for this item */
  key: string;
  /** Display label */
  label: string;
  /** Optional description */
  description?: string;
  /** Keyboard shortcut */
  shortcut?: string;
  /** Whether item is disabled */
  disabled?: boolean;
  /** Whether this is a separator */
  separator?: boolean;
  /** Custom icon */
  icon?: string;
  /** Submenu items */
  submenu?: MenuItem[];
}

export interface MenuOptions {
  /** Menu title */
  title?: string;
  /** Menu items */
  items: MenuItem[];
  /** Initially selected index */
  selectedIndex?: number;
  /** Border style */
  border?: "single" | "double" | "rounded" | "none";
  /** Show item descriptions */
  showDescriptions?: boolean;
  /** Width (auto if not specified) */
  width?: number;
  /** Maximum visible items (scrollable) */
  maxVisible?: number;
  /** Allow cancel with Escape */
  allowCancel?: boolean;
}

export interface MenuResult {
  /** Selected item key (null if cancelled) */
  key: string | null;
  /** Selected item index */
  index: number;
  /** Whether user cancelled */
  cancelled: boolean;
}

// ============================================================================
// Menu Rendering
// ============================================================================

/**
 * Render menu to string (static, for display)
 */
export function renderMenu(options: MenuOptions, selectedIndex = 0): string {
  const {
    title,
    items,
    border = "single",
    showDescriptions = true,
    width: customWidth,
  } = options;

  const chars = border === "none" ? null : box[border];

  // Calculate width
  let width = customWidth || 40;
  for (const item of items) {
    if (item.separator) continue;
    let itemWidth = visualLength(item.label) + 4; // padding + pointer
    if (item.shortcut) itemWidth += visualLength(item.shortcut) + 2;
    if (item.icon) itemWidth += 2;
    width = Math.max(width, itemWidth);
  }
  width += 4; // border padding

  const innerWidth = width - (chars ? 2 : 0);
  const output: string[] = [];

  // Top border with title
  if (chars) {
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
  }

  // Menu items
  items.forEach((item, idx) => {
    if (item.separator) {
      // Separator line
      if (chars) {
        output.push(
          colors.textMuted(chars.teeLeft + chars.horizontal.repeat(innerWidth) + chars.teeRight)
        );
      } else {
        output.push(colors.textMuted("─".repeat(innerWidth)));
      }
      return;
    }

    const isSelected = idx === selectedIndex;
    const isDisabled = item.disabled;

    // Build item line
    const pointer = isSelected ? icons.pointer : " ";
    const icon = item.icon ? item.icon + " " : "";
    const label = icon + item.label;
    const shortcut = item.shortcut ? colors.textMuted(`[${item.shortcut}]`) : "";

    let itemLine = ` ${pointer} ${label}`;
    if (shortcut) {
      const spacer = innerWidth - visualLength(itemLine) - visualLength(shortcut) - 2;
      itemLine += " ".repeat(Math.max(1, spacer)) + shortcut + " ";
    } else {
      itemLine = padEnd(itemLine, innerWidth);
    }

    // Apply colors
    if (isSelected) {
      itemLine = colors.highlight(itemLine);
    } else if (isDisabled) {
      itemLine = colors.textDim(itemLine);
    }

    if (chars) {
      output.push(colors.primary(chars.vertical) + itemLine + colors.primary(chars.vertical));
    } else {
      output.push(itemLine);
    }

    // Description line
    if (showDescriptions && item.description && isSelected) {
      const descLine = padEnd(`     ${colors.textMuted(item.description)}`, innerWidth);
      if (chars) {
        output.push(colors.primary(chars.vertical) + descLine + colors.primary(chars.vertical));
      } else {
        output.push(descLine);
      }
    }
  });

  // Bottom border
  if (chars) {
    output.push(colors.primary(chars.bottomLeft + chars.horizontal.repeat(innerWidth) + chars.bottomRight));
  }

  return output.join("\n");
}

/**
 * Interactive menu with keyboard navigation
 */
export async function menu(options: MenuOptions): Promise<MenuResult> {
  const { items, selectedIndex: initialIndex = 0, allowCancel = true, maxVisible } = options;

  // Filter out separators for selection
  const selectableIndices = items
    .map((item, idx) => ({ item, idx }))
    .filter(({ item }) => !item.separator && !item.disabled)
    .map(({ idx }) => idx);

  if (selectableIndices.length === 0) {
    return { key: null, index: -1, cancelled: true };
  }

  let selectedIndex = selectableIndices.includes(initialIndex)
    ? initialIndex
    : selectableIndices[0];

  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // Enable raw mode for keypress detection
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    readline.emitKeypressEvents(process.stdin, rl);

    const render = () => {
      // Clear previous output
      const lines = renderMenu(options, selectedIndex).split("\n").length;
      process.stdout.write(`\x1B[${lines}A\x1B[J`);
      console.log(renderMenu(options, selectedIndex));
    };

    // Initial render
    console.log(renderMenu(options, selectedIndex));

    const cleanup = () => {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      rl.close();
    };

    process.stdin.on("keypress", (str, key) => {
      if (!key) return;

      if (key.name === "up" || key.name === "k") {
        // Move up
        const currentSelectableIdx = selectableIndices.indexOf(selectedIndex);
        if (currentSelectableIdx > 0) {
          selectedIndex = selectableIndices[currentSelectableIdx - 1];
          render();
        }
      } else if (key.name === "down" || key.name === "j") {
        // Move down
        const currentSelectableIdx = selectableIndices.indexOf(selectedIndex);
        if (currentSelectableIdx < selectableIndices.length - 1) {
          selectedIndex = selectableIndices[currentSelectableIdx + 1];
          render();
        }
      } else if (key.name === "return") {
        // Select
        cleanup();
        const selectedItem = items[selectedIndex];
        resolve({
          key: selectedItem.key,
          index: selectedIndex,
          cancelled: false,
        });
      } else if (key.name === "escape" || (key.ctrl && key.name === "c")) {
        // Cancel
        cleanup();
        if (allowCancel) {
          resolve({ key: null, index: -1, cancelled: true });
        } else {
          process.exit(0);
        }
      } else if (str) {
        // Check for shortcut
        const matchingItem = items.find(
          (item) =>
            !item.separator &&
            !item.disabled &&
            item.shortcut?.toLowerCase() === str.toLowerCase()
        );
        if (matchingItem) {
          cleanup();
          resolve({
            key: matchingItem.key,
            index: items.indexOf(matchingItem),
            cancelled: false,
          });
        }
      }
    });
  });
}

/**
 * Quick select menu (single keypress selection)
 */
export function quickMenu(
  title: string,
  items: Array<{ key: string; label: string; shortcut: string }>
): string {
  const output: string[] = [];

  output.push(style.h2(title));
  output.push("");

  for (const item of items) {
    output.push(`  ${colors.primary(`[${item.shortcut}]`)} ${item.label}`);
  }

  return output.join("\n");
}

/**
 * Breadcrumb navigation display
 */
export function breadcrumb(items: string[], separator = " ❯ "): string {
  return items
    .map((item, idx) =>
      idx === items.length - 1 ? colors.textBright(item) : colors.textMuted(item)
    )
    .join(colors.textMuted(separator));
}

/**
 * Action bar (top/bottom status bar)
 */
export function actionBar(
  items: Array<{ key: string; label: string }>,
  options: { width?: number; position?: "top" | "bottom" } = {}
): string {
  const { width = 80 } = options;

  const itemStrings = items.map(
    (item) => `${colors.primary(item.key)}:${colors.textMuted(item.label)}`
  );

  const totalLen = itemStrings.reduce((acc, s) => acc + visualLength(s), 0);
  const gaps = Math.max(1, Math.floor((width - totalLen) / (items.length - 1 || 1)));

  return itemStrings.join(" ".repeat(gaps));
}
