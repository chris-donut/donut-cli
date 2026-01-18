/**
 * Strategy Commands - Strategy building and management
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { Pool } from "pg";
import { loadConfig, validateApiKeys } from "../../core/config.js";
import { SessionManager } from "../../core/session.js";
import { createStrategyBuilder } from "../../agents/strategy-builder.js";
import { logError } from "../../core/errors.js";
import { BANNER } from "../theme.js";
import {
  StrategyStorage,
  initializeStrategyStorage,
} from "../../storage/strategy-storage.js";

/**
 * Initialize database pool for strategy storage
 */
async function getStrategyStorage(): Promise<StrategyStorage | null> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return null;
  }

  try {
    const pool = new Pool({ connectionString: databaseUrl });
    const storage = initializeStrategyStorage(pool);
    await storage.ensureTables();
    return storage;
  } catch (error) {
    console.error(chalk.yellow("Database connection failed:"), error);
    return null;
  }
}

/**
 * Register strategy commands on the program
 */
export function registerStrategyCommands(program: Command): void {
  const strategyCmd = program
    .command("strategy")
    .description("Strategy management commands");

  strategyCmd
    .command("build")
    .description("Build a new trading strategy")
    .argument("[description]", "Strategy description or requirements")
    .action(async (description) => {
      console.log(BANNER);

      const spinner = ora("Initializing strategy builder...").start();

      try {
        const config = loadConfig();
        validateApiKeys(config);

        const sessionManager = new SessionManager(config.sessionDir);

        // Load most recent session or create new one
        const sessions = await sessionManager.listSessions();
        if (sessions.length > 0) {
          await sessionManager.loadSession(sessions[sessions.length - 1]);
        } else {
          await sessionManager.createSession();
        }

        spinner.succeed("Strategy builder ready");

        const agent = createStrategyBuilder({
          terminalConfig: config,
          sessionManager,
        });

        const prompt =
          description ||
          "Help me build a crypto trading strategy. Ask me about my goals and preferences.";

        console.log(chalk.gray("\nClaude is thinking...\n"));

        const result = await agent.buildStrategy(prompt);

        if (result.success) {
          console.log(chalk.green("\n\n✓ Strategy building complete"));
        } else {
          console.log(chalk.red(`\n\n✗ Failed: ${result.error}`));
        }
      } catch (error) {
        spinner.fail("Failed to build strategy");
        logError(error);
        process.exit(1);
      }
    });

  strategyCmd
    .command("list")
    .description("List saved strategies")
    .option("-l, --limit <number>", "Maximum strategies to show", "20")
    .action(async (options) => {
      try {
        const storage = await getStrategyStorage();
        if (!storage) {
          console.log(chalk.yellow("\nStrategy storage requires DATABASE_URL"));
          console.log(chalk.gray("Set DATABASE_URL in your .env file"));
          return;
        }

        const spinner = ora("Fetching strategies...").start();
        const strategies = await storage.list({ limit: parseInt(options.limit) });
        spinner.stop();

        if (strategies.length === 0) {
          console.log(chalk.gray("\nNo strategies found."));
          console.log(chalk.gray("Use 'donut strategy build' to create one."));
          return;
        }

        console.log(chalk.bold("\n📋 Saved Strategies:\n"));
        for (const s of strategies) {
          console.log(
            chalk.cyan(`  ${s.name}`) +
              chalk.gray(` (v${s.version})`)
          );
          if (s.config.description) {
            console.log(chalk.gray(`    ${s.config.description}`));
          }
          console.log(
            chalk.gray(`    Updated: ${new Date(s.updatedAt).toLocaleDateString()}`)
          );
          console.log();
        }

        const total = await storage.count();
        console.log(chalk.gray(`Showing ${strategies.length} of ${total} strategies`));
      } catch (error) {
        logError(error);
        process.exit(1);
      }
    });

  strategyCmd
    .command("show")
    .description("Show details of a strategy")
    .argument("<name>", "Strategy name or ID")
    .action(async (name) => {
      try {
        const storage = await getStrategyStorage();
        if (!storage) {
          console.log(chalk.yellow("\nStrategy storage requires DATABASE_URL"));
          return;
        }

        const spinner = ora("Loading strategy...").start();
        const strategy = await storage.load(name);
        spinner.stop();

        if (!strategy) {
          console.log(chalk.red(`\nStrategy "${name}" not found`));
          return;
        }

        console.log(chalk.bold(`\n📊 Strategy: ${strategy.name}\n`));
        console.log(chalk.gray(`ID: ${strategy.id}`));
        console.log(chalk.gray(`Version: ${strategy.version}`));
        console.log(chalk.gray(`Created: ${new Date(strategy.createdAt).toLocaleString()}`));
        console.log(chalk.gray(`Updated: ${new Date(strategy.updatedAt).toLocaleString()}`));

        if (strategy.config.description) {
          console.log(chalk.white(`\nDescription: ${strategy.config.description}`));
        }

        console.log(chalk.bold("\nCoin Source:"));
        console.log(chalk.gray(`  Type: ${strategy.config.coinSource.sourceType}`));
        if (strategy.config.coinSource.staticCoins?.length) {
          console.log(chalk.gray(`  Coins: ${strategy.config.coinSource.staticCoins.join(", ")}`));
        }

        console.log(chalk.bold("\nIndicators:"));
        const ind = strategy.config.indicators;
        const enabled = [];
        if (ind.enableEMA) enabled.push("EMA");
        if (ind.enableMACD) enabled.push("MACD");
        if (ind.enableRSI) enabled.push("RSI");
        if (ind.enableATR) enabled.push("ATR");
        if (ind.enableVolume) enabled.push("Volume");
        if (ind.enableOI) enabled.push("OI");
        if (ind.enableFundingRate) enabled.push("Funding Rate");
        console.log(chalk.gray(`  Enabled: ${enabled.join(", ")}`));

        console.log(chalk.bold("\nRisk Controls:"));
        const risk = strategy.config.riskControl;
        console.log(chalk.gray(`  Max Positions: ${risk.maxPositions}`));
        console.log(chalk.gray(`  BTC/ETH Max Leverage: ${risk.btcEthMaxLeverage}x`));
        console.log(chalk.gray(`  Altcoin Max Leverage: ${risk.altcoinMaxLeverage}x`));
        console.log(chalk.gray(`  Max Margin Usage: ${(risk.maxMarginUsage * 100).toFixed(0)}%`));
        console.log(chalk.gray(`  Min Risk/Reward: ${risk.minRiskRewardRatio}`));
        console.log(chalk.gray(`  Min Confidence: ${risk.minConfidence}%`));
      } catch (error) {
        logError(error);
        process.exit(1);
      }
    });

  strategyCmd
    .command("delete")
    .description("Delete a strategy")
    .argument("<name>", "Strategy name or ID")
    .option("-y, --yes", "Skip confirmation")
    .action(async (name, options) => {
      try {
        const storage = await getStrategyStorage();
        if (!storage) {
          console.log(chalk.yellow("\nStrategy storage requires DATABASE_URL"));
          return;
        }

        // Check if exists first
        const strategy = await storage.load(name);
        if (!strategy) {
          console.log(chalk.red(`\nStrategy "${name}" not found`));
          return;
        }

        if (!options.yes) {
          console.log(chalk.yellow(`\nAre you sure you want to delete "${strategy.name}"?`));
          console.log(chalk.gray("Use --yes to confirm deletion"));
          return;
        }

        const spinner = ora("Deleting strategy...").start();
        const deleted = await storage.delete(name);
        spinner.stop();

        if (deleted) {
          console.log(chalk.green(`\n✓ Strategy "${strategy.name}" deleted`));
        } else {
          console.log(chalk.red(`\n✗ Failed to delete strategy`));
        }
      } catch (error) {
        logError(error);
        process.exit(1);
      }
    });

  strategyCmd
    .command("history")
    .description("Show version history of a strategy")
    .argument("<name>", "Strategy name or ID")
    .action(async (name) => {
      try {
        const storage = await getStrategyStorage();
        if (!storage) {
          console.log(chalk.yellow("\nStrategy storage requires DATABASE_URL"));
          return;
        }

        const strategy = await storage.load(name);
        if (!strategy) {
          console.log(chalk.red(`\nStrategy "${name}" not found`));
          return;
        }

        const versions = await storage.getVersionHistory(name);

        console.log(chalk.bold(`\n📜 Version History: ${strategy.name}\n`));
        console.log(
          chalk.green(`  v${strategy.version} (current)`) +
            chalk.gray(` - ${new Date(strategy.updatedAt).toLocaleString()}`)
        );

        for (const v of versions) {
          console.log(
            chalk.gray(`  v${v.version}`) +
              chalk.gray(` - ${new Date(v.createdAt).toLocaleString()}`)
          );
        }

        if (versions.length === 0) {
          console.log(chalk.gray("\n  No previous versions"));
        }
      } catch (error) {
        logError(error);
        process.exit(1);
      }
    });

  strategyCmd
    .command("rollback")
    .description("Rollback strategy to a previous version")
    .argument("<name>", "Strategy name or ID")
    .argument("<version>", "Version number to rollback to")
    .action(async (name, version) => {
      try {
        const storage = await getStrategyStorage();
        if (!storage) {
          console.log(chalk.yellow("\nStrategy storage requires DATABASE_URL"));
          return;
        }

        const spinner = ora("Rolling back strategy...").start();
        const result = await storage.rollback(name, parseInt(version));
        spinner.stop();

        if (result) {
          console.log(chalk.green(`\n✓ Rolled back to version ${version}`));
          console.log(chalk.gray(`  Now at version ${result.version}`));
        } else {
          console.log(chalk.red(`\n✗ Strategy or version not found`));
        }
      } catch (error) {
        logError(error);
        process.exit(1);
      }
    });
}
