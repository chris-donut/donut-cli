/**
 * Tests for TUI command parsing
 */

import {
  parseInput,
  getCommand,
  getAllCommands,
} from "../../tui/commands.js";

describe("Command Parsing", () => {
  describe("parseInput", () => {
    it("should identify slash commands", () => {
      const result = parseInput("/help");
      expect(result.isCommand).toBe(true);
      expect(result.command).toBe("help");
      expect(result.args).toBe("");
    });

    it("should parse command with arguments", () => {
      const result = parseInput("/strategy Build a momentum strategy");
      expect(result.isCommand).toBe(true);
      expect(result.command).toBe("strategy");
      expect(result.args).toBe("Build a momentum strategy");
    });

    it("should handle lowercase conversion", () => {
      const result = parseInput("/HELP");
      expect(result.command).toBe("help");
    });

    it("should identify non-commands", () => {
      const result = parseInput("Hello world");
      expect(result.isCommand).toBe(false);
      expect(result.command).toBe("");
      expect(result.args).toBe("Hello world");
    });

    it("should handle empty input", () => {
      const result = parseInput("");
      expect(result.isCommand).toBe(false);
      expect(result.args).toBe("");
    });

    it("should trim whitespace", () => {
      const result = parseInput("  /help  ");
      expect(result.isCommand).toBe(true);
      expect(result.command).toBe("help");
    });

    it("should handle command with only spaces after", () => {
      const result = parseInput("/help   ");
      expect(result.isCommand).toBe(true);
      expect(result.command).toBe("help");
      expect(result.args).toBe("");
    });
  });

  describe("getCommand", () => {
    it("should find registered commands", () => {
      const cmd = getCommand("help");
      expect(cmd).toBeDefined();
      expect(cmd?.name).toBe("help");
    });

    it("should find commands by alias", () => {
      const cmd = getCommand("h");
      expect(cmd).toBeDefined();
      expect(cmd?.name).toBe("help");
    });

    it("should be case-insensitive", () => {
      const cmd = getCommand("HELP");
      expect(cmd).toBeDefined();
    });

    it("should return undefined for unknown commands", () => {
      const cmd = getCommand("unknowncommand");
      expect(cmd).toBeUndefined();
    });
  });

  describe("getAllCommands", () => {
    it("should return all unique commands", () => {
      const commands = getAllCommands();
      expect(commands.length).toBeGreaterThan(0);

      // Check that known commands exist
      const names = commands.map((c) => c.name);
      expect(names).toContain("help");
      expect(names).toContain("strategy");
      expect(names).toContain("backtest");
      expect(names).toContain("quit");
    });

    it("should not include duplicates from aliases", () => {
      const commands = getAllCommands();
      const names = commands.map((c) => c.name);
      const uniqueNames = [...new Set(names)];
      expect(names.length).toBe(uniqueNames.length);
    });
  });
});

describe("Command Handlers", () => {
  describe("strategyHandler", () => {
    it("should return agent action with default prompt", async () => {
      const cmd = getCommand("strategy");
      const result = await cmd!.handler("");

      expect(result.continue).toBe(true);
      expect(result.action).toBe("agent");
      expect(result.agentType).toBe("STRATEGY_BUILDER");
      expect(result.prompt).toBeDefined();
    });

    it("should use provided prompt", async () => {
      const cmd = getCommand("strategy");
      const result = await cmd!.handler("Build a scalping strategy");

      expect(result.prompt).toBe("Build a scalping strategy");
    });
  });

  describe("backtestHandler", () => {
    it("should return agent action", async () => {
      const cmd = getCommand("backtest");
      const result = await cmd!.handler("");

      expect(result.action).toBe("agent");
      expect(result.agentType).toBe("BACKTEST_ANALYST");
    });

    it("should detect run ID pattern", async () => {
      const cmd = getCommand("backtest");
      const result = await cmd!.handler("bt_abc123");

      expect(result.prompt).toContain("bt_abc123");
    });
  });

  describe("analyzeHandler", () => {
    it("should require run ID argument", async () => {
      const cmd = getCommand("analyze");
      const result = await cmd!.handler("");

      expect(result.action).toBe("none");
      expect(result.message).toContain("Usage");
    });

    it("should create analysis prompt with run ID", async () => {
      const cmd = getCommand("analyze");
      const result = await cmd!.handler("run123");

      expect(result.action).toBe("agent");
      expect(result.prompt).toContain("run123");
    });
  });

  describe("helpHandler", () => {
    it("should return direct action", async () => {
      const cmd = getCommand("help");
      const result = await cmd!.handler("");

      expect(result.action).toBe("direct");
      expect(result.message).toBe("help");
    });
  });

  describe("quitHandler", () => {
    it("should return exit action", async () => {
      const cmd = getCommand("quit");
      const result = await cmd!.handler("");

      expect(result.continue).toBe(false);
      expect(result.action).toBe("exit");
    });
  });

  describe("statusHandler", () => {
    it("should return direct action", async () => {
      const cmd = getCommand("status");
      const result = await cmd!.handler("");

      expect(result.action).toBe("direct");
      expect(result.message).toBe("status");
    });
  });

  describe("clearHandler", () => {
    it("should return direct action", async () => {
      const cmd = getCommand("clear");
      const result = await cmd!.handler("");

      expect(result.action).toBe("direct");
      expect(result.message).toBe("clear");
    });
  });

  describe("resumeHandler", () => {
    it("should require session ID argument", async () => {
      const cmd = getCommand("resume");
      const result = await cmd!.handler("");

      expect(result.action).toBe("none");
      expect(result.message).toContain("Usage");
    });

    it("should return direct action with session ID", async () => {
      const cmd = getCommand("resume");
      const result = await cmd!.handler("session123");

      expect(result.action).toBe("direct");
      expect(result.message).toBe("resume:session123");
    });
  });
});
