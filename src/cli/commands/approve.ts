/**
 * Approval Commands - Trade approval workflow
 *
 * Commands for managing trade approval requests:
 * - List pending approvals
 * - Approve or reject trades
 * - Configure approval settings
 */

import { Command } from "commander";
import chalk from "chalk";
import { getRiskManager } from "../../hooks/risk-hook.js";

/**
 * Register approval commands on the program
 */
export function registerApproveCommands(program: Command): void {
  const approveCmd = program
    .command("approve")
    .description("Manage trade approval requests");

  approveCmd
    .command("list")
    .description("List pending trade approvals")
    .action(async () => {
      const riskManager = getRiskManager();
      const pending = riskManager.getPendingApprovals();

      if (pending.length === 0) {
        console.log(chalk.gray("\nNo pending approvals"));
        return;
      }

      console.log(chalk.bold("\n⏳ Pending Approvals:\n"));

      for (const approval of pending) {
        const expiresIn = Math.ceil(
          (approval.expiresAt.getTime() - Date.now()) / 1000
        );

        console.log(chalk.cyan(`  ID: ${approval.requestId}`));
        console.log(chalk.white(`  Tool: ${approval.toolName}`));

        // Display key params
        const params = approval.params;
        if (params.symbol) console.log(chalk.gray(`    Symbol: ${params.symbol}`));
        if (params.side) console.log(chalk.gray(`    Side: ${params.side}`));
        if (params.quantity) console.log(chalk.gray(`    Quantity: ${params.quantity}`));
        if (params.leverage) console.log(chalk.gray(`    Leverage: ${params.leverage}x`));

        console.log(
          expiresIn > 0
            ? chalk.yellow(`  Expires in: ${expiresIn}s`)
            : chalk.red(`  EXPIRED`)
        );
        console.log();
      }

      console.log(chalk.gray(`Use 'donut approve yes <id>' or 'donut approve no <id>'`));
    });

  approveCmd
    .command("yes")
    .alias("approve")
    .description("Approve a trade request")
    .argument("<id>", "Approval request ID")
    .action(async (id) => {
      const riskManager = getRiskManager();
      const result = riskManager.approveRequest(id);

      if (result.approved) {
        console.log(chalk.green(`\n✓ Approved: ${id}`));
        if (result.context) {
          console.log(chalk.gray(`  Tool: ${result.context.toolName}`));
          const params = result.context.params;
          if (params.symbol) console.log(chalk.gray(`  Symbol: ${params.symbol}`));
        }
      } else {
        console.log(chalk.red(`\n✗ Could not approve: ${result.error}`));
      }
    });

  approveCmd
    .command("no")
    .alias("reject")
    .description("Reject a trade request")
    .argument("<id>", "Approval request ID")
    .action(async (id) => {
      const riskManager = getRiskManager();
      const rejected = riskManager.rejectRequest(id);

      if (rejected) {
        console.log(chalk.yellow(`\n✗ Rejected: ${id}`));
      } else {
        console.log(chalk.red(`\nRequest not found: ${id}`));
      }
    });

  approveCmd
    .command("status")
    .description("Show risk manager status")
    .action(async () => {
      const riskManager = getRiskManager();
      const metrics = riskManager.getRiskMetrics();
      const circuitBreaker = metrics.circuitBreaker;

      console.log(chalk.bold("\n📊 Risk Manager Status:\n"));

      // Daily limits
      console.log(chalk.white("Daily Limits:"));
      console.log(
        chalk.gray(`  Loss: $${metrics.dailyLoss.toFixed(2)} / $${metrics.config.maxDailyLossUsd}`)
      );
      console.log(
        chalk.gray(`  Remaining: $${metrics.dailyLossRemaining.toFixed(2)}`)
      );

      // Positions
      console.log(chalk.white("\nPositions:"));
      console.log(
        chalk.gray(`  Open: ${metrics.openPositions} / ${metrics.config.maxOpenPositions}`)
      );
      console.log(chalk.gray(`  Remaining: ${metrics.positionsRemaining}`));

      // Circuit breaker
      console.log(chalk.white("\nCircuit Breaker:"));
      if (!circuitBreaker.enabled) {
        console.log(chalk.gray("  Status: Disabled"));
      } else if (circuitBreaker.tripped) {
        console.log(chalk.red("  Status: TRIPPED"));
        console.log(
          chalk.red(`  Cooldown: ${circuitBreaker.cooldownRemainingMinutes} minutes remaining`)
        );
      } else {
        console.log(chalk.green("  Status: OK"));
        console.log(
          chalk.gray(`  Consecutive losses: ${circuitBreaker.consecutiveLosses}`)
        );
      }

      // Pending approvals
      console.log(chalk.white("\nPending Approvals:"));
      console.log(chalk.gray(`  Count: ${metrics.pendingApprovalsCount}`));

      // Config summary
      console.log(chalk.white("\nLimits:"));
      console.log(
        chalk.gray(`  Max Position: $${metrics.config.maxPositionSizeUsd}`)
      );
      console.log(
        chalk.gray(`  Confirmation Required: ${metrics.config.requireConfirmation ? "Yes" : "No"}`)
      );
      if (metrics.config.blacklistedSymbols.length > 0) {
        console.log(
          chalk.gray(`  Blacklisted: ${metrics.config.blacklistedSymbols.join(", ")}`)
        );
      }
    });

  approveCmd
    .command("reset-circuit-breaker")
    .description("Emergency reset of circuit breaker")
    .option("-y, --yes", "Skip confirmation")
    .action(async (options) => {
      if (!options.yes) {
        console.log(chalk.yellow("\nThis will reset the circuit breaker and allow trading again."));
        console.log(chalk.gray("Use --yes to confirm"));
        return;
      }

      const riskManager = getRiskManager();
      riskManager.resetCircuitBreaker();
      console.log(chalk.green("\n✓ Circuit breaker reset"));
    });
}
