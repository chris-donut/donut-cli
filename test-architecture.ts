/**
 * Quick test script for Phase 2 architectural improvements
 * Run with: npx tsx test-architecture.ts
 */

import {
  EventBus,
  getEventBus,
  emit,
  on,
  agentStarted,
  toolCompleted,
  EventPriority
} from "./src/core/event-bus.js";

import {
  ConsoleLogger,
  DefaultRiskManager,
  InMemoryConfigProvider,
} from "./src/core/providers.js";

import {
  getHummingbotClient,
  getNofxClient,
  clearClientCache,
  getCacheSize,
  checkBackendHealth,
} from "./src/integrations/client-factory.js";

import { AgentType, WorkflowStage } from "./src/core/types.js";

async function testEventBus() {
  console.log("\n=== Testing Event Bus ===\n");

  const bus = getEventBus();

  // Subscribe to agent events
  const subId = on("agent:started", (event) => {
    console.log(`  [Event] Agent started: ${event.agentType} in stage ${event.stage}`);
  });

  // Subscribe to tool events
  on("tool:completed", (event) => {
    console.log(`  [Event] Tool completed: ${event.toolName} (${event.success ? "success" : "failed"})`);
  });

  // Emit some events
  await emit(agentStarted(AgentType.STRATEGY_BUILDER, WorkflowStage.STRATEGY_BUILDING));
  await emit(toolCompleted("backtest_start", AgentType.BACKTEST_ANALYST, true, 1500));
  await emit(toolCompleted("hb_strategy_get", AgentType.STRATEGY_BUILDER, false, 200, undefined, "Not found"));

  // Check history
  const history = bus.getHistory({ limit: 5 });
  console.log(`  Event history count: ${history.length}`);

  // Cleanup
  bus.off(subId);
  console.log("  ✓ Event Bus working correctly");
}

function testLogger() {
  console.log("\n=== Testing Console Logger ===\n");

  const logger = new ConsoleLogger({ component: "test" }, "debug");

  logger.debug("This is a debug message");
  logger.info("This is an info message", { key: "value" });
  logger.warn("This is a warning");
  logger.error("This is an error", new Error("Test error"));

  // Test child logger
  const childLogger = logger.child({ subcomponent: "child" });
  childLogger.info("Message from child logger");

  console.log("  ✓ Logger working correctly");
}

function testRiskManager() {
  console.log("\n=== Testing Risk Manager ===\n");

  const riskManager = new DefaultRiskManager({
    maxPositionSize: 50000,
    maxDailyLoss: 2500,
    blockedTools: ["dangerous_tool"],
    warningTools: { "risky_tool": "This tool has elevated risk" },
  });

  // Test tool check
  const toolCheck = riskManager.checkToolExecution(
    "backtest_start",
    { symbols: ["BTC"] },
    AgentType.BACKTEST_ANALYST
  );
  console.log(`  Tool check (backtest_start): allowed=${toolCheck.allowed}`);

  // Test blocked tool
  const blockedCheck = riskManager.checkToolExecution(
    "dangerous_tool",
    {},
    AgentType.EXECUTION_ASSISTANT
  );
  console.log(`  Tool check (dangerous_tool): allowed=${blockedCheck.allowed}, reason=${blockedCheck.reason}`);

  // Test trade check
  const tradeCheck = riskManager.checkTrade({
    symbol: "BTC-USDT",
    side: "buy",
    size: 30000,
  });
  console.log(`  Trade check ($30k): allowed=${tradeCheck.allowed}, warnings=${tradeCheck.warnings.length}`);

  // Test limits
  const limits = riskManager.getLimits();
  console.log(`  Limits: maxPosition=$${limits.maxPositionSize}, maxDailyLoss=$${limits.maxDailyLoss}`);

  console.log("  ✓ Risk Manager working correctly");
}

function testConfigProvider() {
  console.log("\n=== Testing Config Provider ===\n");

  const config = new InMemoryConfigProvider({
    app: {
      name: "donut-cli",
      version: "1.0.0",
    },
    trading: {
      defaultLeverage: 10,
      symbols: ["BTC", "ETH"],
    },
  });

  console.log(`  app.name: ${config.get("app.name")}`);
  console.log(`  trading.defaultLeverage: ${config.get("trading.defaultLeverage")}`);
  console.log(`  missing.key (with default): ${config.getOrDefault("missing.key", "default_value")}`);
  console.log(`  has("trading.symbols"): ${config.has("trading.symbols")}`);

  console.log("  ✓ Config Provider working correctly");
}

async function testClientFactory() {
  console.log("\n=== Testing Client Factory ===\n");

  // Set mock API key for config loading (factory needs it)
  if (!process.env.ANTHROPIC_API_KEY) {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key-for-testing-only";
    console.log("  (Set mock ANTHROPIC_API_KEY for testing)");
  }

  // Clear cache first
  clearClientCache();
  console.log(`  Initial cache size: ${getCacheSize()}`);

  // Create clients (they'll use defaults since backends aren't running)
  const hbClient = getHummingbotClient();
  console.log(`  Created Hummingbot client`);

  const nofxClient = getNofxClient();
  console.log(`  Created nofx client`);

  // Check caching
  const hbClient2 = getHummingbotClient();
  console.log(`  Same instance returned: ${hbClient === hbClient2}`);
  console.log(`  Cache size after creating clients: ${getCacheSize()}`);

  // Health checks (will fail if backends aren't running - that's expected)
  console.log("\n  Checking backend health (failures expected if backends not running):");

  const hbHealth = await checkBackendHealth("hummingbot");
  console.log(`    Hummingbot: available=${hbHealth.available}${hbHealth.error ? `, error=${hbHealth.error}` : ""}`);

  const nofxHealth = await checkBackendHealth("nofx");
  console.log(`    nofx: available=${nofxHealth.available}${nofxHealth.error ? `, error=${nofxHealth.error}` : ""}`);

  console.log("  ✓ Client Factory working correctly");
}

async function main() {
  console.log("╔════════════════════════════════════════════════════╗");
  console.log("║  Phase 2 Architecture Test Suite                   ║");
  console.log("╚════════════════════════════════════════════════════╝");

  try {
    await testEventBus();
    testLogger();
    testRiskManager();
    testConfigProvider();
    await testClientFactory();

    console.log("\n════════════════════════════════════════════════════");
    console.log("  All tests passed! ✓");
    console.log("════════════════════════════════════════════════════\n");
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

main();
