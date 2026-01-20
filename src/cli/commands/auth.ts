/**
 * Auth Commands - Turnkey Wallet Authentication
 *
 * Commands for OAuth-based authentication with donut-wallet-service.
 * Enables secure Turnkey wallet management without exposing private keys.
 *
 * Commands:
 * - donut auth login   - Authenticate via Google OAuth
 * - donut auth status  - Check authentication status
 * - donut auth logout  - Clear stored credentials
 * - donut auth wallets - List linked wallets
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { createServer } from "http";
import { createInterface } from "readline";
import { exec } from "child_process";
import { promisify } from "util";

import {
  loadCredentials,
  clearCredentials,
  hasCredentials,
  getTokenExpiryInfo,
  getCredentialsPath,
} from "../../core/credentials.js";
import {
  WalletServiceClient,
  getWalletServiceClient,
  ServiceUnavailableError,
  TokenExpiredError,
} from "../../integrations/wallet-service.js";

const execAsync = promisify(exec);

// OAuth callback port - must match redirect_uri registered with Google
const OAUTH_CALLBACK_PORT = 9876;
const OAUTH_REDIRECT_URI = `http://localhost:${OAUTH_CALLBACK_PORT}/callback`;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Open URL in default browser (cross-platform)
 */
async function openBrowser(url: string): Promise<void> {
  const platform = process.platform;

  try {
    if (platform === "darwin") {
      await execAsync(`open "${url}"`);
    } else if (platform === "win32") {
      await execAsync(`start "" "${url}"`);
    } else {
      // Linux and others
      await execAsync(`xdg-open "${url}"`);
    }
  } catch {
    // If automatic open fails, user will need to copy/paste
    throw new Error("Could not open browser automatically");
  }
}

/**
 * Start local HTTP server to receive OAuth callback
 */
function startCallbackServer(): Promise<{ code: string; server: ReturnType<typeof createServer> }> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url || "", `http://localhost:${OAUTH_CALLBACK_PORT}`);

      if (url.pathname === "/callback") {
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");

        if (error) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1 style="color: #dc2626;">Authentication Failed</h1>
                <p>Error: ${error}</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);
          reject(new Error(`OAuth error: ${error}`));
          return;
        }

        if (!code) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1 style="color: #dc2626;">Authentication Failed</h1>
                <p>No authorization code received.</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);
          reject(new Error("No authorization code received"));
          return;
        }

        // Success - show confirmation page
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`
          <html>
            <body style="font-family: system-ui; padding: 40px; text-align: center;">
              <h1 style="color: #16a34a;">Authentication Successful!</h1>
              <p>You can close this window and return to the terminal.</p>
              <script>setTimeout(() => window.close(), 2000);</script>
            </body>
          </html>
        `);

        resolve({ code, server });
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    server.listen(OAUTH_CALLBACK_PORT, () => {
      // Server started, waiting for callback
    });

    // Timeout after 2 minutes
    setTimeout(() => {
      server.close();
      reject(new Error("Authentication timed out. Please try again."));
    }, 120000);
  });
}

// ============================================================================
// Auth Login Command
// ============================================================================

