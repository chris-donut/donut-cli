/**
 * Setup Command - Interactive first-run configuration wizard
 *
 * Now offers Turnkey authentication (Google OAuth) as the recommended
 * first option for wallet provisioning, with private key setup as
 * an advanced alternative.
 */

import { Command } from "commander";
import chalk from "chalk";
import { createInterface } from "readline";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { hasCredentials, loadCredentials } from "../../core/credentials.js";
import { getWalletServiceClient } from "../../integrations/wallet-service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, "..", "..", "..");

interface SetupStatus {
  envExists: boolean;
  apiKeyConfigured: boolean;
  apiKeyValid: boolean;
  nodeVersion: string | null;
  bunVersion: string | null;
  buildExists: boolean;
  globallyLinked: boolean;
  turnkeyAuthenticated: boolean;
  turnkeyEmail?: string;
  turnkeyWallets?: Array<{ chain: string; address: string }>;
  backendsConfigured: {
    donutAgents: boolean;
    donutBackend: boolean;
    hummingbot: boolean;
  };
}

/**
 * Safe command execution - only runs predefined commands, never user input
 */
function safeExec(command: string): string | null {
  // Whitelist of allowed commands for security
  const allowedCommands = [
    "node -v",
    "bun -v",
    "which donut",
    "where donut",
    "bun run build",
    "npm run build",
    "npm link",
  ];

  if (!allowedCommands.some((allowed) => command.startsWith(allowed))) {
    return null;
  }

  try {
    return execSync(command, { encoding: "utf-8", stdio: "pipe" }).trim();
  } catch {
    return null;
  }
}

/**
 * Get current setup status
 */
function checkStatus(): SetupStatus {
  const envPath = join(PROJECT_ROOT, ".env");
  const distPath = join(PROJECT_ROOT, "dist", "index.js");

  let envExists = existsSync(envPath);
  let apiKeyConfigured = false;
  let backendsConfigured = { donutAgents: false, donutBackend: false, hummingbot: false };

  if (envExists) {
    const envContent = readFileSync(envPath, "utf-8");
    apiKeyConfigured = /^ANTHROPIC_API_KEY=sk-ant-.+$/m.test(envContent);
    backendsConfigured.donutAgents = /^DONUT_AGENTS_URL=.+$/m.test(envContent);
    backendsConfigured.donutBackend = /^DONUT_BACKEND_URL=.+$/m.test(envContent);
    backendsConfigured.hummingbot = /^HUMMINGBOT_URL=.+$/m.test(envContent);
  }

  const nodeVersion = safeExec("node -v");
  const bunVersion = safeExec("bun -v");

  let globallyLinked = false;
  const whichDonut = safeExec("which donut") || safeExec("where donut");
  globallyLinked = !!whichDonut && whichDonut.length > 0;

  // Check Turnkey authentication status
  let turnkeyAuthenticated = false;
  let turnkeyEmail: string | undefined;
  let turnkeyWallets: Array<{ chain: string; address: string }> | undefined;

  if (hasCredentials()) {
    const credentials = loadCredentials();
    if (credentials) {
      turnkeyAuthenticated = true;
      turnkeyEmail = credentials.userEmail;
      turnkeyWallets = credentials.wallets?.map((w) => ({
        chain: w.chain,
        address: w.address,
      }));
    }
  }

  return {
    envExists,
    apiKeyConfigured,
    apiKeyValid: false, // Will be validated separately
    nodeVersion,
    bunVersion,
    buildExists: existsSync(distPath),
    globallyLinked,
    turnkeyAuthenticated,
    turnkeyEmail,
    turnkeyWallets,
    backendsConfigured,
  };
}

/**
 * Print status with colors
 */
