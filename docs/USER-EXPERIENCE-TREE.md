# Donut CLI — User Experience Tree

> **Last Updated:** 2026-01-20
> **Purpose:** Map all user entry points, flows, and interactions in donut-cli

---

## Entry Points

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              ENTRY POINTS                                       │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        │                             │                             │
        ▼                             ▼                             ▼
┌───────────────┐           ┌─────────────────┐           ┌─────────────────┐
│   donut       │           │   donut-mcp     │           │  First Run      │
│ (CLI Binary)  │           │ (MCP Server)    │           │  Detection      │
└───────┬───────┘           └────────┬────────┘           └────────┬────────┘
        │                            │                             │
        │                            │                   ┌─────────┴─────────┐
        │                            │                   │ No .env or API key│
        │                            │                   └─────────┬─────────┘
        │                            │                             │
        │                            │                   ┌─────────▼─────────┐
        │                            │                   │  Welcome Menu     │
        │                            │                   │  1) Demo Tour     │
        │                            │                   │  2) Setup         │
        │                            │                   │  3) Skip          │
        │                            │                   └─────────┬─────────┘
        │                            │                             │
        ▼                            ▼                             ▼
```

---

## Core User Flows

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           CORE USER FLOWS                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────────────┐ │
│  │ donut setup │   │ donut demo  │   │ donut chat  │   │ donut start         │ │
│  │ (Onboard)   │   │ (Learn)     │   │ (Interact)  │   │ (Session Mgmt)      │ │
│  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘   └──────────┬──────────┘ │
│         │                 │                 │                      │           │
│         ▼                 ▼                 ▼                      ▼           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │Setup Wizard  │  │Demo Scenarios│  │Interactive   │  │Session Manager   │   │
│  │- API Key     │  │- Tour        │  │TUI Mode      │  │- Create session  │   │
│  │- Backends    │  │- Strategies  │  │- Claude AI   │  │- Resume session  │   │
│  │- Wallets     │  │- Trades      │  │- Commands    │  │- List sessions   │   │
│  │- Notifs      │  │- Full Flow   │  │- Agents      │  │- Delete session  │   │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### CLI Commands Summary

| Command | Description | Requires API Key |
|---------|-------------|------------------|
| `donut setup` | First-run setup wizard | No |
| `donut chat` | Interactive AI chat mode | Yes |
| `donut start` | Start a new trading session | Yes |
| `donut status` | Show session status | No |
| `donut strategy build` | Build a trading strategy | Yes |
| `donut backtest run` | Run a backtest | Yes |
| `donut paper start` | Start paper trading | Yes |
| `donut demo` | Demo mode tour | No |
| `donut notify setup` | Configure notifications | No |

---

## Strategy Development Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        STRATEGY DEVELOPMENT FLOW                                │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   donut strategy build                                                          │
│          │                                                                      │
│          ▼                                                                      │
│   ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐       │
│   │ Natural Language │ ──▶ │  Strategy        │ ──▶ │  Backtest        │       │
│   │ Description      │     │  Builder Agent   │     │  Analyst Agent   │       │
│   │ "BTC momentum    │     │  - Parse intent  │     │  - Run simulations│      │
│   │  with 5% stop"   │     │  - Build params  │     │  - Analyze results│      │
│   └──────────────────┘     │  - Risk config   │     │  - Optimize       │       │
│                            └──────────────────┘     └────────┬─────────┘       │
│                                                               │                 │
│   donut backtest run                                         │                 │
│          │                                                    │                 │
│          ▼                                                    ▼                 │
│   ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐       │
│   │ Backtest Config  │ ──▶ │  Historical      │ ──▶ │  Results         │       │
│   │ --symbols        │     │  Simulation      │     │  - Sharpe Ratio  │       │
│   │ --balance        │     │  - nofx backend  │     │  - Max Drawdown  │       │
│   │ --timeframe      │     │  - local engine  │     │  - Win Rate      │       │
│   └──────────────────┘     └──────────────────┘     │  - Trade Log     │       │
│                                                      └──────────────────┘       │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Paper Trading Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         PAPER TRADING FLOW                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   donut paper start                                                             │
│          │                                                                      │
│          ▼                                                                      │
│   ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐       │
│   │ Strategy Select  │ ──▶ │  Paper Engine    │ ──▶ │  Live Simulation │       │
│   │ --strategy       │     │  - Virtual $     │     │  - Real prices   │       │
│   │ --balance        │     │  - Position track│     │  - Signal exec   │       │
│   └──────────────────┘     │  - Risk enforce  │     │  - PnL tracking  │       │
│                            └──────────────────┘     └────────┬─────────┘       │
│                                                               │                 │
│   donut paper status                                          │                 │
│   donut paper compare <session> <backtest>                   ▼                 │
│          │                                         ┌──────────────────┐        │
│          └────────────────────────────────────────▶│  Comparison      │        │
│                                                    │  - Predicted vs  │        │
│                                                    │    Actual PnL    │        │
│                                                    └──────────────────┘        │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Multi-Agent Orchestration

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      MULTI-AGENT ORCHESTRATION                                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│                    ┌────────────────────────────────┐                          │
│                    │        ORCHESTRATOR            │                          │
│                    │    (Session Management)        │                          │
│                    │    (Agent Routing)             │                          │
│                    └───────────────┬────────────────┘                          │
│                                    │                                            │
│       ┌────────────────┬───────────┼───────────┬────────────────┐              │
│       │                │           │           │                │              │
│       ▼                ▼           ▼           ▼                ▼              │
│ ┌───────────┐  ┌────────────┐ ┌─────────┐ ┌───────────┐ ┌────────────┐        │
│ │ Strategy  │  │ Backtest   │ │  Risk   │ │ Sentiment │ │  Regime    │        │
│ │ Builder   │  │ Analyst    │ │ Manager │ │ Analyst   │ │ Detector   │        │
│ └───────────┘  └────────────┘ └─────────┘ └───────────┘ └────────────┘        │
│ Design        Simulate        Enforce     Social        Market                 │
│ strategies    & analyze       limits      signals       conditions             │
│                                                                                 │
│       ┌────────────────┬───────────────────────────┐                          │
│       │                │                           │                           │
│       ▼                ▼                           ▼                           │
│ ┌───────────┐  ┌────────────┐           ┌────────────────┐                    │
│ │  Thesis   │  │  Context   │           │   Reasoning    │                    │
│ │ Analyst   │  │  Manager   │           │   Engine       │                    │
│ └───────────┘  └────────────┘           └────────────────┘                    │
│ Investment     Session                   Structured                            │
│ thesis         continuity                thinking                              │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Agent Responsibilities

| Agent | Purpose | Key Functions |
|-------|---------|---------------|
| **Orchestrator** | Routes requests, manages sessions | Session creation, agent delegation |
| **Strategy Builder** | Designs trading strategies | Parse NL input, configure parameters |
| **Backtest Analyst** | Historical simulation | Run backtests, analyze performance |
| **Risk Manager** | Enforces position limits | Stop-loss, position sizing |
| **Sentiment Analyst** | Social signal analysis | Farcaster trends, sentiment scoring |
| **Regime Detector** | Market condition analysis | Trend/range detection, volatility |
| **Thesis Analyst** | Investment thesis | Fundamental analysis, conviction |
| **Context Manager** | Session continuity | State persistence, context retrieval |
| **Reasoning Engine** | Structured thinking | Chain-of-thought, decision logging |

---

## MCP Tools (Claude Code Integration)

### Strategy & Backtesting

| Tool | Description |
|------|-------------|
| `donut_strategy_build` | Build trading strategies from natural language |
| `donut_backtest_run` | Run backtests on strategies |
| `donut_portfolio` | Check portfolio status and positions |

### Solana (Jupiter)

| Tool | Description |
|------|-------------|
| `donut_balance` | Check Solana wallet status and SOL balance |
| `donut_quote` | Get a swap quote without executing |
| `donut_swap` | Execute a token swap on Solana via Jupiter |
| `donut_search_token` | Search for tokens by name or symbol |

### Base Chain (0x)

| Tool | Description |
|------|-------------|
| `donut_base_balance` | Check Base wallet status and ETH balance |
| `donut_base_quote` | Get a swap quote on Base chain |
| `donut_base_swap` | Execute a token swap on Base via 0x |
| `donut_detect_chain` | Detect blockchain from token address format |
| `donut_wallet_status` | Multi-chain wallet status (Solana + Base) |

### Hyperliquid Perpetuals

| Tool | Description |
|------|-------------|
| `donut_hl_balance` | Check Hyperliquid account balance and positions |
| `donut_hl_markets` | List available perpetual markets |
| `donut_hl_open` | Open a leveraged position |
| `donut_hl_close` | Close a position |
| `donut_hl_positions` | List open positions with PnL |

### Polymarket Predictions

| Tool | Description |
|------|-------------|
| `donut_pm_markets` | Search/list prediction markets |
| `donut_pm_market` | Get detailed market info with orderbook |
| `donut_pm_buy` | Buy shares on a prediction market |
| `donut_pm_sell` | Sell shares on a prediction market |
| `donut_pm_orders` | List open orders |
| `donut_pm_cancel` | Cancel an open order |

### Social Signals (Farcaster)

| Tool | Description |
|------|-------------|
| `donut_trending` | Discover trending tokens from Farcaster mentions |
| `donut_search_mentions` | Search for token/topic mentions |
| `donut_trending_topics` | Get trending topics/narratives |

---

## Demo Mode Scenarios

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        DEMO MODE SCENARIOS                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   donut demo tour        → Interactive walkthrough (no API key needed)          │
│   donut demo strategies  → Sample strategy showcase                             │
│   donut demo trades      → Trade analysis examples                              │
│                                                                                 │
│   Scenarios:                                                                    │
│   ├── getting-started.ts    → First steps, navigation                          │
│   ├── strategy-basics.ts    → How to build strategies                          │
│   ├── backtest-workflow.ts  → Running and analyzing backtests                  │
│   ├── trade-analysis.ts     → Understanding trade performance                  │
│   └── full-workflow.ts      → End-to-end: build → test → paper trade           │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Notification System

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                     NOTIFICATION SYSTEM                                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   donut notify setup                                                            │
│          │                                                                      │
│          ├──▶ Telegram Bot     ──▶ Trade alerts, PnL updates                   │
│          ├──▶ Discord Webhook  ──▶ Strategy signals                            │
│          └──▶ Custom Webhook   ──▶ Integration with external systems           │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Backend Integrations

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      BACKEND INTEGRATIONS                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────────┐ │
│  │  Donut Agents API   │  │  Donut Backend      │  │  Hummingbot Dashboard   │ │
│  │  (AI Decisions)     │  │  (Solana DeFi)      │  │  (Multi-Exchange)       │ │
│  │                     │  │                     │  │                         │ │
│  │  - LLM-powered      │  │  - Portfolio mgmt   │  │  - Live/paper trading   │ │
│  │    trading agents   │  │  - Transaction exec │  │  - Bot orchestration    │ │
│  │  - Thesis analysis  │  │  - Balance tracking │  │  - Multi-exchange       │ │
│  └─────────────────────┘  └─────────────────────┘  └─────────────────────────┘ │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

| Backend | Purpose | Required |
|---------|---------|----------|
| **Standalone** | Strategy design, learning | No |
| **Donut Agents API** | AI-powered trading decisions | Optional |
| **Donut Backend** | Solana DeFi portfolio | Optional |
| **Hummingbot Dashboard** | Live/paper trading | Optional |
| **nofx Server** | Backtesting engine | Optional |

---

## Interactive TUI Commands

In `donut chat` mode, the following slash commands are available:

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/status` | Current session & portfolio status |
| `/strategy` | Strategy management |
| `/backtest` | Run backtests |
| `/paper` | Paper trading controls |
| `/export` | Export session/results |
| `/clear` | Clear conversation |
| `/quit` | Exit interactive mode |

