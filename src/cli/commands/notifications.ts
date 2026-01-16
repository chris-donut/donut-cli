/**
 * Notification Commands - Configure and test notification channels
 *
 * Supports Telegram, Discord (webhook), and custom webhooks.
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import {
  TelegramClientConfig,
  validateCredentials,
  sendMessage,
} from "../../integrations/telegram-client.js";
import { logError } from "../../core/errors.js";

// ============================================================================
// Configuration Storage
// ============================================================================

const NOTIFICATIONS_DIR = path.join(os.homedir(), ".donut");
const NOTIFICATIONS_FILE = path.join(NOTIFICATIONS_DIR, "notifications.json");

interface NotificationsConfig {
  telegram?: {
    botToken: string;
    chatId: string;
    enabled: boolean;
  };
  discord?: {
    webhookUrl: string;
    enabled: boolean;
  };
  webhook?: {
    url: string;
    enabled: boolean;
  };
}

async function loadNotificationsConfig(): Promise<NotificationsConfig> {
  try {
    const data = await fs.readFile(NOTIFICATIONS_FILE, "utf-8");
    return JSON.parse(data) as NotificationsConfig;
  } catch {
    return {};
  }
}

async function saveNotificationsConfig(
  config: NotificationsConfig
): Promise<void> {
  await fs.mkdir(NOTIFICATIONS_DIR, { recursive: true });
  await fs.writeFile(NOTIFICATIONS_FILE, JSON.stringify(config, null, 2));
}

// ============================================================================
// Commands
// ============================================================================

/**
 * Register notification commands on the program
 */
