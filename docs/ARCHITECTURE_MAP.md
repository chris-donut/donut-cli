# Donut CLI - Architecture Map

A comprehensive map of CLI, TUI, and Agent functionalities for the unified trading terminal.

---

## Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DONUT CLI                                       │
│                    Unified Trading Terminal with Claude Agent SDK            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐       │
│  │       CLI        │    │       TUI        │    │     AGENTS       │       │
│  │  (Commander.js)  │◄──►│   (Readline)     │◄──►│  (Claude SDK)    │       │
│  └────────┬─────────┘    └────────┬─────────┘    └────────┬─────────┘       │
│           │                       │                       │                  │
│           ▼                       ▼                       ▼                  │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │                       MCP SERVERS (Tools)                         │       │
│  │  Hummingbot │ Orchestrator │ Sentiment │ Thesis │ Donut           │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. CLI (Command Line Interface)

Entry point: `src/index.ts`
Framework: Commander.js

### Command Groups

| Group | Command | Description |
|-------|---------|-------------|
| **Session** | `donut start` | Start new trading session |
| | `donut resume <id>` | Resume previous session |
| | `donut status` | Show current session status |
| **Strategy** | `donut strategy build [desc]` | Build strategy with AI assistance |
| | `donut strategy list` | List available strategies |
| **Backtest** | `donut backtest run` | Execute new backtest |
| | `donut backtest status <id>` | Check backtest status |
| | `donut backtest analyze <id>` | Analyze backtest results |
| | `donut backtest list` | List recent backtests |
| **Paper Trading** | `donut paper start` | Start paper trading session |
| | `donut paper status [id]` | Show paper session status |
| | `donut paper trades [id]` | List paper trades |
| | `donut paper stop <id>` | Stop paper session |
| | `donut paper list` | List all paper sessions |
| | `donut paper compare` | Compare paper vs backtest |
| **Notifications** | `donut notify setup <ch>` | Configure notification channel |
| | `donut notify test` | Test notifications |
| | `donut notify status` | Show notification config |
| **Demo** | `donut demo tour` | Interactive demo walkthrough |
| | `donut demo strategies` | Show demo strategies |
| | `donut demo backtest` | Demo backtest results |
| | `donut demo trades` | Demo trade history |
| **Interactive** | `donut chat` | Enter interactive TUI mode |

### CLI File Structure

```
src/cli/
├── index.ts              # Module exports
├── theme.ts              # Colors, formatting, banners
└── commands/
    ├── session.ts        # Session management
    ├── strategy.ts       # Strategy operations
    ├── backtest.ts       # Backtest operations
    ├── paper-trading.ts  # Paper trading
    ├── notifications.ts  # Notification setup
    └── demo.ts           # Demo mode
```

---

## 2. TUI (Terminal User Interface)

Entry point: `src/tui/index.ts`
Framework: Node.js readline + Chalk

### Interactive Mode Features

```
╭─────────────────────────────────────────────────────────╮
│  🍩 DONUT CLI - Interactive Mode                        │
│                                                         │
│  Commands: /strategy  /backtest  /paper  /help  /quit  │
╰─────────────────────────────────────────────────────────╯
```

### Slash Commands

| Command | Aliases | Action | Routes To |
|---------|---------|--------|-----------|
| `/strategy` | `/s`, `/strat` | Build/modify strategy | Strategy Builder Agent |
| `/backtest` | `/bt`, `/back` | Run/check backtest | Backtest Analyst Agent |
| `/analyze` | `/a`, `/an` | Analyze results | Backtest Analyst Agent |
| `/paper` | `/p` | Paper trading help | Direct display |
| `/status` | - | Current session | Direct display |
| `/sessions` | `/list` | List all sessions | Direct display |
| `/resume` | `/r` | Resume session | Session management |
| `/help` | `/h`, `/?` | Show help | Direct display |
| `/clear` | `/cls` | Clear screen | Terminal control |
| `/quit` | `/exit`, `/q` | Exit TUI | Exit handler |

### TUI Components

```
src/tui/
├── index.ts       # Main REPL loop, agent routing
├── commands.ts    # Slash command parser & registry
├── display.ts     # Message formatting, rendering
└── theme.ts       # Colors, icons, box drawing
```

