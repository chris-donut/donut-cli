/**
 * Telegram Bot API Client
 * Handles sending notifications and trade approval requests via Telegram
 */

import { createServer, IncomingMessage, ServerResponse, Server } from "http";
import { TradeApprovalRequest, ApprovalResponse } from "../core/types.js";

const TELEGRAM_API_BASE = "https://api.telegram.org/bot";

// ============================================================================
// Pending Approvals Store (in-memory)
// ============================================================================

interface PendingApproval {
  tradeId: string;
  messageId: number;
  expiresAt: number;
  resolve: (response: ApprovalResponse) => void;
  used: boolean;
}

const pendingApprovals = new Map<string, PendingApproval>();

// Cleanup expired approvals periodically
setInterval(() => {
  const now = Date.now();
  for (const [tradeId, approval] of pendingApprovals.entries()) {
    if (approval.expiresAt < now && !approval.used) {
      approval.used = true;
      approval.resolve("EXPIRED");
      pendingApprovals.delete(tradeId);
    }
  }
}, 1000);

/**
 * Configuration for the Telegram client
 */
export interface TelegramClientConfig {
  botToken: string;
  chatId: string;
}

/**
 * Load Telegram configuration from environment variables
 */
export function loadTelegramConfig(): TelegramClientConfig | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    return null;
  }

  return { botToken, chatId };
}

/**
 * Send a simple text message to Telegram
 */
