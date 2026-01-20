/**
 * Donut Animation - Animated ASCII donut loading screen
 */

import chalk from "chalk";
import { renderFrame } from "../renderer.js";

// Animation settings
const DEFAULT_DURATION_MS = 2500;
const FRAME_DELAY_MS = 50;
const ROTATION_SPEED_A = 0.07;
const ROTATION_SPEED_B = 0.03;

// Donut display size
const DONUT_WIDTH = 40;
const DONUT_HEIGHT = 22;

/**
 * Play the spinning donut animation in the terminal
 * @param durationMs - How long to play the animation (default 2.5 seconds)
 */
export async function playDonutAnimation(durationMs: number = DEFAULT_DURATION_MS): Promise<void> {
  // Check if we're in a TTY (interactive terminal)
  if (!process.stdout.isTTY) {
    return;
  }

  let A = 0;
  let B = 0;
  const startTime = Date.now();

  // Hide cursor during animation
  process.stdout.write("\x1B[?25l");

  // Clear screen and move to top
  process.stdout.write("\x1B[2J\x1B[H");

  const brandColor = chalk.hex("#FF6B35");
  const title = brandColor.bold("  DONUT CLI");
  const subtitle = chalk.gray("  Loading...");

  try {
    while (Date.now() - startTime < durationMs) {
      // Move cursor to home position
      process.stdout.write("\x1B[H");

      // Render the donut frame
      const frame = renderFrame(A, B, DONUT_WIDTH, DONUT_HEIGHT);

      // Color the donut with brand colors
      const coloredFrame = frame
        .split("")
        .map((char) => {
          if (char === " " || char === "\n") return char;
          // Gradient from orange to yellow based on luminance
          const luminanceChars = ".,-~:;=!*#$@";
          const idx = luminanceChars.indexOf(char);
          if (idx < 4) return chalk.hex("#8B4513")(char); // Dark brown for shadows
          if (idx < 8) return brandColor(char); // Orange for mid-tones
          return chalk.hex("#FFD700")(char); // Gold for highlights
        })
        .join("");

      // Build the display with title
      const output = `\n${title}\n${subtitle}\n\n${coloredFrame}`;
      process.stdout.write(output);

      // Update rotation angles
      A += ROTATION_SPEED_A;
      B += ROTATION_SPEED_B;

      // Wait for next frame
      await sleep(FRAME_DELAY_MS);
    }
  } finally {
    // Show cursor again
    process.stdout.write("\x1B[?25h");

    // Clear screen before showing the actual banner
    process.stdout.write("\x1B[2J\x1B[H");
  }
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