### Display Functions

| Function | Purpose |
|----------|---------|
| `displayUserMessage()` | Show user input |
| `displayAgentStart()` | Agent initialization header |
| `displayAgentEnd()` | Agent completion separator |
| `streamText()` | Real-time text streaming |
| `displayToolUse()` | Tool invocation indicator |
| `displayToolResult()` | Tool completion status |
| `displayError()` | Error with red styling |
| `displaySuccess()` | Success with green checkmark |

### Theme System

| Element | Value | Usage |
|---------|-------|-------|
| PRIMARY | `#FF6B35` | Branding, prompts |
| SUCCESS | Green | Checkmarks, success |
| ERROR | Red | Errors, failures |
| WARNING | Yellow | Warnings |
| MUTED | Gray | Timestamps, info |

**Icons:**
- 🍩 Donut (brand)
- 📊 Strategy Builder
- 📈 Backtest Analyst
- 📝 Paper trading
- 🔧 Tool usage
- ✅ Completion

---

## 3. Agents

Entry point: `src/agents/`
Framework: Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`)

### Agent Hierarchy

```
                     ┌────────────────────┐
                     │   BaseAgent        │
                     │  (Foundation)      │
                     └─────────┬──────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
        ▼                      ▼                      ▼
┌───────────────┐   ┌───────────────────┐   ┌───────────────┐
│  Orchestrator │   │ Strategy Builder  │   │   Backtest    │
│    Agent      │   │     Agent         │   │   Analyst     │
└───────┬───────┘   └───────────────────┘   └───────────────┘
        │
        │ spawns
        ▼
┌───────────────┐   ┌───────────────────┐   ┌───────────────┐
│   Sentiment   │   │     Thesis        │   │    Regime     │
│   Analyst     │   │    Analyst        │   │   Detector    │
└───────────────┘   └───────────────────┘   └───────────────┘
```

### Agent Capabilities

| Agent | Purpose | Key Methods |
|-------|---------|-------------|
| **Orchestrator** | Multi-agent coordination | `spawnAgent()`, `synthesizeResults()` |
| **Strategy Builder** | Create trading strategies | `buildStrategy()`, `reviewStrategy()` |
| **Backtest Analyst** | Run & analyze backtests | `runBacktest()`, `analyzeResults()` |
| **Sentiment Analyst** | Social media sentiment | `getSentimentData()`, `aggregateSentiment()` |
| **Thesis Analyst** | Trading thesis monitoring | `analyzeThesis()`, `validateAssumption()` |
| **Regime Detector** | Market regime classification | `detectRegime()` |

### Workflow Stages

```
DISCOVERY → STRATEGY_BUILD → BACKTEST → ANALYSIS → EXECUTION → REVIEW
    │            │              │           │           │          │
    │            │              │           │           │          │
    ▼            ▼              ▼           ▼           ▼          ▼
 Gather      Design &       Execute     Interpret   Execute    Review
 context     create        backtests    metrics     trades     results
```

### Tools Available Per Stage

| Stage | Tools |
|-------|-------|
| **DISCOVERY** | strategy_list, strategy_get, backtest_list_runs, donut_get_positions |
| **STRATEGY_BUILD** | strategy_create, strategy_update, strategy_validate |
| **BACKTEST** | backtest_start, backtest_status, backtest_get_metrics |
| **ANALYSIS** | backtest_get_metrics, backtest_get_equity, backtest_get_trades |
| **EXECUTION** | donut_execute_trade*, donut_preview_trade, donut_get_tx_status |
| **REVIEW** | strategy_list, backtest_list_runs, donut_get_positions |

*High-risk tools requiring approval

---

## 4. MCP Servers (Tool Providers)

Entry point: `src/mcp-servers/`

### Available Servers

| Server | Tools Provided | Purpose |
|--------|----------------|---------|
| **Orchestrator** | spawn_agent, get_agent_status, synthesize_results | Multi-agent coordination |
| **Hummingbot** | hb_backtest_*, hb_strategy_* | Hummingbot Dashboard integration |
| **Donut** | donut_strategy_*, donut_backtest_*, donut_portfolio | Donut backend integration |
| **Sentiment** | get_sentiment_data, get_sentiment_config | Social sentiment analysis |
| **Thesis** | thesis_create, thesis_update, thesis_check | Thesis management |

### Tool Flow

```
User Input
    │
    ▼
