/**
 * Monitor Commands - Position monitoring management
 *
 * Commands for starting, stopping, and configuring position monitoring:
 * - Start/stop background monitoring
 * - View current positions
 * - Configure alert thresholds
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { getPositionMonitor, resetPositionMonitor } from "../../services/position-monitor.js";
import { logError } from "../../core/errors.js";

/**
 * Register monitor commands on the program
 */
export function registerMonitorCommands(program: Command): void {
  const monitorCmd = program
    .command("monitor")
    .description("Position monitoring commands");

  monitorCmd
    .command("start")
    .description("Start position monitoring")
    .option("-i, --interval <seconds>", "Poll interval in seconds", "30")
    .option("--no-alerts", "Disable alert notifications")
    .action(async (options) => {
      const spinner = ora("Starting position monitor...").start();

      try {
        const intervalMs = parseInt(options.interval) * 1000;
        const monitor = getPositionMonitor({
          pollIntervalMs: intervalMs,
          enableAlerts: options.alerts !== false,
        });

        const result = await monitor.start();

        if (result.success) {
          spinner.succeed("Position monitor started");
          console.log();
          console.log(chalk.gray(`  Interval: ${options.interval}s`));
          console.log(chalk.gray(`  Alerts: ${options.alerts !== false ? "Enabled" : "Disabled"}`));
          console.log();
          console.log(chalk.gray("Use 'donut monitor status' to check positions"));
          console.log(chalk.gray("Use 'donut monitor stop' to stop monitoring"));
        } else {
          spinner.fail(`Failed to start: ${result.error}`);
        }
      } catch (error) {
        spinner.fail("Failed to start monitor");
        logError(error);
      }
    });

  monitorCmd
    .command("stop")
    .description("Stop position monitoring")
    .action(async () => {
      const monitor = getPositionMonitor();
      const status = monitor.getStatus();

      if (!status.running) {
        console.log(chalk.yellow("\nMonitor is not running"));
        return;
      }

      await monitor.stop();
      console.log(chalk.green("\n✓ Position monitor stopped"));
      console.log(chalk.gray(`  Total alerts: ${status.alertCount}`));
    });

  monitorCmd
    .command("status")
    .description("Show monitoring status and positions")
    .action(async () => {
      const monitor = getPositionMonitor();
      const status = monitor.getStatus();
      const positions = monitor.getAllPositions();

      console.log(chalk.bold("\n📡 Position Monitor Status:\n"));

      // Running status
      if (status.running) {
        console.log(chalk.green("  Status: RUNNING"));
      } else {
        console.log(chalk.gray("  Status: STOPPED"));
      }

      // Last poll
      if (status.lastPollAt) {
        console.log(chalk.gray(`  Last poll: ${status.lastPollAt.toLocaleString()}`));
      }

      // Alerts
      console.log(chalk.gray(`  Alerts sent: ${status.alertCount}`));

      // Error
      if (status.lastError) {
        console.log(chalk.red(`  Last error: ${status.lastError}`));
      }

      // Positions
      console.log(chalk.bold("\n  Open Positions:"));

      if (positions.length === 0) {
        console.log(chalk.gray("    No open positions"));
      } else {
        for (const pos of positions) {
          const sideEmoji = pos.side === "long" ? "📈" : "📉";
          const pnlColor = pos.unrealizedPnL >= 0 ? chalk.green : chalk.red;
          const pnlSign = pos.unrealizedPnL >= 0 ? "+" : "";

          console.log(
            `    ${sideEmoji} ${chalk.cyan(pos.symbol)} ` +
              pnlColor(`${pnlSign}$${pos.unrealizedPnL.toFixed(2)} (${pnlSign}${pos.unrealizedPnLPct.toFixed(2)}%)`)
          );
          console.log(
            chalk.gray(
              `       Entry: $${pos.entryPrice.toFixed(2)} | Current: $${pos.currentPrice.toFixed(2)} | Liq: $${pos.liquidationPrice.toFixed(2)}`
            )
          );
        }

        // Total
        console.log(
          chalk.bold(`\n  Total Unrealized P&L: `) +
            (status.totalUnrealizedPnl >= 0 ? chalk.green : chalk.red)(
              `${status.totalUnrealizedPnl >= 0 ? "+" : ""}$${status.totalUnrealizedPnl.toFixed(2)}`
            )
        );
      }
    });

  monitorCmd
    .command("alerts")
    .description("Configure alert thresholds")
    .option("--liquidation <percent>", "Liquidation warning threshold (%)")
    .option("--pnl-change <percent>", "P&L change alert threshold (%)")
    .option("--enable", "Enable alerts")
    .option("--disable", "Disable alerts")
    .action(async (options) => {
      const monitor = getPositionMonitor();

      const updates: Record<string, unknown> = {};

      if (options.liquidation) {
        updates.liquidationWarningPct = parseFloat(options.liquidation);
      }

      if (options.pnlChange) {
        updates.pnlChangeAlertPct = parseFloat(options.pnlChange);
      }

      if (options.enable) {
        updates.enableAlerts = true;
      } else if (options.disable) {
        updates.enableAlerts = false;
      }

      if (Object.keys(updates).length > 0) {
        monitor.updateConfig(updates);
        console.log(chalk.green("\n✓ Alert configuration updated"));

        for (const [key, value] of Object.entries(updates)) {
          console.log(chalk.gray(`  ${key}: ${value}`));
        }
      } else {
        console.log(chalk.yellow("\nNo configuration changes specified"));
        console.log(chalk.gray("\nOptions:"));
        console.log(chalk.gray("  --liquidation <percent>  Set liquidation warning threshold"));
        console.log(chalk.gray("  --pnl-change <percent>   Set P&L change alert threshold"));
        console.log(chalk.gray("  --enable                 Enable alerts"));
        console.log(chalk.gray("  --disable                Disable alerts"));
      }
    });

  monitorCmd
    .command("positions")
    .description("List current positions")
    .action(async () => {
      const monitor = getPositionMonitor();
      const positions = monitor.getAllPositions();

      if (positions.length === 0) {
        console.log(chalk.yellow("\nNo open positions"));
        return;
      }

      console.log(chalk.bold("\n📊 Open Positions:\n"));

      for (const pos of positions) {
        const sideEmoji = pos.side === "long" ? "📈" : "📉";
        const sideColor = pos.side === "long" ? chalk.green : chalk.red;
        const pnlColor = pos.unrealizedPnL >= 0 ? chalk.green : chalk.red;

        console.log(`${sideEmoji} ${chalk.bold(pos.symbol)}`);
        console.log(`   Side: ${sideColor(pos.side.toUpperCase())}`);
        console.log(`   Size: ${pos.quantity}`);
        console.log(`   Leverage: ${pos.leverage}x`);
        console.log(`   Entry: $${pos.entryPrice.toFixed(2)}`);
        console.log(`   Current: $${pos.currentPrice.toFixed(2)}`);
        console.log(
          `   P&L: ${pnlColor(`${pos.unrealizedPnL >= 0 ? "+" : ""}$${pos.unrealizedPnL.toFixed(2)} (${pos.unrealizedPnLPct.toFixed(2)}%)`)}`
        );
        console.log(`   Liquidation: $${pos.liquidationPrice.toFixed(2)}`);
        console.log(`   Margin: $${pos.margin.toFixed(2)}`);
        console.log();
      }

      // Summary
      const totalPnl = monitor.getTotalPnl();
      console.log(
        chalk.bold("Total Unrealized P&L: ") +
          (totalPnl.unrealized >= 0 ? chalk.green : chalk.red)(
            `${totalPnl.unrealized >= 0 ? "+" : ""}$${totalPnl.unrealized.toFixed(2)}`
          )
      );
    });
}
