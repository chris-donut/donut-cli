# Claude Agent SDK Usage Recommendations

This document outlines recommendations for improving the usage of the `@anthropic-ai/claude-agent-sdk` in the Donut CLI codebase, based on a comprehensive review of the current implementation.

## Executive Summary

The codebase demonstrates **solid foundational usage** of the Claude Agent SDK with good patterns for:
- Session management and resumption
- MCP server integration
- Tool definition with Zod schemas
- Dependency injection architecture
- Multi-agent orchestration

However, there are opportunities to improve **type safety**, **error handling**, **performance**, and **SDK feature utilization**.

---

## Priority 1: Critical Improvements

### 1.1 Eliminate Duplicate Type Definitions

**Issue**: The `AgentMessage` interface is duplicated in multiple files.

**Locations**:
- `src/agents/base-agent.ts:90-98`
- `src/tui/index.ts:39-50`

**Current Code**:
```typescript
// Duplicated in two files
interface AgentMessage {
  type: "system" | "tool_use" | "tool_result" | "result" | "text";
  subtype?: "init" | "success" | "error";
  session_id?: string;
  result?: string;
  tool_name?: string;
  tool_input?: unknown;
  text?: string;
}
```

**Recommendation**: Create a single shared type definition, or better, import from the SDK if available.

```typescript
// src/core/sdk-types.ts
import type { QueryMessage } from "@anthropic-ai/claude-agent-sdk";

// Re-export or extend SDK types
export type AgentMessage = QueryMessage;

// Or define once and import everywhere
export interface AgentMessage {
  type: "system" | "tool_use" | "tool_result" | "result" | "text" | "assistant";
  subtype?: "init" | "success" | "error";
  session_id?: string;
  result?: string;
  tool_name?: string;
  tool_input?: unknown;
  text?: string;
  message?: {
    content?: Array<{ type: string; text?: string }>;
  };
}
```

### 1.2 Remove Unsafe Type Casting

**Issue**: The query response is cast with `as AsyncIterable<AgentMessage>` which bypasses type safety.

**Location**: `src/agents/base-agent.ts:280`, `src/tui/index.ts:202`

**Current Code**:
```typescript
for await (const message of query({ prompt, options }) as AsyncIterable<AgentMessage>) {
```

**Recommendation**: Either:
1. Check if SDK exports proper types and use them directly
2. Add runtime validation using Zod for incoming messages

```typescript
// Option 1: Use SDK types directly (if available)
import { query, QueryMessage } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({ prompt, options })) {
  // message is properly typed
}

// Option 2: Add runtime validation
import { z } from "zod";

const AgentMessageSchema = z.object({
  type: z.enum(["system", "tool_use", "tool_result", "result", "text", "assistant"]),
  subtype: z.enum(["init", "success", "error"]).optional(),
  session_id: z.string().optional(),
  result: z.string().optional(),
  tool_name: z.string().optional(),
  tool_input: z.unknown().optional(),
  text: z.string().optional(),
});

for await (const rawMessage of query({ prompt, options })) {
  const message = AgentMessageSchema.parse(rawMessage);
  // message is now properly validated and typed
}
```

### 1.3 Improve Token Estimation

**Issue**: Token counting uses a rough character-based estimate (`length / 4`), which is inaccurate.

**Locations**: `src/agents/base-agent.ts:276`, `src/agents/base-agent.ts:319`

**Current Code**:
```typescript
this.metricsCollector.addInputTokens(Math.ceil(prompt.length / 4));
this.metricsCollector?.addOutputTokens(Math.ceil(result.length / 4));
```

**Recommendation**:
1. Check if SDK provides actual token counts in responses
2. Use a proper tokenizer library like `tiktoken` or `gpt-tokenizer`
3. Extract token usage from API response headers/metadata

```typescript
// Check SDK response for usage metadata
if (message.type === "result" && message.usage) {
  this.metricsCollector?.addInputTokens(message.usage.input_tokens);
  this.metricsCollector?.addOutputTokens(message.usage.output_tokens);
}

// Or use tiktoken for estimation
import { encoding_for_model } from "tiktoken";

const enc = encoding_for_model("claude-3-sonnet-20240229");
const tokenCount = enc.encode(text).length;
```

---

## Priority 2: Error Handling Improvements

### 2.1 Add SDK-Specific Error Handling

