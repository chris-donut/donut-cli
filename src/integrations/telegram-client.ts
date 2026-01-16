/**
 * Telegram Bot API Client
 * Handles sending notifications and trade approval requests via Telegram
 */

import { TradeApprovalRequest } from "../core/types.js";

const TELEGRAM_API_BASE = "https://api.telegram.org/bot";

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