export async function handleLogin(): Promise<void> {
  const client = getWalletServiceClient();

  // Check if wallet service is available
  const spinner = ora("Checking wallet service...").start();

  const isHealthy = await client.healthCheck();
  if (!isHealthy) {
    spinner.fail("Wallet service unavailable");
    console.log(chalk.gray(`\nService URL: ${client.getServiceUrl()}`));
    console.log(chalk.yellow("\nMake sure donut-wallet-service is running."));
    console.log(chalk.gray("Set WALLET_SERVICE_URL environment variable if using a different address."));
    return;
  }

  spinner.succeed("Wallet service connected");

  // Check if already authenticated
  const existing = loadCredentials();
  if (existing) {
    const expiryInfo = getTokenExpiryInfo(existing);
    if (!expiryInfo.isExpired) {
      console.log(chalk.yellow(`\nAlready logged in as ${chalk.cyan(existing.userEmail)}`));
      console.log(chalk.gray(`Token expires in ${expiryInfo.timeRemaining}`));

      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const answer = await new Promise<string>((resolve) => {
        rl.question(chalk.gray("Re-authenticate? [y/N]: "), resolve);
      });
      rl.close();

      if (!answer.toLowerCase().startsWith("y")) {
        console.log(chalk.gray("Keeping existing authentication."));
        return;
      }
    }
  }

  // Get OAuth URL
  spinner.start("Preparing authentication...");

  let authUrl: string;
  try {
    authUrl = await client.getGoogleAuthUrl(OAUTH_REDIRECT_URI);
  } catch (error) {
    spinner.fail("Failed to get authentication URL");
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    return;
  }

  spinner.succeed("Authentication ready");

  // Start callback server
  console.log(chalk.bold("\nOpening browser for Google authentication...\n"));

  let callbackPromise: ReturnType<typeof startCallbackServer>;
  try {
    callbackPromise = startCallbackServer();
  } catch (error) {
    console.error(chalk.red("Failed to start callback server"));
    console.error(chalk.gray(error instanceof Error ? error.message : String(error)));
    return;
  }

  // Open browser
  try {
    await openBrowser(authUrl);
    console.log(chalk.gray("If the browser didn't open, visit this URL:"));
    console.log(chalk.cyan(authUrl));
  } catch {
    console.log(chalk.yellow("Could not open browser automatically."));
    console.log(chalk.bold("\nPlease visit this URL to authenticate:"));
    console.log(chalk.cyan(authUrl));
  }

  console.log(chalk.gray("\nWaiting for authentication..."));
  console.log(chalk.gray("(Press Ctrl+C to cancel)\n"));

  // Wait for callback
  let code: string;
  let server: ReturnType<typeof createServer>;

  try {
    const result = await callbackPromise;
    code = result.code;
    server = result.server;
  } catch (error) {
    console.error(chalk.red("\nAuthentication failed:"), error instanceof Error ? error.message : String(error));
    return;
  }

  // Close callback server
  server.close();

  // Exchange code for tokens
  spinner.start("Completing authentication...");

  try {
    const credentials = await client.handleOAuthCallback(code, OAUTH_REDIRECT_URI);
    spinner.succeed("Authentication successful!");

    console.log();
    console.log(chalk.green("✓ Logged in as:"), chalk.cyan(credentials.userEmail));

    // Fetch and display wallets
    spinner.start("Loading wallets...");
    try {
      const wallets = await client.getWallets();
      spinner.succeed("Wallets loaded");

      if (wallets.length > 0) {
        console.log(chalk.bold("\nLinked Wallets:"));
        for (const wallet of wallets) {
          const chainLabel = wallet.chain === "solana" ? "Solana" : "Base (EVM)";
          console.log(`  ${chalk.gray(chainLabel + ":")} ${chalk.cyan(wallet.address)}`);
        }
      } else {
        console.log(chalk.yellow("\nNo wallets provisioned yet."));
        console.log(chalk.gray("Wallets will be created on first transaction."));
      }
    } catch (walletError) {
      spinner.warn("Could not load wallets");
      console.log(chalk.gray("Wallets will be loaded on next command."));
    }

    console.log();
    console.log(chalk.gray("Credentials saved to:"), getCredentialsPath());
    console.log();
    console.log(chalk.bold("Next steps:"));
    console.log(`  ${chalk.cyan("donut chat")}          Start trading with AI assistant`);
    console.log(`  ${chalk.cyan("donut auth status")}   Check authentication status`);
  } catch (error) {
    spinner.fail("Authentication failed");
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
  }
}

// ============================================================================
// Auth Status Command
// ============================================================================

async function handleStatus(): Promise<void> {
  const credentials = loadCredentials();

  if (!credentials) {
    console.log(chalk.yellow("\nNot logged in"));
    console.log(chalk.gray("\nRun `donut auth login` to authenticate."));
    return;
  }

  console.log(chalk.bold("\nAuthentication Status\n"));
  console.log(chalk.gray("─".repeat(50)));

  // User info
  console.log(chalk.bold("\nAccount"));
  console.log(`  Email:       ${chalk.cyan(credentials.userEmail)}`);

  // Token info
  const expiryInfo = getTokenExpiryInfo(credentials);
  console.log(chalk.bold("\nSession"));
  console.log(
    `  Status:      ${expiryInfo.isExpired ? chalk.red("Expired") : chalk.green("Active")}`
  );
  console.log(
    `  Expires:     ${expiryInfo.isExpired ? chalk.red(expiryInfo.timeRemaining) : chalk.gray(expiryInfo.timeRemaining)}`
  );

  if (expiryInfo.needsRefresh && !expiryInfo.isExpired) {
    console.log(chalk.yellow("  (Will auto-refresh on next request)"));
  }

  // Wallets
  if (credentials.wallets && credentials.wallets.length > 0) {
    console.log(chalk.bold("\nWallets"));
    for (const wallet of credentials.wallets) {
      const chainLabel = wallet.chain === "solana" ? "Solana" : "Base";
      console.log(`  ${chainLabel}:`.padEnd(12) + chalk.cyan(wallet.address));
    }
  }

  // Try to refresh wallet info if connected
  const client = getWalletServiceClient();
  const isHealthy = await client.healthCheck();

  console.log(chalk.bold("\nWallet Service"));
  console.log(`  URL:         ${chalk.gray(client.getServiceUrl())}`);
  console.log(
    `  Status:      ${isHealthy ? chalk.green("Connected") : chalk.red("Unavailable")}`
  );

  if (isHealthy && !expiryInfo.isExpired) {
    try {
      const wallets = await client.getWallets();
      if (wallets.length > (credentials.wallets?.length ?? 0)) {
        console.log(chalk.gray("\n  (Updated wallet list from service)"));
      }
    } catch {
      // Ignore - wallet list will be from cache
    }
  }

  console.log("\n" + chalk.gray("─".repeat(50)));
  console.log(chalk.gray(`\nCredentials: ${getCredentialsPath()}`));
}