export async function sendMessage(
  config: TelegramClientConfig,
  message: string,
  options?: {
    parseMode?: "HTML" | "Markdown" | "MarkdownV2";
    disableNotification?: boolean;
  }
): Promise<{ success: boolean; messageId?: number; error?: string }> {
  try {
    const url = `${TELEGRAM_API_BASE}${config.botToken}/sendMessage`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: message,
        parse_mode: options?.parseMode || "HTML",
        disable_notification: options?.disableNotification || false,
      }),
    });

    const data = await response.json() as {
      ok: boolean;
      result?: { message_id: number };
      description?: string;
    };

    if (data.ok && data.result) {
      return { success: true, messageId: data.result.message_id };
    } else {
      return { success: false, error: data.description || "Unknown error" };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

/**
 * Send a trade approval request with inline keyboard buttons
 */
export async function sendTradeApproval(
  config: TelegramClientConfig,
  approval: TradeApprovalRequest
): Promise<{ success: boolean; messageId?: number; error?: string }> {
  try {
    const url = `${TELEGRAM_API_BASE}${config.botToken}/sendMessage`;

    // Format the trade details
    const expiresIn = Math.max(0, Math.floor((approval.expiresAt - Date.now()) / 1000));
    const sideEmoji = approval.side === "long" ? "📈" : "📉";
    const sideText = approval.side.toUpperCase();

    const message = `
<b>🔔 Trade Approval Required</b>

${sideEmoji} <b>${sideText}</b> ${approval.symbol}
💰 Size: ${approval.size.toFixed(4)}
💵 Price: $${approval.price.toFixed(2)}
💲 Value: $${(approval.size * approval.price).toFixed(2)}

⏱ Expires in: ${expiresIn}s
🆔 Trade ID: <code>${approval.tradeId.slice(0, 8)}...</code>
`.trim();

    // Create inline keyboard with APPROVE/REJECT buttons
    const inlineKeyboard = {
      inline_keyboard: [
        [
          {
            text: "✅ APPROVE",
            callback_data: `approve:${approval.tradeId}`,
          },
          {
            text: "❌ REJECT",
            callback_data: `reject:${approval.tradeId}`,
          },
        ],
      ],
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: message,
        parse_mode: "HTML",
        reply_markup: inlineKeyboard,
      }),
    });

    const data = await response.json() as {
      ok: boolean;
      result?: { message_id: number };
      description?: string;
    };

    if (data.ok && data.result) {
      return { success: true, messageId: data.result.message_id };
    } else {
      return { success: false, error: data.description || "Unknown error" };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

/**
 * Edit a message to update its status (e.g., after approval/rejection)
 */
export async function editMessage(
  config: TelegramClientConfig,
  messageId: number,
  newText: string,
  options?: {
    parseMode?: "HTML" | "Markdown" | "MarkdownV2";
    removeKeyboard?: boolean;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const url = `${TELEGRAM_API_BASE}${config.botToken}/editMessageText`;

    const body: Record<string, unknown> = {
      chat_id: config.chatId,
      message_id: messageId,
      text: newText,
      parse_mode: options?.parseMode || "HTML",
    };

    // Remove inline keyboard if requested
    if (options?.removeKeyboard) {
      body.reply_markup = { inline_keyboard: [] };
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json() as {
      ok: boolean;
      description?: string;
    };

    if (data.ok) {
      return { success: true };
    } else {
      return { success: false, error: data.description || "Unknown error" };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

/**
 * Validate Telegram credentials by sending a test message
 */
export async function validateCredentials(
  config: TelegramClientConfig
): Promise<{ valid: boolean; error?: string }> {
  const result = await sendMessage(config, "🍩 Donut CLI connected successfully!", {
    disableNotification: true,
  });

  return {
    valid: result.success,
    error: result.error,
  };
}

// ============================================================================
// Webhook Server for Telegram Callbacks
// ============================================================================

/**
 * Telegram callback query structure from inline keyboard buttons
 */
interface TelegramCallbackQuery {
  id: string;
  from: { id: number; username?: string };
  message?: { message_id: number; chat: { id: number } };
  data?: string;
}

/**
 * Telegram update structure (simplified for callback_query)
 */
interface TelegramUpdate {
  update_id: number;
  callback_query?: TelegramCallbackQuery;
}

let webhookServer: Server | null = null;

/**
 * Answer a callback query to acknowledge button click
 */
async function answerCallbackQuery(
  config: TelegramClientConfig,
  callbackQueryId: string,
  text?: string
): Promise<void> {
  try {
    const url = `${TELEGRAM_API_BASE}${config.botToken}/answerCallbackQuery`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: text || "Received",
      }),
    });
  } catch {
    // Ignore errors for callback acknowledgment
  }
}

/**
 * Start a webhook server to receive Telegram updates
 * @param port - Port to listen on
 * @param config - Telegram client config for answering callbacks
 * @returns Promise resolving when server is started
 */
export function startWebhookServer(
  port: number,
  config: TelegramClientConfig
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    if (webhookServer) {
      resolve({ success: true }); // Already running
      return;
    }

    webhookServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      // Only accept POST requests
      if (req.method !== "POST") {
        res.writeHead(405);
        res.end("Method Not Allowed");
        return;
      }

      // Parse request body
      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString();
      });

      req.on("end", async () => {
        try {
          const update: TelegramUpdate = JSON.parse(body);

          // Handle callback_query (button clicks)
          if (update.callback_query) {
            const query = update.callback_query;
            const data = query.data || "";

            // Parse callback data format: "action:tradeId"
            const [action, tradeId] = data.split(":");

            if (tradeId && (action === "approve" || action === "reject")) {
              const pending = pendingApprovals.get(tradeId);

              if (pending && !pending.used) {
                // Mark as used (one-time)
                pending.used = true;

                // Resolve the waiting promise
                const response: ApprovalResponse = action === "approve" ? "APPROVE" : "REJECT";
                pending.resolve(response);

                // Update the message to show result
                if (query.message) {
                  const statusEmoji = action === "approve" ? "✅" : "❌";
                  const statusText = action === "approve" ? "APPROVED" : "REJECTED";
                  await editMessage(
                    config,
                    query.message.message_id,
                    `${statusEmoji} Trade ${statusText}\n\n🆔 <code>${tradeId.slice(0, 8)}...</code>`,
                    { removeKeyboard: true }
                  );
                }

                // Answer callback to remove loading state
                await answerCallbackQuery(config, query.id, `Trade ${action}d`);

                // Clean up
                pendingApprovals.delete(tradeId);
              } else {
                // Trade already processed or expired
                await answerCallbackQuery(config, query.id, "Trade already processed or expired");
              }
            }
          }

          res.writeHead(200);
          res.end("OK");
        } catch {
          res.writeHead(400);
          res.end("Bad Request");
        }
      });
    });

    webhookServer.on("error", (err) => {
      resolve({ success: false, error: err.message });
    });

    webhookServer.listen(port, () => {
      resolve({ success: true });
    });
  });
}

/**
 * Stop the webhook server
 */