function printStatus(status: SetupStatus): void {
  console.log(chalk.bold("\nSetup Status\n"));
  console.log(chalk.gray("─".repeat(50)));

  // Environment
  console.log(chalk.bold("\nEnvironment"));
  console.log(
    `  Node.js:     ${status.nodeVersion ? chalk.green(status.nodeVersion) : chalk.red("Not found")}`
  );
  console.log(
    `  Bun:         ${status.bunVersion ? chalk.green(`v${status.bunVersion}`) : chalk.yellow("Not found (optional)")}`
  );

  // Authentication (Turnkey)
  console.log(chalk.bold("\nWallet Authentication"));
  if (status.turnkeyAuthenticated) {
    console.log(
      `  Turnkey:     ${chalk.green("✓ Authenticated")} ${chalk.gray(`(${status.turnkeyEmail})`)}`
    );
    if (status.turnkeyWallets && status.turnkeyWallets.length > 0) {
      for (const wallet of status.turnkeyWallets) {
        const shortAddr = `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`;
        console.log(
          `    ${chalk.cyan(wallet.chain.toUpperCase())}: ${chalk.gray(shortAddr)}`
        );
      }
    }
  } else {
    console.log(
      `  Turnkey:     ${chalk.yellow("✗ Not authenticated")} ${chalk.gray("(run 'donut auth login')")}`
    );
  }

  // Configuration
  console.log(chalk.bold("\nConfiguration"));
  console.log(
    `  .env file:   ${status.envExists ? chalk.green("✓ Exists") : chalk.yellow("✗ Missing")}`
  );
  console.log(
    `  API key:     ${status.apiKeyConfigured ? chalk.green("✓ Configured") : chalk.yellow("✗ Not set")}`
  );

  // Build
  console.log(chalk.bold("\nBuild"));
  console.log(
    `  Compiled:    ${status.buildExists ? chalk.green("✓ Ready") : chalk.yellow("✗ Run 'bun run build'")}`
  );
  console.log(
    `  Global CLI:  ${status.globallyLinked ? chalk.green("✓ 'donut' available") : chalk.gray("✗ Run 'npm link' to enable")}`
  );

  // Backends
  console.log(chalk.bold("\nBackends (Optional)"));
  console.log(
    `  Donut Agents:  ${status.backendsConfigured.donutAgents ? chalk.green("✓ Configured") : chalk.gray("Not configured")}`
  );
  console.log(
    `  Donut Backend: ${status.backendsConfigured.donutBackend ? chalk.green("✓ Configured") : chalk.gray("Not configured")}`
  );
  console.log(
    `  Hummingbot:    ${status.backendsConfigured.hummingbot ? chalk.green("✓ Configured") : chalk.gray("Not configured")}`
  );

  console.log("\n" + chalk.gray("─".repeat(50)));
}

/**
 * Prompt for user input
 */
async function prompt(question: string, defaultValue?: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const defaultText = defaultValue ? ` (${defaultValue})` : "";

  return new Promise((resolve) => {
    rl.question(`${question}${defaultText}: `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue || "");
    });
  });
}

/**
 * Prompt for yes/no
 */
async function confirm(question: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? "[Y/n]" : "[y/N]";
  const answer = await prompt(`${question} ${hint}`, defaultYes ? "y" : "n");
  return answer.toLowerCase().startsWith("y");
}

/**
 * Create or update .env file
 */
function ensureEnvFile(): void {
  const envPath = join(PROJECT_ROOT, ".env");
  const examplePath = join(PROJECT_ROOT, ".env.example");

  if (!existsSync(envPath)) {
    if (existsSync(examplePath)) {
      const content = readFileSync(examplePath, "utf-8");
      writeFileSync(envPath, content);
      console.log(chalk.green("✓ Created .env from template"));
    } else {
      writeFileSync(
        envPath,
        `# Donut CLI Configuration
# Generated by 'donut setup'

# Required: Anthropic API Key
ANTHROPIC_API_KEY=

# Optional: Donut Agents Backend (AI trading agents)
DONUT_AGENTS_URL=
DONUT_AGENTS_AUTH_TOKEN=

# Optional: Donut Backend (Solana DeFi)
DONUT_BACKEND_URL=
DONUT_BACKEND_AUTH_TOKEN=

# Optional: Hummingbot API (multi-exchange trading)
HUMMINGBOT_URL=
HUMMINGBOT_USERNAME=
HUMMINGBOT_PASSWORD=

# Settings
LOG_LEVEL=info
SESSION_DIR=.sessions
`
      );
      console.log(chalk.green("✓ Created .env file"));
    }
  }
}

/**
 * Update a value in .env file
 */
