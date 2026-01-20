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
- **MCP Integration** - Use donut tools directly from Claude Code

## MCP Integration

Use donut-cli tools directly from Claude Code without leaving your terminal.

### Setup

After installing donut-cli, add to your Claude Code settings (`~/.claude/settings.json`):

```json
{
  "mcp_servers": {
    "donut": {
      "command": "donut-mcp",
      "env": {
        "ANTHROPIC_API_KEY": "your-key-here",
        "SOLANA_PRIVATE_KEY": "your-base58-private-key",
        "SOLANA_RPC_URL": "https://api.mainnet-beta.solana.com"
      }
    }
  }
}
```

**Security Note:** Your `SOLANA_PRIVATE_KEY` should be a base58-encoded private key. Never share this key or commit it to version control. The key is only loaded at execution time and is never logged.

### Available Tools

| Tool | Description |
|------|-------------|
| `donut_strategy_build` | Build trading strategies from natural language |
| `donut_backtest_run` | Run backtests on strategies |
| `donut_portfolio` | Check portfolio status and positions |
| `donut_balance` | Check Solana wallet status and SOL balance |
| `donut_quote` | Get a swap quote without executing |
| `donut_swap` | Execute a token swap on Solana via Jupiter |
| `donut_search_token` | Search for tokens by name or symbol |

### Example Usage

From Claude Code, you can say:

```
"Build me a momentum strategy for SOL"
"Backtest this strategy for 30 days"
"Show my current portfolio"
"Check my Solana wallet balance"
"Get a quote to swap 1 SOL for USDC"
"Search for the BONK token"
"Swap 0.5 SOL to USDC"
```

See [llms.txt](./llms.txt) for complete documentation.

## Quick Start

### One-Liner Install (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/chris-donut/donut-cli/main/scripts/setup.sh | bash
```

This script will:
- Check dependencies (Node.js, Bun)
- Clone the repository
- Install packages
- Guide you through configuration
- Build and optionally link globally

### Manual Installation

```bash
# Clone and install
git clone https://github.com/chris-donut/donut-cli.git
cd donut-cli
bun install

# Build and run setup wizard
bun run build
node dist/index.js setup
```

### Try Without API Key

Demo mode works without any configuration:

```bash
node dist/index.js demo tour
```

### Full Setup

For AI features, add your [Anthropic API key](https://console.anthropic.com/settings/keys):

```bash
# Interactive setup (recommended)
node dist/index.js setup

# Or manual setup
cp .env.example .env
# Edit .env and add: ANTHROPIC_API_KEY=sk-ant-...
```

Then start chatting:

```bash
node dist/index.js chat
```

> **Tip:** Run `npm link` to use the `donut` command globally instead of `node dist/index.js`.

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
| `donut setup` | First-run setup wizard |
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
