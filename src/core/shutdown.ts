/**
 * Graceful Shutdown Handler
 *
 * Provides infrastructure for graceful shutdown on SIGINT/SIGTERM:
 * - Registers async cleanup callbacks
 * - Executes cleanup in registration order
 * - Logs shutdown progress
 * - Prevents duplicate cleanup on multiple signals
 */

import { createLogger } from "./logger.js";

const logger = createLogger("shutdown");

// ============================================================================
// Types
// ============================================================================

export type CleanupCallback = () => Promise<void> | void;

export interface ShutdownOptions {
  /** Timeout for cleanup operations in milliseconds (default: 10000) */
  timeout?: number;
  /** Whether to exit the process after cleanup (default: true) */
  exitAfterCleanup?: boolean;
  /** Exit code on graceful shutdown (default: 0) */
  exitCode?: number;
}

// ============================================================================
// Shutdown Manager
// ============================================================================

/**
 * Singleton shutdown manager that handles graceful termination
 */
class ShutdownManager {
  private callbacks: Array<{ name: string; fn: CleanupCallback }> = [];
  private isShuttingDown = false;
  private isRegistered = false;
  private options: Required<ShutdownOptions> = {
    timeout: 10000,
    exitAfterCleanup: true,
    exitCode: 0,
  };

  /**
   * Register a cleanup callback to run on shutdown
   *
   * @example
   * ```typescript
   * shutdownManager.register("sessionSave", async () => {
   *   await sessionManager.saveAll();
   * });
   * ```
   */
  register(name: string, callback: CleanupCallback): void {
    this.callbacks.push({ name, fn: callback });
    logger.debug("Registered shutdown callback", { name, total: this.callbacks.length });
  }

  /**
   * Remove a previously registered callback
   */
  unregister(name: string): void {
    const index = this.callbacks.findIndex((c) => c.name === name);
    if (index !== -1) {
      this.callbacks.splice(index, 1);
      logger.debug("Unregistered shutdown callback", { name });
    }
  }

  /**
   * Configure shutdown options
   */
  configure(options: ShutdownOptions): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Register signal handlers for graceful shutdown
   * Should be called once at application startup
   */
  registerSignalHandlers(): void {
    if (this.isRegistered) {
      logger.warn("Signal handlers already registered");
      return;
    }

    const handler = (signal: string) => {
      logger.info("Received shutdown signal", { signal });
      this.shutdown(signal);
    };

    process.on("SIGINT", () => handler("SIGINT"));
    process.on("SIGTERM", () => handler("SIGTERM"));

    // Handle uncaught exceptions gracefully
    process.on("uncaughtException", (error) => {
      logger.error("Uncaught exception, initiating shutdown", {
        error: error.message,
        stack: error.stack,
      });
      this.shutdown("uncaughtException", 1);
    });

    // Handle unhandled promise rejections
    process.on("unhandledRejection", (reason) => {
      logger.error("Unhandled rejection, initiating shutdown", {
        reason: reason instanceof Error ? reason.message : String(reason),
      });
      this.shutdown("unhandledRejection", 1);
    });

    this.isRegistered = true;
    logger.debug("Signal handlers registered");
  }

  /**
   * Execute shutdown sequence
   * Can be called manually or triggered by signals
   */
  async shutdown(reason: string = "manual", exitCode?: number): Promise<void> {
    if (this.isShuttingDown) {
      logger.warn("Shutdown already in progress, ignoring duplicate signal");
      return;
    }

    this.isShuttingDown = true;
    const finalExitCode = exitCode ?? this.options.exitCode;

    logger.info("Graceful shutdown initiated", {
      reason,
      callbackCount: this.callbacks.length,
      timeoutMs: this.options.timeout,
    });

    // Create timeout promise
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Shutdown timeout after ${this.options.timeout}ms`));
      }, this.options.timeout);
    });

    // Execute cleanup callbacks
    const cleanupPromise = this.executeCleanup();

    try {
      await Promise.race([cleanupPromise, timeoutPromise]);
      logger.info("Graceful shutdown completed", { reason });
    } catch (error) {
      logger.error("Shutdown completed with errors", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (this.options.exitAfterCleanup) {
      process.exit(finalExitCode);
    }
  }

  /**
   * Execute all cleanup callbacks in order
   */
  private async executeCleanup(): Promise<void> {
    for (const { name, fn } of this.callbacks) {
      try {
        logger.debug("Executing cleanup callback", { name });
        await fn();
        logger.debug("Cleanup callback completed", { name });
      } catch (error) {
        logger.error("Cleanup callback failed", {
          name,
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue with other callbacks even if one fails
      }
    }
  }

  /**
   * Check if shutdown is in progress
   */
  isInProgress(): boolean {
    return this.isShuttingDown;
  }

  /**
   * Reset manager state (primarily for testing)
   */
  reset(): void {
    this.callbacks = [];
    this.isShuttingDown = false;
    this.isRegistered = false;
    this.options = {
      timeout: 10000,
      exitAfterCleanup: true,
      exitCode: 0,
    };
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

/**
 * Global shutdown manager instance
 */
export const shutdownManager = new ShutdownManager();

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Register signal handlers and configure shutdown
 *
 * @example
 * ```typescript
 * // In main entry point
 * registerShutdownHandler({
 *   timeout: 5000,
 *   exitCode: 0,
 * });
 *
 * // Register cleanup callbacks
 * onShutdown("session", async () => {
 *   await sessionManager.saveAll();
 * });
 * ```
 */
export function registerShutdownHandler(options?: ShutdownOptions): void {
  if (options) {
    shutdownManager.configure(options);
  }
  shutdownManager.registerSignalHandlers();
}

/**
 * Register a cleanup callback to run on shutdown
 */
export function onShutdown(name: string, callback: CleanupCallback): void {
  shutdownManager.register(name, callback);
}

/**
 * Remove a shutdown callback
 */
export function offShutdown(name: string): void {
  shutdownManager.unregister(name);
}

/**
 * Manually trigger shutdown
 */
export async function triggerShutdown(reason?: string, exitCode?: number): Promise<void> {
  await shutdownManager.shutdown(reason, exitCode);
}
