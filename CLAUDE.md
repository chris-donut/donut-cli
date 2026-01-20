# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Install dependencies
bun install

# Build (TypeScript → dist/)
bun run build

# Development mode (ts-node)
bun run dev

# Type check only
bun run lint

# Run tests (requires --experimental-vm-modules for ESM)
bun test

# Run single test file
node --experimental-vm-modules node_modules/jest/bin/jest.js src/__tests__/core/errors.test.ts

# Run tests with coverage
bun test:coverage

# Interactive setup wizard
node dist/index.js setup

# Install globally (makes `donut` command available)
npm link
```

## Architecture Overview

Donut CLI is an AI-powered crypto trading terminal using the **Claude Agent SDK** for multi-agent orchestration.

### Three-Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      USER INTERFACES                         │
│   CLI (Commander.js)  ←→  TUI (readline)  ←→  Demo Mode     │
├─────────────────────────────────────────────────────────────┤
│                       AGENT LAYER                            │
│   BaseAgent → Orchestrator, StrategyBuilder, BacktestAnalyst │
│              SentimentAnalyst, ThesisAnalyst, ChartAnalyst   │
├─────────────────────────────────────────────────────────────┤
│                    MCP SERVERS (Tools)                       │
│   Hummingbot │ DonutAgents │ DonutBackend │ Postgres        │
│   Sentiment  │ Thesis      │ Journal      │ Orchestrator    │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Patterns

- **Workflow Stages**: `DISCOVERY → STRATEGY_BUILD → BACKTEST → ANALYSIS → EXECUTION → REVIEW`
- **Dependency Injection**: All agents receive dependencies via constructor (`src/core/dependencies.ts`, `src/core/providers.ts`)
- **MCP (Model Context Protocol)**: Agents access backend APIs through standardized tool interfaces
- **Risk Hooks**: Pre-execution validation via `src/hooks/risk-hook.ts` blocks dangerous trades
- **Event Bus**: Pub/sub for loose coupling between components (`src/core/event-bus.ts`)
- **Session Persistence**: File-based storage in `.sessions/` with path traversal protection

### Agent Hierarchy

Agents inherit from `BaseAgent` and use Claude Agent SDK sessions:
- `OrchestratorAgent` - Spawns and coordinates specialized agents
- `StrategyBuilderAgent` - Natural language strategy creation
- `BacktestAnalystAgent` - Historical simulation and analysis
- `SentimentAnalystAgent` - Social media signal aggregation
- `ThesisAnalystAgent` - Investment thesis conviction tracking

### Backend Integrations

Three optional backends (configured via `.env`):
1. **Donut Agents** (port 8080) - AI trading agents with LLM decisions
2. **Donut Backend** (port 3000) - Solana DeFi portfolio & transactions
3. **Hummingbot API** (port 8000) - Multi-exchange trading, uses HTTP Basic Auth

Client factory (`src/integrations/client-factory.ts`) manages singleton instances.

## Key Files

| Path | Purpose |
|------|---------|
| `src/index.ts` | CLI entry point, command registration |
| `src/tui/index.ts` | Interactive TUI loop, slash commands |
| `src/agents/base-agent.ts` | Foundation for all agents |
| `src/core/types.ts` | Type definitions and Zod schemas |
| `src/core/session.ts` | Session persistence with security validation |
| `src/core/config.ts` | Configuration loading (env → file → defaults) |
| `src/mcp-servers/` | MCP tool servers for backend integration |
| `src/integrations/client-factory.ts` | Backend client instantiation |

## Configuration

Required: `ANTHROPIC_API_KEY`

Optional backend URLs and tokens in `.env` - see `.env.example` for all options.

Configuration layers (later overrides earlier): defaults → config file → environment variables → CLI args

## Test Structure

Tests use Jest with ESM support (`ts-jest/presets/default-esm`):
- `src/__tests__/core/errors.test.ts` - Error handling
- `src/__tests__/tui/commands.test.ts` - TUI command parsing

Coverage threshold: 50% for branches, functions, lines, statements.

## CLI Commands Quick Reference

```bash
donut chat              # Interactive AI mode
donut strategy build    # Build trading strategy
donut backtest run      # Execute backtest
donut paper start       # Start paper trading
donut demo tour         # Demo walkthrough (no API key needed)
donut setup             # Configuration wizard
```

## Adding New Features

1. Define types in `src/core/types.ts` with Zod schemas
2. Create agent in `src/agents/` extending `BaseAgent`
3. Add MCP tools in `src/mcp-servers/`
4. Register CLI command in `src/cli/commands/`
5. Update client factory if new backend integration needed