**Natural language examples:**
- "Build me a momentum strategy for ETH with 3x leverage"
- "Run a backtest on BTC with $10k starting balance"
- "What's trending on Farcaster?"
- "Swap 1 SOL for USDC"

---

## File Structure Reference

```
donut-cli/
├── src/
│   ├── index.ts              # CLI entry point
│   ├── agents/               # AI agent implementations
│   │   ├── orchestrator-agent.ts
│   │   ├── strategy-builder.ts
│   │   ├── backtest-analyst.ts
│   │   ├── sentiment-analyst.ts
│   │   ├── regime-detector.ts
│   │   ├── thesis-analyst.ts
│   │   ├── context-manager.ts
│   │   └── reasoning.ts
│   ├── cli/commands/         # Command modules
│   │   ├── setup.ts
│   │   ├── session.ts
│   │   ├── strategy.ts
│   │   ├── backtest.ts
│   │   ├── paper-trading.ts
│   │   ├── notifications.ts
│   │   └── demo.ts
│   ├── demo/                 # Demo mode
│   │   ├── scenarios/
│   │   └── tutorial-engine.ts
│   ├── integrations/         # External services
│   │   ├── donut-agents-client.ts
│   │   ├── donut-backend-client.ts
│   │   ├── hummingbot-client.ts
│   │   └── telegram-client.ts
│   ├── mcp-external/         # MCP server for Claude Code
│   │   ├── server.ts
│   │   └── tools/
│   ├── modes/                # Trading modes
│   │   ├── paper-trading.ts
│   │   └── demo-mode.ts
│   └── tui/                  # Terminal UI
│       ├── index.ts
│       ├── commands.ts
│       └── display.ts
└── docs/
    └── USER-EXPERIENCE-TREE.md  # This file
```

---

## Changelog

| Date | Change |
|------|--------|
| 2026-01-20 | Initial version created |

---

## TODO / Planned Improvements

- [ ] Auto-launch interactive mode after `donut start` (see PRD: onboarding-auto-launch.md)
- [ ] Turnkey wallet integration for secure key management
- [ ] Additional demo scenarios for perpetuals trading
- [ ] Mobile notification support (push notifications)
