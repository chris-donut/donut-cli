#!/usr/bin/env node
/**
 * Donut CLI - A spinning ASCII donut for your terminal
 *
 * Based on the classic donut.c by Andy Sloane (2006)
 * https://www.a1k0n.net/2011/07/20/donut-math.html
 */

import { renderFrame } from './renderer';

// Rotation angles - these increment each frame for animation
let A = 0;  // X-axis rotation
let B = 0;  // Z-axis rotation

// Animation speed (radians per frame)
const A_SPEED = 0.04;
const B_SPEED = 0.02;

// Frame interval in milliseconds (~20 FPS)
const FRAME_INTERVAL = 50;

// Get terminal dimensions
function getTerminalSize(): { width: number; height: number } {
  return {
    width: process.stdout.columns || 80,
    height: process.stdout.rows || 24,
  };
}

// Hide cursor for cleaner animation
function hideCursor(): void {
  process.stdout.write('\x1b[?25l');
}

// Show cursor (restore on exit)
function showCursor(): void {
  process.stdout.write('\x1b[?25h');
}

// Clear the entire screen
function clearScreen(): void {
  process.stdout.write('\x1b[2J');
}

// Move cursor to home position (top-left)
function cursorHome(): void {
  process.stdout.write('\x1b[H');
}

// Main animation loop
let animationInterval: ReturnType<typeof setInterval> | null = null;

function startAnimation(): void {
  const { width, height } = getTerminalSize();

  // Clear screen once at start
  clearScreen();
  hideCursor();

  animationInterval = setInterval(() => {
    // Move cursor to home instead of clearing (prevents flicker)
    cursorHome();

    // Render and output the frame
    const frame = renderFrame(A, B, width, height);
    process.stdout.write(frame);

    // Increment rotation angles
    A += A_SPEED;
    B += B_SPEED;
  }, FRAME_INTERVAL);
}

function stopAnimation(): void {
  if (animationInterval) {
    clearInterval(animationInterval);
    animationInterval = null;
  }
  showCursor();
  clearScreen();
  cursorHome();
}

// Handle clean exit
function handleExit(): void {
  stopAnimation();
  console.log('\n🍩 Thanks for watching the donut!\n');
  process.exit(0);
}

// Set up signal handlers
process.on('SIGINT', handleExit);   // Ctrl+C
process.on('SIGTERM', handleExit);  // kill
process.on('exit', showCursor);     // Ensure cursor is restored

// Handle terminal resize
process.stdout.on('resize', () => {
  // Restart animation with new dimensions
  if (animationInterval) {
    stopAnimation();
    startAnimation();
  }
});

// ASCII art banner
console.log(`
  🍩 Donut CLI
  ────────────
  A spinning ASCII donut for your terminal

  Press Ctrl+C to exit

  Starting in 2 seconds...
`);

// Start after a brief delay so user can read the banner
setTimeout(() => {
  startAnimation();
}, 2000);