export function stopWebhookServer(): Promise<void> {
  return new Promise((resolve) => {
    if (webhookServer) {
      webhookServer.close(() => {
        webhookServer = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}

/**
 * Wait for a trade approval response
 * @param tradeId - UUID of the trade
 * @param messageId - Telegram message ID for the approval request
 * @param timeoutMs - Timeout in milliseconds (default 60 seconds)
 * @returns Promise resolving to the approval response
 */
export function waitForApproval(
  tradeId: string,
  messageId: number,
  timeoutMs: number = 60000
): Promise<ApprovalResponse> {
  return new Promise((resolve) => {
    const expiresAt = Date.now() + timeoutMs;

    // Store pending approval
    pendingApprovals.set(tradeId, {
      tradeId,
      messageId,
      expiresAt,
      resolve,
      used: false,
    });
  });
}

/**
 * Request trade approval and wait for response
 * Combines sendTradeApproval and waitForApproval for convenience
 */
export async function requestApprovalAndWait(
  config: TelegramClientConfig,
  approval: TradeApprovalRequest
): Promise<{ response: ApprovalResponse; error?: string }> {
  // Send the approval message
  const result = await sendTradeApproval(config, approval);

  if (!result.success || !result.messageId) {
    return { response: "EXPIRED", error: result.error || "Failed to send approval request" };
  }

  // Calculate remaining timeout
  const remainingMs = Math.max(0, approval.expiresAt - Date.now());

  // Wait for response
  const response = await waitForApproval(approval.tradeId, result.messageId, remainingMs);

  return { response };
}

/**
 * Send a notification for risk manager events
 */
export async function sendRiskAlert(
  config: TelegramClientConfig,
  alertType: "circuit_breaker" | "daily_loss_limit" | "position_limit" | "approval_needed",
  details: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  let message: string;

  switch (alertType) {
    case "circuit_breaker":
      message = `
<b>🛑 CIRCUIT BREAKER TRIPPED</b>

Trading has been automatically disabled after ${details.consecutiveLosses} consecutive losing trades.

⏱ Cooldown: ${details.cooldownMinutes} minutes
🔄 Trading will resume at: ${details.resumeTime}
      `.trim();
      break;

    case "daily_loss_limit":
      message = `
<b>⚠️ DAILY LOSS LIMIT REACHED</b>

Loss: $${Number(details.dailyLoss).toFixed(2)}
Limit: $${Number(details.maxDailyLoss).toFixed(2)}

Trading is blocked for the rest of the day.
      `.trim();
      break;

    case "position_limit":
      message = `
<b>⚠️ POSITION LIMIT REACHED</b>

Open Positions: ${details.currentPositions}
Max Allowed: ${details.maxPositions}

Close a position before opening new ones.
      `.trim();
      break;

    case "approval_needed":
      message = `
<b>🔔 Trade Approval Needed</b>

Symbol: ${details.symbol}
Side: ${details.side}
Size: ${details.quantity}
Leverage: ${details.leverage}x

Reply with /approve ${details.requestId} or /reject ${details.requestId}
      `.trim();
      break;

    default:
      message = `Risk alert: ${JSON.stringify(details)}`;
  }

  return sendMessage(config, message);
}

/**
 * Format a notification message for different event types
 */
export function formatNotification(
  type: "trade_executed" | "position_closed" | "alert" | "error",
  data: Record<string, unknown>
): string {
  switch (type) {
    case "trade_executed":
      return `
<b>✅ Trade Executed</b>

${data.side === "long" ? "📈" : "📉"} <b>${String(data.side).toUpperCase()}</b> ${data.symbol}
💰 Size: ${Number(data.size).toFixed(4)}
💵 Price: $${Number(data.price).toFixed(2)}
      `.trim();

    case "position_closed":
      const pnl = Number(data.pnl);
      const pnlEmoji = pnl >= 0 ? "💚" : "🔴";
      return `
<b>📊 Position Closed</b>

${data.side === "long" ? "📈" : "📉"} ${data.symbol}
${pnlEmoji} PnL: ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}
      `.trim();

    case "alert":
      return `
<b>⚠️ Alert</b>

${data.message}
      `.trim();

    case "error":
      return `
<b>❌ Error</b>

${data.message}
      `.trim();

    default:
      return String(data.message || "Unknown notification");
  }
}
