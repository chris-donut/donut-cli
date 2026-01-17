#!/usr/bin/env node
/**
 * Post-install script - Shows helpful guidance after npm/bun install
 */

import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, "..");

// Colors (simple ANSI codes, no chalk dependency)
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const gray = (s) => `\x1b[90m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

const envExists = existsSync(join(PROJECT_ROOT, ".env"));
const buildExists = existsSync(join(PROJECT_ROOT, "dist", "index.js"));

console.log("");
console.log(cyan("╔═══════════════════════════════════════════════════════════╗"));
console.log(cyan("║        ") + bold("Donut CLI") + cyan(" - Dependencies Installed! ") + cyan("              ║"));
console.log(cyan("╚═══════════════════════════════════════════════════════════╝"));
console.log("");

if (!envExists) {
  console.log(yellow("Next step: Configure your environment"));
  console.log("");
  console.log("  " + gray("Quick setup (interactive wizard):"));
  console.log("    " + cyan("bun run build && node dist/index.js setup"));
  console.log("");
  console.log("  " + gray("Manual setup:"));
  console.log("    " + cyan("cp .env.example .env"));
  console.log("    " + gray("# Edit .env and add ANTHROPIC_API_KEY=sk-ant-..."));
  console.log("    " + cyan("bun run build"));
  console.log("");
} else if (!buildExists) {
  console.log(green("✓") + " Environment configured");
  console.log("");
  console.log(yellow("Next step: Build the project"));
  console.log("");
  console.log("    " + cyan("bun run build"));
  console.log("");
} else {
  console.log(green("✓") + " Ready to use!");
  console.log("");
  console.log("  " + cyan("node dist/index.js demo tour") + "   " + gray("# Try the demo"));
  console.log("  " + cyan("node dist/index.js chat") + "        " + gray("# AI chat mode"));
  console.log("  " + cyan("npm link") + "                       " + gray("# Install 'donut' globally"));
  console.log("");
}

console.log(gray("Docs: README.md | Full setup: docs/INSTALLATION.md"));
console.log("");
