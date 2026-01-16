/**
 * TUI Commands - Slash command parser and registry
 *
 * Handles parsing and routing of slash commands like /strategy, /backtest
 */

// ============================================================================
// Types
// ============================================================================

export type CommandHandler = (args: string) => Promise<CommandResult>;

export interface CommandResult {
  /** Whether to continue the REPL loop */
  continue: boolean;
  /** Type of action taken */
  action: "agent" | "direct" | "exit" | "none";
  /** Agent type if action is "agent" */
  agentType?: string;
  /** Prompt to send to agent */
  prompt?: string;
  /** Message to display (for direct handlers) */
  message?: string;
}

export interface SlashCommand {
  /** Command name (without the /) */
  name: string;
  /** Aliases for the command */
  aliases?: string[];
  /** Short description */
  description: string;
  /** Handler function */
  handler: CommandHandler;
}

// ============================================================================
// Command Parsing
// ============================================================================

/**
 * Parse user input and determine if it's a slash command
 */
export function parseInput(input: string): { isCommand: boolean; command: string; args: string } {
  const trimmed = input.trim();

  if (trimmed.startsWith("/")) {
    const spaceIndex = trimmed.indexOf(" ");
    if (spaceIndex === -1) {
      return {
        isCommand: true,
        command: trimmed.slice(1).toLowerCase(),
        args: "",
      };
    }
    return {
      isCommand: true,
      command: trimmed.slice(1, spaceIndex).toLowerCase(),
      args: trimmed.slice(spaceIndex + 1).trim(),
    };
  }

  return {
    isCommand: false,
    command: "",
    args: trimmed,
  };
}

// ============================================================================
// Command Registry
// ============================================================================

const commandRegistry = new Map<string, SlashCommand>();

/**
 * Register a slash command
 */
export function registerCommand(command: SlashCommand): void {
  commandRegistry.set(command.name, command);
  if (command.aliases) {
    for (const alias of command.aliases) {
      commandRegistry.set(alias, command);
    }
  }
}

/**
 * Get a command by name
 */
export function getCommand(name: string): SlashCommand | undefined {
  return commandRegistry.get(name.toLowerCase());
}

/**
 * Get all registered commands (unique, no aliases)
 */
export function getAllCommands(): SlashCommand[] {
  const seen = new Set<string>();
  const commands: SlashCommand[] = [];

  for (const cmd of commandRegistry.values()) {
    if (!seen.has(cmd.name)) {
      seen.add(cmd.name);
      commands.push(cmd);
    }
  }

  return commands;
}

// ============================================================================
// Built-in Command Handlers
// ============================================================================

/** Strategy command - routes to Strategy Builder agent */
export const strategyHandler: CommandHandler = async (args) => {
  const prompt = args || "Help me build a trading strategy. Ask me about my goals and preferences.";
  return {
    continue: true,
    action: "agent",
    agentType: "STRATEGY_BUILDER",
    prompt,
  };
};

/** Backtest command - routes to Backtest Analyst agent */
export const backtestHandler: CommandHandler = async (args) => {
  let prompt: string;
  if (args) {
    // If args looks like a run ID, analyze it
    if (args.match(/^[a-f0-9-]+$/i) || args.match(/^bt_/)) {
      prompt = `Analyze the backtest results for run ID: ${args}`;
    } else {
      prompt = args;
    }
  } else {
    prompt = "Run a new backtest. Ask me about the parameters I want to use.";
  }

  return {
    continue: true,
    action: "agent",
    agentType: "BACKTEST_ANALYST",
    prompt,
  };
};

/** Analyze command - routes to Backtest Analyst for analysis */
export const analyzeHandler: CommandHandler = async (args) => {
  if (!args) {
    return {
      continue: true,
      action: "none",
      message: "Usage: /analyze <runId>\nProvide a backtest run ID to analyze.",
    };
  }

  return {
    continue: true,
    action: "agent",
    agentType: "BACKTEST_ANALYST",
    prompt: `Provide a detailed analysis of backtest run: ${args}`,
  };
};

/** Paper trading command */
export const paperHandler: CommandHandler = async (args) => {
  // For now, provide info about paper trading commands
  const message = `
Paper Trading Commands:
  donut paper start --strategy <name> --balance <amount>
  donut paper status [sessionId]
  donut paper trades [sessionId]
  donut paper stop <sessionId>
  donut paper list

Use these commands in a separate terminal, or type /quit to exit.
`;
  return {
    continue: true,
    action: "none",
    message,
  };
};

/** Status command */
export const statusHandler: CommandHandler = async () => {
  return {
    continue: true,
    action: "direct",
    message: "status", // Signal to main loop to handle
  };
};

/** Sessions list command */
export const sessionsHandler: CommandHandler = async () => {
  return {
    continue: true,
    action: "direct",
    message: "sessions",
  };
};

/** Resume command */
export const resumeHandler: CommandHandler = async (args) => {
  if (!args) {
    return {
      continue: true,
      action: "none",
      message: "Usage: /resume <sessionId>",
    };
  }
  return {
    continue: true,
    action: "direct",
    message: `resume:${args}`,
  };
};

/** Help command */
export const helpHandler: CommandHandler = async () => {
  return {
    continue: true,
    action: "direct",
    message: "help",
  };
};

/** Clear screen command */
export const clearHandler: CommandHandler = async () => {
  return {
    continue: true,
    action: "direct",
    message: "clear",
  };
};

/** Quit/exit command */
export const quitHandler: CommandHandler = async () => {
  return {
    continue: false,
    action: "exit",
    message: "Goodbye!",
  };
};

// ============================================================================
// Register Built-in Commands
// ============================================================================

registerCommand({
  name: "strategy",
  aliases: ["s", "strat"],
  description: "Build or modify a trading strategy",
  handler: strategyHandler,
});

registerCommand({
  name: "backtest",
  aliases: ["bt", "back"],
  description: "Run a new backtest or check status",
  handler: backtestHandler,
});

registerCommand({
  name: "analyze",
  aliases: ["a", "an"],
  description: "Analyze backtest results",
  handler: analyzeHandler,
});

registerCommand({
  name: "paper",
  aliases: ["p"],
  description: "Paper trading commands",
  handler: paperHandler,
});

registerCommand({
  name: "status",
  description: "Show current session status",
  handler: statusHandler,
});

registerCommand({
  name: "sessions",
  aliases: ["list"],
  description: "List all sessions",
  handler: sessionsHandler,
});

registerCommand({
  name: "resume",
  aliases: ["r"],
  description: "Resume a previous session",
  handler: resumeHandler,
});

registerCommand({
  name: "help",
  aliases: ["h", "?"],
  description: "Show help message",
  handler: helpHandler,
});

registerCommand({
  name: "clear",
  aliases: ["cls"],
  description: "Clear the screen",
  handler: clearHandler,
});

registerCommand({
  name: "quit",
  aliases: ["exit", "q"],
  description: "Exit interactive mode",
  handler: quitHandler,
});