**Issue**: The catch block doesn't distinguish between SDK errors, network errors, and validation errors.

**Location**: `src/agents/base-agent.ts:329-339`

**Current Code**:
```typescript
} catch (error) {
  success = false;
  errorMessage = error instanceof Error ? error.message : String(error);
  // Generic handling
}
```

**Recommendation**: Add specific handling for SDK error types.

```typescript
import { ApiError, AuthenticationError, RateLimitError } from "@anthropic-ai/claude-agent-sdk";

} catch (error) {
  success = false;

  if (error instanceof RateLimitError) {
    // Implement backoff and retry
    this.logger.warn("Rate limited, will retry", { retryAfter: error.retryAfter });
    errorMessage = `Rate limited. Retry after ${error.retryAfter}s`;

  } else if (error instanceof AuthenticationError) {
    // API key issue - not retriable
    this.logger.error("Authentication failed", error);
    errorMessage = "API authentication failed. Check your ANTHROPIC_API_KEY.";

  } else if (error instanceof ApiError) {
    // Check if retriable (5xx errors)
    if (error.status >= 500) {
      errorMessage = `Server error (${error.status}). Will retry.`;
    } else {
      errorMessage = `API error: ${error.message}`;
    }

  } else if (error.name === "AbortError") {
    // User cancelled
    errorMessage = "Request cancelled";

  } else {
    errorMessage = error instanceof Error ? error.message : String(error);
  }
}
```

### 2.2 Add Retry Logic for SDK Calls

**Issue**: The `withRetry` utility exists but isn't used for SDK calls.

**Location**: `src/core/errors.ts:350-392` (retry utility), `src/agents/base-agent.ts:278-328` (query call)

**Recommendation**: Wrap SDK calls with the existing retry utility.

```typescript
import { withRetry, ApiError } from "../core/errors.js";

async run(prompt: string, stage: WorkflowStage): Promise<AgentResult> {
  // ... setup code ...

  try {
    await withRetry(
      async () => {
        for await (const message of query({ prompt, options })) {
          await this.processMessage(message, stage);
          // ... message handling ...
        }
      },
      {
        maxAttempts: 3,
        baseDelayMs: 1000,
        onRetry: (attempt, error) => {
          this.logger.warn(`Retry attempt ${attempt}`, { error: getErrorMessage(error) });
        },
      }
    );
  } catch (error) {
    // Handle non-retriable errors
  }
}
```

### 2.3 Handle Stream Interruptions

**Issue**: If the stream is interrupted mid-way, there's no recovery mechanism.

**Recommendation**: Add checkpoint handling for long-running agents.

```typescript
class BaseAgent {
  private lastCheckpoint?: {
    iterationCount: number;
    lastToolCall?: string;
    partialResult?: string;
  };

  protected async processMessage(message: AgentMessage, stage: WorkflowStage): Promise<void> {
    // Save checkpoint periodically
    if (this.iterationCount % 5 === 0) {
      this.lastCheckpoint = {
        iterationCount: this.iterationCount,
        lastToolCall: message.tool_name,
        partialResult: this.scratchpad.getTrace().steps.slice(-1)[0]?.observation,
      };
    }
    // ... rest of processing
  }

  public getCheckpoint() {
    return this.lastCheckpoint;
  }
}
```

---

## Priority 3: Performance Optimizations

### 3.1 Parallel Agent Execution in Orchestrator

**Issue**: `spawn_agent` tool runs agents synchronously.

**Location**: `src/mcp-servers/orchestrator-server.ts:110-117`

**Current Code**:
```typescript
const task = await orchestrator.spawnAgent(
  args.agentType,
  args.prompt,
  args.stage,
  args.metadata
);
```

**Recommendation**: Add a `spawn_agents_parallel` tool or modify to support batch spawning.

```typescript
export const spawnAgentsParallelTool = tool(
  "spawn_agents_parallel",
  `Spawn multiple subagents in parallel for improved performance.
  Returns an array of task IDs for tracking.`,
  {
    agents: z.array(z.object({
      agentType: z.nativeEnum(AgentType),
      prompt: z.string().min(1),
      stage: z.nativeEnum(WorkflowStage).default(WorkflowStage.DISCOVERY),
    })),
  },
  async (args) => {
    const orchestrator = getOrchestrator();

    // Spawn all agents in parallel
    const taskPromises = args.agents.map(agent =>
      orchestrator.spawnAgent(
        agent.agentType,
        agent.prompt,
        agent.stage
      ).catch(error => ({
        error: error instanceof Error ? error.message : String(error),
        agentType: agent.agentType,
      }))
    );

    const results = await Promise.all(taskPromises);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          tasks: results,
        }, null, 2),
      }],
    };
  }
);
```