// ============================================================================
// Auth Logout Command
// ============================================================================

async function handleLogout(): Promise<void> {
  if (!hasCredentials()) {
    console.log(chalk.yellow("\nNot logged in - nothing to do."));
    return;
  }

  const credentials = loadCredentials();
  const email = credentials?.userEmail || "unknown";

  const cleared = clearCredentials();

  if (cleared) {
    console.log(chalk.green(`\n✓ Logged out from ${chalk.cyan(email)}`));
    console.log(chalk.gray("\nCredentials have been cleared."));
    console.log(chalk.gray("Run `donut auth login` to authenticate again."));
  } else {
    console.log(chalk.red("\nFailed to clear credentials."));
    console.log(chalk.gray(`You may need to manually delete: ${getCredentialsPath()}`));
  }
}

// ============================================================================
// Auth Wallets Command
// ============================================================================

async function handleWallets(): Promise<void> {
  const credentials = loadCredentials();

  if (!credentials) {
    console.log(chalk.yellow("\nNot logged in"));
    console.log(chalk.gray("Run `donut auth login` to authenticate."));
    return;
  }

  const client = getWalletServiceClient();
  const spinner = ora("Fetching wallets...").start();

  try {
    const wallets = await client.getWallets();
    spinner.succeed("Wallets loaded");

    if (wallets.length === 0) {
      console.log(chalk.yellow("\nNo wallets found."));
      console.log(chalk.gray("Wallets are created automatically on first use."));
      return;
    }

    console.log(chalk.bold("\nYour Turnkey Wallets\n"));
    console.log(chalk.gray("─".repeat(60)));

    for (const wallet of wallets) {
      const chainLabel = wallet.chain === "solana" ? "Solana" : "Base (EVM)";
      const chainColor = wallet.chain === "solana" ? chalk.magenta : chalk.blue;

      console.log();
      console.log(`  ${chainColor("●")} ${chalk.bold(chainLabel)}`);
      console.log(`    Address: ${chalk.cyan(wallet.address)}`);
      if (wallet.name) {
        console.log(`    Name:    ${chalk.gray(wallet.name)}`);
      }
      console.log(`    ID:      ${chalk.gray(wallet.id)}`);

      // Try to fetch balance
      try {
        const balance = await client.getWalletBalance(wallet.id);
        console.log(`    Balance: ${chalk.green(balance.balance)} ${balance.symbol}`);
      } catch {
        console.log(`    Balance: ${chalk.gray("(could not fetch)")}`);
      }
    }

    console.log("\n" + chalk.gray("─".repeat(60)));
    console.log(chalk.gray("\nWallets are secured by Turnkey HSM - keys never leave the hardware."));
  } catch (error) {
    spinner.fail("Failed to fetch wallets");

    if (error instanceof ServiceUnavailableError) {
      console.log(chalk.red("\nWallet service unavailable."));
      console.log(chalk.gray(`Service URL: ${client.getServiceUrl()}`));
    } else if (error instanceof TokenExpiredError) {
      console.log(chalk.red("\nSession expired."));
      console.log(chalk.gray("Run `donut auth login` to re-authenticate."));
    } else {
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    }
  }
}

// ============================================================================
// Register Commands
// ============================================================================

export function registerAuthCommands(program: Command): void {
  const auth = program
    .command("auth")
    .description("Turnkey wallet authentication");

  auth
    .command("login")
    .description("Authenticate with Google OAuth")
    .action(handleLogin);

  auth
    .command("status")
    .description("Check authentication status")
    .action(handleStatus);

  auth
    .command("logout")
    .description("Clear stored credentials")
    .action(handleLogout);

  auth
    .command("wallets")
    .description("List linked Turnkey wallets")
    .action(handleWallets);
}