┌─────────┐     ┌─────────┐     ┌─────────────┐
│   TUI   │────►│  Agent  │────►│ MCP Server  │
└─────────┘     └─────────┘     └──────┬──────┘
                    ▲                   │
                    │                   ▼
                    │           ┌─────────────┐
                    └───────────│   Backend   │
                                │ (Hummingbot │
                                │  or Donut)  │
                                └─────────────┘
```

---

## 5. Integration Flow

### CLI → Agent Flow

```typescript
// 1. CLI command invocation
donut backtest run --symbols BTCUSDT --start 1704067200

// 2. Command handler creates agent
const agent = createBacktestAnalyst({ terminalConfig, sessionManager })

// 3. Agent runs with tools
const result = await agent.runBacktest(config)

// 4. Results displayed via CLI theme
console.log(formatResults(result))
```

### TUI → Agent Flow

```typescript
// 1. User enters slash command
/backtest run BTCUSDT

// 2. Command parsed and routed
const command = parseInput("/backtest run BTCUSDT")
// → { action: "agent", agentType: "BACKTEST_ANALYST", prompt: "run BTCUSDT" }

// 3. Agent query with streaming
for await (const message of query(prompt, options)) {
  processAgentMessage(message)  // Stream to display
}

// 4. Display final results
displayAgentEnd()
```

---

## 6. Session Management

### Session Lifecycle

```
Create Session                Resume Session
     │                              │
     ▼                              ▼
┌─────────────┐              ┌─────────────┐
│ session_    │              │ Load from   │
│ TIMESTAMP_  │              │ storage     │
│ RANDOM      │              └──────┬──────┘
└──────┬──────┘                     │
       │                            │
       ▼                            ▼
┌──────────────────────────────────────────┐
│              Active Session              │
│  ┌─────────────────────────────────────┐ │
│  │ • Session ID                        │ │
│  │ • Workflow Stage                    │ │
│  │ • Active Strategy                   │ │
│  │ • Backtest Results                  │ │
│  │ • Agent Session IDs                 │ │
│  └─────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

### Session State

```typescript
interface SessionState {
  sessionId: string
  stage: WorkflowStage
  activeStrategy?: Strategy
  backtestResults?: BacktestMetrics[]
  pendingTrades?: Trade[]
  agentSessions: Record<AgentType, string>
}
```

---

## 7. Key Files Reference

| Category | File | Purpose |
|----------|------|---------|
| Entry | `src/index.ts` | Main CLI entry point |
| CLI | `src/cli/commands/*.ts` | Command implementations |
| TUI | `src/tui/index.ts` | Interactive mode loop |
| TUI | `src/tui/commands.ts` | Slash command parser |
| Agents | `src/agents/base-agent.ts` | Agent foundation |
| Agents | `src/agents/orchestrator-agent.ts` | Multi-agent coordinator |
| Tools | `src/mcp-servers/*.ts` | Tool implementations |
| Core | `src/core/types.ts` | Type definitions |
| Core | `src/core/session.ts` | Session management |

---

## 8. Data Flow Summary

```
┌────────────────────────────────────────────────────────────────────┐
│                         USER INTERACTION                            │
└────────────────────────────────────────────────────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
            ┌───────────────┐           ┌───────────────┐
            │     CLI       │           │     TUI       │
            │  (Commands)   │           │  (Interactive)│
            └───────┬───────┘           └───────┬───────┘
                    │                           │
                    └───────────┬───────────────┘
                                ▼
                    ┌───────────────────┐
                    │   AGENT LAYER     │
                    │  (Claude AI)      │
                    └─────────┬─────────┘
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
            ┌───────────────┐   ┌───────────────┐
            │  MCP Tools    │   │   Session     │
            │  (Actions)    │   │   State       │
            └───────┬───────┘   └───────────────┘
                    │
                    ▼
            ┌───────────────┐
            │   BACKEND     │
            │ Hummingbot/   │
            │    Donut      │
            └───────────────┘
```

---

*Document generated: 2026-01-16*