### 3.2 Avoid Global State in MCP Servers

**Issue**: The orchestrator server uses global state (`orchestratorInstance`).

**Location**: `src/mcp-servers/orchestrator-server.ts:25`

**Current Code**:
```typescript
let orchestratorInstance: OrchestratorAgent | null = null;
```

**Recommendation**: Use factory pattern with closure instead of global state.

```typescript
export function createOrchestratorMcpServer(config: AgentConfig) {
  // Create orchestrator in the closure scope
  const orchestrator = new OrchestratorAgent(config);

  const spawnAgentTool = tool(
    "spawn_agent",
    "...",
    { /* schema */ },
    async (args) => {
      // Uses orchestrator from closure, not global
      const task = await orchestrator.spawnAgent(/* ... */);
      return { /* ... */ };
    }
  );

  return createSdkMcpServer({
    name: "orchestrator",
    version: "0.1.0",
    tools: [spawnAgentTool, /* ... */],
  });
}
```

### 3.3 Lazy MCP Server Initialization

**Issue**: All MCP servers are created at startup regardless of whether they're used.

**Location**: `src/tui/index.ts:134-163`

**Recommendation**: Initialize servers lazily on first use.

```typescript
function buildMcpServers(config: ReturnType<typeof loadConfig>) {
  const serverFactories = new Map<string, () => McpServer>();

  if (config.hummingbotUrl) {
    serverFactories.set("hummingbot", () =>
      createHummingbotMcpServer({ baseUrl: config.hummingbotUrl! })
    );
  }

  // Return a proxy that creates servers on demand
  return new Proxy({} as Record<string, McpServer>, {
    get(target, prop: string) {
      if (!target[prop] && serverFactories.has(prop)) {
        target[prop] = serverFactories.get(prop)!();
      }
      return target[prop];
    },
    ownKeys() {
      return Array.from(serverFactories.keys());
    },
  });
}
```

---

## Priority 4: SDK Feature Utilization

### 4.1 Add Structured Output Support

**Issue**: All tool outputs return unstructured JSON strings.

**Current Pattern**:
```typescript
return {
  content: [{
    type: "text" as const,
    text: JSON.stringify(result, null, 2),
  }],
};
```

**Recommendation**: Check if SDK supports structured outputs and use them.

```typescript
// If SDK supports structured tool outputs
return {
  content: [{
    type: "structured" as const,
    schema: ResultSchema,
    data: result,
  }],
};

// Or at minimum, include metadata for better parsing
return {
  content: [{
    type: "text" as const,
    text: JSON.stringify({
      _meta: {
        schema: "backtest_result_v1",
        timestamp: Date.now(),
      },
      ...result,
    }, null, 2),
  }],
};
```

### 4.2 Implement Cost/Budget Tracking

**Issue**: Budget limit is configured but not enforced at SDK level.

**Location**: `MAX_BUDGET_USD` in config but not used

**Recommendation**: Track costs and enforce budget limits.

```typescript
class CostTracker {
  private totalCostUsd = 0;
  private readonly maxBudget: number;

  constructor(maxBudget: number) {
    this.maxBudget = maxBudget;
  }

  recordUsage(inputTokens: number, outputTokens: number, model: string) {
    // Pricing per 1M tokens (example for claude-3-sonnet)
    const pricing: Record<string, { input: number; output: number }> = {
      "claude-sonnet-4-20250514": { input: 3, output: 15 },
      "claude-3-sonnet-20240229": { input: 3, output: 15 },
    };

    const rates = pricing[model] || pricing["claude-3-sonnet-20240229"];
    const cost =
      (inputTokens / 1_000_000) * rates.input +
      (outputTokens / 1_000_000) * rates.output;

    this.totalCostUsd += cost;

    if (this.totalCostUsd >= this.maxBudget) {
      throw new RiskError("Budget limit exceeded", {
        riskType: "budget",
        limit: this.maxBudget,
        actual: this.totalCostUsd,
      });
    }
  }

  getRemainingBudget() {
    return this.maxBudget - this.totalCostUsd;
  }
}
```