function updateEnvValue(key: string, value: string): void {
  const envPath = join(PROJECT_ROOT, ".env");
  let content = readFileSync(envPath, "utf-8");

  const regex = new RegExp(`^${key}=.*$`, "m");
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    content += `\n${key}=${value}`;
  }

  writeFileSync(envPath, content);
}

/**
 * Validate API key by making a test request
 */
async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    return response.ok || response.status === 400; // 400 means key is valid but request is malformed (ok for validation)
  } catch {
    return false;
  }
}

/**
 * Run interactive setup wizard
 * Exported for use from other modules (e.g., first-run detection)
 */
export async function runSetupWizard(): Promise<void> {
  console.log(chalk.cyan("\n╔══════════════════════════════════════════════════╗"));
  console.log(chalk.cyan("║          Donut CLI Setup Wizard                   ║"));
  console.log(chalk.cyan("╚══════════════════════════════════════════════════╝\n"));

  let status = checkStatus();

  // Step 1: Create .env if needed
  console.log(chalk.bold("Step 1: Environment Configuration\n"));

  if (!status.envExists) {
    ensureEnvFile();
  } else {
    console.log(chalk.green("✓ .env file exists"));
  }

  // Step 2: Wallet Authentication (Turnkey)
  console.log(chalk.bold("\nStep 2: Wallet Authentication\n"));

  if (!status.turnkeyAuthenticated) {
    console.log(chalk.cyan("  Login with Google (Recommended)"));
    console.log(chalk.gray("    Automatically provisions secure HSM-backed wallets"));
    console.log(chalk.gray("    No private key management required\n"));
    console.log(chalk.gray("  Or configure private keys manually (Advanced)"));
    console.log(chalk.gray("    Set SOLANA_PRIVATE_KEY, BASE_PRIVATE_KEY in .env\n"));

    const useGoogleLogin = await confirm("Login with Google?", true);

    if (useGoogleLogin) {
      console.log(chalk.gray("\nStarting Google OAuth flow..."));
      try {
        // Import the auth handler dynamically to avoid circular dependencies
        const { handleLogin } = await import("./auth.js");
        await handleLogin();

        // Re-check status after login
        status = checkStatus();

        if (status.turnkeyAuthenticated) {
          console.log(chalk.green("\n✓ Wallet authentication complete!"));
          if (status.turnkeyWallets && status.turnkeyWallets.length > 0) {
            console.log(chalk.gray("  Your wallet addresses:"));
            for (const wallet of status.turnkeyWallets) {
              const shortAddr = `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`;
              console.log(`    ${chalk.cyan(wallet.chain.toUpperCase())}: ${shortAddr}`);
            }
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(chalk.yellow(`\n! Google login skipped: ${message}`));
        console.log(chalk.gray("  You can run 'donut auth login' later."));
      }
    } else {
      console.log(chalk.gray("\nSkipped. Configure private keys in .env for manual wallet setup."));
      console.log(chalk.gray("Or run 'donut auth login' later to use Google authentication."));
    }
  } else {
    console.log(chalk.green(`✓ Authenticated as ${status.turnkeyEmail}`));
    if (status.turnkeyWallets && status.turnkeyWallets.length > 0) {
      for (const wallet of status.turnkeyWallets) {
        const shortAddr = `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`;
        console.log(`  ${chalk.cyan(wallet.chain.toUpperCase())}: ${chalk.gray(shortAddr)}`);
      }
    }
  }

  // Step 3: Configure API key
  console.log(chalk.bold("\nStep 3: API Key Configuration\n"));

  if (!status.apiKeyConfigured) {
    console.log(chalk.yellow("An Anthropic API key is required for AI features."));
    console.log(chalk.gray("Get one at: https://console.anthropic.com/settings/keys\n"));

    const apiKey = await prompt("Enter your API key (or press Enter to skip)");

    if (apiKey && apiKey.startsWith("sk-ant-")) {
      console.log(chalk.gray("\nValidating API key..."));
      const isValid = await validateApiKey(apiKey);

      if (isValid) {
        updateEnvValue("ANTHROPIC_API_KEY", apiKey);
        console.log(chalk.green("✓ API key validated and saved"));
      } else {
        console.log(chalk.yellow("! Could not validate key (network issue?), saving anyway"));
        updateEnvValue("ANTHROPIC_API_KEY", apiKey);
      }
    } else if (apiKey) {
      console.log(chalk.red("Invalid key format. Keys start with 'sk-ant-'"));
    } else {
      console.log(chalk.gray("Skipped. Demo mode will still work."));
    }
  } else {
    console.log(chalk.green("✓ API key already configured"));
  }

  // Step 4: Optional backends
  console.log(chalk.bold("\nStep 4: Backend Configuration (Optional)\n"));
  console.log(chalk.gray("Backends enable live trading and backtesting features."));
  console.log(chalk.gray("Skip this if you're just exploring.\n"));

  const configureBackends = await confirm("Configure backend URLs?", false);

  if (configureBackends) {
    console.log(chalk.gray("\nLeave blank to skip each backend.\n"));

    // Donut Agents Backend
    console.log(chalk.bold("Donut Agents Backend") + chalk.gray(" (AI trading agents - port 8080)"));
    const donutAgentsUrl = await prompt(
      "  URL",
      status.backendsConfigured.donutAgents ? undefined : ""
    );
    if (donutAgentsUrl) {
      updateEnvValue("DONUT_AGENTS_URL", donutAgentsUrl);
      const agentsToken = await prompt("  Auth Token (JWT)", "");
      if (agentsToken) {
        updateEnvValue("DONUT_AGENTS_AUTH_TOKEN", agentsToken);
      }
      console.log(chalk.green("✓ Donut Agents configured"));
    }

    // Donut Backend
    console.log(chalk.bold("\nDonut Backend") + chalk.gray(" (Solana DeFi - port 3000)"));
    const donutBackendUrl = await prompt(
      "  URL",
      status.backendsConfigured.donutBackend ? undefined : ""
    );
    if (donutBackendUrl) {
      updateEnvValue("DONUT_BACKEND_URL", donutBackendUrl);
      const backendToken = await prompt("  Auth Token (JWT)", "");
      if (backendToken) {
        updateEnvValue("DONUT_BACKEND_AUTH_TOKEN", backendToken);
      }
      console.log(chalk.green("✓ Donut Backend configured"));
    }

    // Hummingbot API
    console.log(chalk.bold("\nHummingbot API") + chalk.gray(" (multi-exchange trading - port 8000)"));
    const hummingbotUrl = await prompt(
      "  URL",
      status.backendsConfigured.hummingbot ? undefined : ""
    );
    if (hummingbotUrl) {
      updateEnvValue("HUMMINGBOT_URL", hummingbotUrl);
      const hbUsername = await prompt("  Username", "admin");
      updateEnvValue("HUMMINGBOT_USERNAME", hbUsername);
      const hbPassword = await prompt("  Password", "admin");
      updateEnvValue("HUMMINGBOT_PASSWORD", hbPassword);
      console.log(chalk.green("✓ Hummingbot configured"));
    }
  }

  // Step 5: Build if needed
  console.log(chalk.bold("\nStep 5: Build Project\n"));

  if (!status.buildExists) {
    const shouldBuild = await confirm("Build the project now?", true);

    if (shouldBuild) {
      console.log(chalk.gray("\nBuilding..."));
      try {
        const buildCmd = status.bunVersion ? "bun run build" : "npm run build";
        execSync(buildCmd, { cwd: PROJECT_ROOT, stdio: "inherit" });
        console.log(chalk.green("\n✓ Build complete"));
      } catch {
        console.log(chalk.red("\n✗ Build failed. Run 'bun run build' manually."));
      }
    }
  } else {
    console.log(chalk.green("✓ Project already built"));
  }

  // Step 6: Global installation
  console.log(chalk.bold("\nStep 6: Global CLI Installation\n"));

  if (!status.globallyLinked) {
    const shouldLink = await confirm("Install 'donut' command globally?", true);

    if (shouldLink) {
      try {
        execSync("npm link", { cwd: PROJECT_ROOT, stdio: "inherit" });
        console.log(chalk.green("\n✓ 'donut' command installed globally"));
      } catch {
        console.log(chalk.yellow("\n! Failed to link. Try 'sudo npm link' manually."));
      }
    }
  } else {
    console.log(chalk.green("✓ 'donut' command already available"));
  }

  // Complete - show contextual next steps based on what was configured
  console.log(chalk.bold.green("\n✨ Setup Complete!\n"));
  console.log(chalk.gray("─".repeat(50)));

  // Re-check status to see what was configured
  const finalStatus = checkStatus();

  console.log(chalk.bold("\nRecommended Next Steps:"));

  if (finalStatus.apiKeyConfigured) {
    // API key is configured - suggest real commands
    console.log(`  ${chalk.green("1.")} ${chalk.cyan("donut chat")}          Start AI assistant`);
    if (finalStatus.backendsConfigured.hummingbot) {
      console.log(`  ${chalk.green("2.")} ${chalk.cyan("donut backtest run")} Run your first backtest`);
      console.log(`  ${chalk.green("3.")} ${chalk.cyan("donut strategy build")} Create a trading strategy`);
    } else {
      console.log(`  ${chalk.green("2.")} ${chalk.cyan("donut demo tour")}     Explore features in demo mode`);
      console.log(chalk.gray("\n  Configure Hummingbot for backtesting: donut setup wizard"));
    }
  } else {
    // No API key - suggest demo first
    console.log(`  ${chalk.green("1.")} ${chalk.cyan("donut demo tour")}     Learn the CLI without API key`);
    console.log(`  ${chalk.green("2.")} Get an API key at: ${chalk.underline("https://console.anthropic.com/settings/keys")}`);
    console.log(`  ${chalk.green("3.")} ${chalk.cyan("donut setup wizard")}  Come back to configure it`);
  }

  console.log();

  // Offer to start demo tour immediately if no API key
  if (!finalStatus.apiKeyConfigured) {
    const startDemo = await confirm("Would you like to start the demo tour now?", true);
    if (startDemo) {
      console.log();
      // Dynamically import to avoid circular dependencies
      const { startInteractiveDemo } = await import("../../demo/index.js");
      await startInteractiveDemo({});
    }
  }
}

/**
 * Register setup commands on the program
 */
export function registerSetupCommands(program: Command): void {
  const setup = program
    .command("setup")
    .description("First-run setup wizard and configuration");

  setup
    .command("wizard", { isDefault: true })
    .description("Run interactive setup wizard")
    .action(async () => {
      await runSetupWizard();
    });

  setup
    .command("status")
    .description("Check current setup status")
    .action(() => {
      const status = checkStatus();
      printStatus(status);

      // Provide next steps
      if (!status.apiKeyConfigured) {
        console.log(chalk.yellow("\nNext step: Configure your API key"));
        console.log(chalk.gray("  Run: donut setup wizard"));
        console.log(
          chalk.gray("  Or manually add ANTHROPIC_API_KEY to .env")
        );
      } else if (!status.buildExists) {
        console.log(chalk.yellow("\nNext step: Build the project"));
        console.log(chalk.gray("  Run: bun run build"));
      } else {
        console.log(chalk.green("\n✓ Ready to use! Try 'donut demo tour'"));
      }
    });

  setup
    .command("env")
    .description("Create .env file from template")
    .action(() => {
      ensureEnvFile();
      console.log(chalk.green("\n✓ .env file ready"));
      console.log(chalk.gray("\nEdit .env to add your ANTHROPIC_API_KEY"));
    });

  setup
    .command("validate")
    .description("Validate API key and configuration")
    .action(async () => {
      const status = checkStatus();

      if (!status.apiKeyConfigured) {
        console.log(chalk.red("\n✗ No API key configured in .env"));
        return;
      }

      console.log(chalk.gray("\nValidating API key..."));

      const envContent = readFileSync(join(PROJECT_ROOT, ".env"), "utf-8");
      const match = envContent.match(/^ANTHROPIC_API_KEY=(.+)$/m);

      if (match && match[1]) {
        const isValid = await validateApiKey(match[1]);
        if (isValid) {
          console.log(chalk.green("✓ API key is valid"));
        } else {
          console.log(chalk.red("✗ API key validation failed"));
          console.log(chalk.gray("  Check your key at: https://console.anthropic.com/"));
        }
      }
    });
}