export function registerNotificationCommands(program: Command): void {
  const notify = program
    .command("notify")
    .description("Notification configuration and testing");

  notify
    .command("setup")
    .description("Set up a notification channel")
    .argument("<channel>", "Notification channel (telegram, discord, webhook)")
    .option("-t, --token <token>", "Bot token (for Telegram)")
    .option("-c, --chat <chatId>", "Chat ID (for Telegram)")
    .option("-w, --webhook <url>", "Webhook URL (for Discord or custom webhook)")
    .action(async (channel: string, options) => {
      const spinner = ora(`Setting up ${channel} notifications...`).start();

      try {
        const config = await loadNotificationsConfig();

        if (channel === "telegram") {
          if (!options.token || !options.chat) {
            spinner.fail("Telegram requires --token and --chat options");
            console.log(chalk.gray("\nExample:"));
            console.log(
              chalk.gray(
                "  donut notify setup telegram --token YOUR_BOT_TOKEN --chat YOUR_CHAT_ID"
              )
            );
            console.log(chalk.gray("\nTo get these values:"));
            console.log(
              chalk.gray("  1. Create a bot via @BotFather on Telegram")
            );
            console.log(
              chalk.gray("  2. Get your chat ID by messaging @userinfobot")
            );
            return;
          }

          // Validate credentials by sending test message
          const telegramConfig: TelegramClientConfig = {
            botToken: options.token,
            chatId: options.chat,
          };

          spinner.text = "Validating Telegram credentials...";
          const validation = await validateCredentials(telegramConfig);

          if (!validation.valid) {
            spinner.fail(`Telegram validation failed: ${validation.error}`);
            return;
          }

          config.telegram = {
            botToken: options.token,
            chatId: options.chat,
            enabled: true,
          };

          await saveNotificationsConfig(config);
          spinner.succeed("Telegram notifications configured successfully");
          console.log(chalk.green("✓ Test message sent to your Telegram chat"));
        } else if (channel === "discord") {
          if (!options.webhook) {
            spinner.fail("Discord requires --webhook option");
            console.log(chalk.gray("\nExample:"));
            console.log(
              chalk.gray(
                "  donut notify setup discord --webhook https://discord.com/api/webhooks/..."
              )
            );
            return;
          }

          config.discord = {
            webhookUrl: options.webhook,
            enabled: true,
          };

          await saveNotificationsConfig(config);
          spinner.succeed("Discord webhook configured");
          console.log(
            chalk.yellow("⚠ Discord notification sending not yet implemented")
          );
        } else if (channel === "webhook") {
          if (!options.webhook) {
            spinner.fail("Webhook requires --webhook option");
            return;
          }

          config.webhook = {
            url: options.webhook,
            enabled: true,
          };

          await saveNotificationsConfig(config);
          spinner.succeed("Custom webhook configured");
        } else {
          spinner.fail(`Unknown channel: ${channel}`);
          console.log(chalk.gray("Available channels: telegram, discord, webhook"));
        }
      } catch (error) {
        spinner.fail("Failed to configure notifications");
        logError(error);
        process.exit(1);
      }
    });

  notify
    .command("test")
    .description("Send a test notification to all configured channels")
    .action(async () => {
      const spinner = ora("Sending test notifications...").start();

      try {
        const config = await loadNotificationsConfig();
        const results: Array<{
          channel: string;
          success: boolean;
          error?: string;
        }> = [];

        // Test Telegram
        if (config.telegram?.enabled) {
          spinner.text = "Sending test to Telegram...";
          const telegramConfig: TelegramClientConfig = {
            botToken: config.telegram.botToken,
            chatId: config.telegram.chatId,
          };

          const result = await sendMessage(
            telegramConfig,
            "🧪 <b>Test Notification</b>\n\nThis is a test message from Donut CLI."
          );

          results.push({
            channel: "telegram",
            success: result.success,
            error: result.error,
          });
        }

        // Test Discord (placeholder)
        if (config.discord?.enabled) {
          results.push({
            channel: "discord",
            success: false,
            error: "Discord sending not yet implemented",
          });
        }

        // Test Webhook (placeholder)
        if (config.webhook?.enabled) {
          results.push({
            channel: "webhook",
            success: false,
            error: "Webhook sending not yet implemented",
          });
        }

        if (results.length === 0) {
          spinner.fail("No notification channels configured");
          console.log(
            chalk.gray(
              "\nSet up a channel with: donut notify setup telegram --token <token> --chat <chatId>"
            )
          );
          return;
        }

        spinner.succeed("Test notifications sent");
        console.log(chalk.gray("─".repeat(50)));

        for (const result of results) {
          if (result.success) {
            console.log(
              `${chalk.green("✓")} ${result.channel}: ${chalk.green("sent successfully")}`
            );
          } else {
            console.log(
              `${chalk.red("✗")} ${result.channel}: ${chalk.red(result.error || "failed")}`
            );
          }
        }
      } catch (error) {
        spinner.fail("Failed to send test notifications");
        logError(error);
        process.exit(1);
      }
    });

  notify
    .command("status")
    .description("Show configured notification channels")
    .action(async () => {
      const spinner = ora("Loading notification config...").start();

      try {
        const config = await loadNotificationsConfig();
        spinner.succeed("Configuration loaded");

        console.log(chalk.bold("\nNotification Channels"));
        console.log(chalk.gray("─".repeat(50)));

        if (Object.keys(config).length === 0) {
          console.log(chalk.yellow("No notification channels configured"));
          console.log(chalk.gray("\nSet up a channel with:"));
          console.log(
            chalk.gray(
              "  donut notify setup telegram --token <token> --chat <chatId>"
            )
          );
          return;
        }

        if (config.telegram) {
          const status = config.telegram.enabled
            ? chalk.green("enabled")
            : chalk.yellow("disabled");
          console.log(`${chalk.cyan("Telegram")}:`);
          console.log(`  Status:   ${status}`);
          console.log(`  Chat ID:  ${chalk.gray(config.telegram.chatId)}`);
          console.log(
            `  Token:    ${chalk.gray(config.telegram.botToken.slice(0, 10) + "...")}`
          );
        }

        if (config.discord) {
          const status = config.discord.enabled
            ? chalk.green("enabled")
            : chalk.yellow("disabled");
          console.log(`${chalk.cyan("Discord")}:`);
          console.log(`  Status:   ${status}`);
          console.log(
            `  Webhook:  ${chalk.gray(config.discord.webhookUrl.slice(0, 40) + "...")}`
          );
        }

        if (config.webhook) {
          const status = config.webhook.enabled
            ? chalk.green("enabled")
            : chalk.yellow("disabled");
          console.log(`${chalk.cyan("Webhook")}:`);
          console.log(`  Status:   ${status}`);
          console.log(`  URL:      ${chalk.gray(config.webhook.url)}`);
        }

        console.log(chalk.gray("\n─".repeat(50)));
        console.log(chalk.gray("Config stored at: " + NOTIFICATIONS_FILE));
      } catch (error) {
        spinner.fail("Failed to load config");
        logError(error);
        process.exit(1);
      }
    });
}
