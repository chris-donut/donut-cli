# Donut CLI

AI-powered crypto trading terminal with multi-agent orchestration powered by the [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-typescript).

```
    ╔═══════════════════════════════════════════════════════════╗
    ║                                                           ║
    ║   ██████╗  ██████╗ ███╗   ██╗██╗   ██╗████████╗           ║
    ║   ██╔══██╗██╔═══██╗████╗  ██║██║   ██║╚══██╔══╝           ║
    ║   ██║  ██║██║   ██║██╔██╗ ██║██║   ██║   ██║              ║
    ║   ██║  ██║██║   ██║██║╚██╗██║██║   ██║   ██║              ║
    ║   ██████╔╝╚██████╔╝██║ ╚████║╚██████╔╝   ██║              ║
    ║   ╚═════╝  ╚═════╝ ╚═╝  ╚═══╝ ╚═════╝    ╚═╝              ║
    ║                                                           ║
    ║          AI-Powered Crypto Trading Terminal               ║
    ╚═══════════════════════════════════════════════════════════╝
```

## Features

- **AI-Powered Strategy Building** - Natural language strategy creation with Claude
- **Multi-Agent Orchestration** - Specialized agents for analysis, backtesting, and execution
- **Session Continuity** - Resume conversations with full context via Agent SDK sessions
- **Backtesting Integration** - Run and analyze backtests with AI-driven insights
- **Paper Trading** - Simulate strategies with real-time or manual price data
- **Risk Management** - Built-in risk controls with configurable limits
- **Notification System** - Telegram, Discord, and webhook alerts

## Quick Start

**1. Clone and install:**
```bash
git clone https://github.com/chris-donut/donut-cli.git
cd donut-cli
bun install
```

**2. Configure environment:**
```bash
cp .env.example .env
```
Then edit `.env` and add your `ANTHROPIC_API_KEY=sk-ant-...`

**3. Build:**
```bash
bun run build
```

**4. Try it out:**
```bash
# Demo mode (no API key needed)
node dist/index.js demo tour

# Interactive chat mode
node dist/index.js chat
```

> **Note:** To use the `donut` command globally, run `npm link` after building.

## Installation

See [Installation Guide](./docs/INSTALLATION.md) for detailed setup instructions.

**Requirements:**
- Node.js 18+
- Bun 1.0+ (or npm)
- Anthropic API Key

## Usage

### Interactive Mode

```bash
donut chat
```

Opens a conversational interface with Claude AI for strategy development and trading operations.

### Strategy Development

```bash
# Build a strategy interactively
donut strategy build

# Build with specific requirements
donut strategy build "BTC momentum strategy with 5% stop loss"
```

### Backtesting

```bash
# Run a backtest
donut backtest run --symbols BTCUSDT,ETHUSDT --balance 10000

# Analyze results
donut backtest analyze <runId>
```

### Paper Trading

```bash
# Start paper trading
donut paper start --strategy my-strategy --balance 10000

# Check status
donut paper status

# Compare with backtest predictions
donut paper compare <sessionId> <backtestRunId>
```

### Demo Mode

```bash
# Interactive tour
donut demo tour

# View sample strategies
donut demo strategies

# See sample trades
donut demo trades
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `donut chat` | Interactive AI chat mode |
| `donut start` | Start a new trading session |
| `donut status` | Show session status |
| `donut strategy build` | Build a trading strategy |
| `donut backtest run` | Run a backtest |
| `donut paper start` | Start paper trading |
| `donut demo` | Demo mode tour |
| `donut notify setup` | Configure notifications |

See [CLI Reference](./docs/CLI_REFERENCE.md) for complete documentation.

## Configuration

Create a `.env` file:

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-...

# Optional backends
HUMMINGBOT_URL=http://localhost:5000
NOFX_API_URL=http://localhost:8080

# Settings
LOG_LEVEL=info
SESSION_DIR=.sessions
```

See [.env.example](./.env.example) for all options.

## Architecture

Donut CLI uses a multi-agent architecture powered by the Claude Agent SDK:

```
┌────────────────────────────────────────────────────────────┐
│                     ORCHESTRATOR                           │
│               (Session Management, Routing)                │
└─────────────────────────┬──────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
    ┌─────▼─────┐   ┌─────▼─────┐   ┌─────▼─────┐
    │ STRATEGY  │   │ BACKTEST  │   │   RISK    │
    │  BUILDER  │   │  ANALYST  │   │ MANAGER   │
    └───────────┘   └───────────┘   └───────────┘
```

**Key Components:**
- **Strategy Builder** - Designs trading strategies via conversation
- **Backtest Analyst** - Runs and analyzes historical simulations
- **Risk Manager** - Enforces position limits and risk controls

See [spec.md](./spec.md) for the full technical specification.

## Development

```bash
# Run in development mode
bun run dev

# Type check
bun run lint

# Run tests
bun test

# Run tests with coverage
bun test:coverage
```

## Ralph Autonomous Agent

Donut CLI includes [Ralph](./ralph/README.md), an autonomous PRD-driven development agent that implements features iteratively:

```bash
# Run ralph to implement user stories
./ralph/ralph.sh
```

Ralph reads from `ralph/prd.json` and implements stories one at a time, committing as it goes.

## Project Structure

```
donut-cli/
├── src/
│   ├── index.ts           # CLI entry point
│   ├── agents/            # AI agent implementations
│   │   ├── base-agent.ts
│   │   ├── strategy-builder.ts
│   │   └── backtest-analyst.ts
│   ├── cli/               # Command modules
│   │   └── commands/
│   ├── core/              # Core utilities
│   │   ├── session.ts
│   │   ├── config.ts
│   │   ├── errors.ts
│   │   └── logger.ts
│   ├── integrations/      # External services
│   │   └── hummingbot-client.ts
│   └── tui/               # Terminal UI
├── docs/                  # Documentation
├── ralph/                 # Autonomous agent
└── spec.md               # Technical specification
```

## Backends

Donut CLI supports multiple backends:

| Backend | Purpose | Required |
|---------|---------|----------|
| **Standalone** | Strategy design, learning | No |
| **Hummingbot Dashboard** | Live/paper trading | Optional |
| **nofx Server** | Backtesting | Optional |

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `bun test`
5. Submit a pull request

## License

MIT

## Links

- [Installation Guide](./docs/INSTALLATION.md)
- [CLI Reference](./docs/CLI_REFERENCE.md)
- [Technical Specification](./spec.md)
- [Ralph Agent](./ralph/README.md)
- [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-typescript)