### 4.3 Leverage SDK's Context Window Management

**Issue**: Custom `ContextManager` class might duplicate SDK functionality.

**Location**: `src/agents/context-manager.ts`

**Recommendation**: Check if SDK handles context automatically and reduce duplication.

```typescript
// If SDK provides context info
interface SdkOptions extends Options {
  // SDK might support these
  contextWindowSize?: number;
  autoTruncate?: boolean;
  summarizeLongResults?: boolean;
}

// Use SDK's built-in context management if available
const options: SdkOptions = {
  // ... existing options
  autoTruncate: true,
  summarizeLongResults: true,
};
```

---

## Priority 5: Code Organization

### 5.1 Create SDK Wrapper Module

**Recommendation**: Create a thin wrapper around the SDK for easier testing and version upgrades.

```typescript
// src/sdk/index.ts
import {
  query as sdkQuery,
  tool as sdkTool,
  createSdkMcpServer as sdkCreateMcpServer,
  Options,
} from "@anthropic-ai/claude-agent-sdk";

export { Options };

// Re-export with our types
export const query = sdkQuery;
export const tool = sdkTool;
export const createSdkMcpServer = sdkCreateMcpServer;

// Add any wrappers or extensions
export function queryWithMetrics(
  params: Parameters<typeof sdkQuery>[0],
  metrics?: MetricsCollector
) {
  // Wrap with metrics collection
  return sdkQuery(params);
}

// Future-proof: Easy to swap implementations
export function createMockQuery(responses: AgentMessage[]) {
  return async function* mockQuery() {
    for (const response of responses) {
      yield response;
    }
  };
}
```

### 5.2 Centralize Tool Definitions

**Recommendation**: Group all tool registrations in a single module for better discoverability.

```typescript
// src/tools/registry.ts
import { spawnAgentTool, getAgentStatusTool } from "../mcp-servers/orchestrator-server.js";
import { backtestTools } from "../mcp-servers/nofx-server.js";
import { hummingbotTools } from "../mcp-servers/hummingbot-server.js";

export const ALL_TOOLS = {
  orchestrator: [spawnAgentTool, getAgentStatusTool],
  backtest: backtestTools,
  trading: hummingbotTools,
} as const;

export const TOOL_CATEGORIES = {
  read: ["get_agent_status", "list_tasks", "backtest_status"],
  write: ["spawn_agent", "backtest_start", "hb_bot_start"],
  dangerous: ["hb_bot_stop", "trade_execute"],
};

export function getToolsByCategory(category: keyof typeof TOOL_CATEGORIES) {
  return TOOL_CATEGORIES[category];
}
```

---

## Implementation Checklist

### Immediate Actions (Week 1)
- [ ] Consolidate `AgentMessage` type definitions
- [ ] Remove `as AsyncIterable<AgentMessage>` casts
- [ ] Add SDK-specific error handling in `BaseAgent.run()`

### Short-term (Weeks 2-3)
- [ ] Integrate retry logic with SDK calls
- [ ] Improve token counting accuracy
- [ ] Add cost tracking implementation

### Medium-term (Weeks 4-6)
- [ ] Refactor MCP servers to avoid global state
- [ ] Add parallel agent execution support
- [ ] Create SDK wrapper module

### Long-term (Ongoing)
- [ ] Monitor SDK updates and adopt new features
- [ ] Consider structured output support
- [ ] Evaluate SDK context management vs custom implementation

---

## SDK Version Tracking

**Current Version**: `@anthropic-ai/claude-agent-sdk@^0.1.77`

**Recommendation**: Pin to exact version in production and test upgrades in CI.

```json
{
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "0.1.77"
  }
}
```

Check for updates regularly:
```bash
npm outdated @anthropic-ai/claude-agent-sdk
```

---

## Conclusion

The Donut CLI demonstrates a sophisticated usage of the Claude Agent SDK. The main areas for improvement are:

1. **Type Safety**: Eliminate duplicates and unsafe casts
2. **Error Handling**: Add SDK-specific error handling and retry logic
3. **Performance**: Parallel execution and lazy initialization
4. **Maintainability**: SDK wrapper and centralized tool registry

Implementing these recommendations will result in a more robust, maintainable, and efficient agent system.
