# Installation Guide

Complete setup guide for Donut CLI - the AI-powered crypto trading terminal.

## Prerequisites

### Required

| Dependency | Version | Purpose |
|------------|---------|---------|
| [Node.js](https://nodejs.org/) | 18+ | Runtime environment |
| [Bun](https://bun.sh/) | 1.0+ | Package manager & runtime |
| [Anthropic API Key](https://console.anthropic.com/) | - | Claude AI access |

### Optional (for full functionality)

| Dependency | Purpose |
|------------|---------|
| [PostgreSQL](https://www.postgresql.org/) | Decision logging & analytics |
| [Python 3](https://www.python.org/) | Strategy harness integration |
| [Hummingbot](https://hummingbot.org/) | Live trading execution |

## Quick Installation

```bash
# Clone the repository
git clone https://github.com/your-org/donut-cli.git
cd donut-cli

# Install dependencies with bun
bun install

# Copy environment template
cp .env.example .env

# Add your Anthropic API key
echo "ANTHROPIC_API_KEY=sk-ant-your-key-here" >> .env

# Build the project
bun run build

# Verify installation
bun run start --version
```

## Detailed Setup

### 1. Clone and Install

```bash
# Clone repository
git clone https://github.com/your-org/donut-cli.git
cd donut-cli

# Install dependencies
bun install

# Or with npm
npm install
```

### 2. Environment Configuration

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```bash
# Required: Claude Agent SDK
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here

# Optional: Backend Servers
NOFX_API_URL=http://localhost:8080          # nofx backtest server
NOFX_AUTH_TOKEN=                            # Auth token if required
HUMMINGBOT_URL=http://localhost:5000        # Hummingbot Dashboard

# Optional: Python Integration
HARNESS_WORKING_DIR=/path/to/trading-agent-harness
PYTHON_PATH=python3

# Optional: Browser Interface
DONUT_BROWSER_URL=http://localhost:3000

# Runtime Settings
LOG_LEVEL=info                              # debug, info, warn, error
SESSION_DIR=.sessions                       # Where sessions are stored
```

### 3. API Key Setup

#### Anthropic API Key (Required)

1. Go to [console.anthropic.com](https://console.anthropic.com/)
2. Create an account or sign in
3. Navigate to API Keys
4. Create a new key
5. Add to your `.env` file:
   ```bash
   ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
   ```

#### Exchange API Keys (For Live Trading)

If using Hummingbot for live trading, configure exchange credentials in the Hummingbot Dashboard directly.

### 4. Build the Project

```bash
# Compile TypeScript
bun run build

# Or with npm
npm run build
```

### 5. Link CLI Globally (Optional)

```bash
# Make 'donut' command available system-wide
npm link

# Now you can run from anywhere
donut --help
```

## Backend Setup

### Option A: Standalone Mode (No Backend)

Donut CLI works without backends for:
- Strategy design with AI assistance
- Learning and exploration
- Demo mode with mock data

```bash
# Run without backend configuration
donut chat
```

### Option B: nofx Backtest Server

For backtesting capabilities:

```bash
# Start the nofx server (separate terminal)
cd /path/to/nofx
go run ./cmd/server

# Configure in .env
NOFX_API_URL=http://localhost:8080

# Verify connection
donut backtest status
```

### Option C: Hummingbot Dashboard

For live and paper trading:

```bash
# Start Hummingbot Dashboard (see Hummingbot docs)
docker-compose up -d hummingbot-dashboard

# Configure in .env
HUMMINGBOT_URL=http://localhost:5000

# Verify connection
donut paper status
```

## Database Setup (Optional)

PostgreSQL is used for decision logging and analytics:

```bash
# Create database
createdb donut_trading

# Configure connection (in separate MCP config)
# The postgres MCP server handles connection details
```

## Verify Installation

### Check CLI Help

```bash
donut --help
```

Expected output:
```
Usage: donut [options] [command]

Unified trading terminal with Claude Agent SDK

Options:
  -V, --version   output the version number
  -h, --help      display help for command

Commands:
  session         Manage trading sessions
  strategy        Strategy development commands
  backtest        Run and analyze backtests
  paper           Paper trading operations
  notify          Notification settings
  demo            Demo mode with mock data
  chat            Start interactive chat mode with Claude AI
  help [command]  display help for command
```

### Test Interactive Mode

```bash
donut chat
```

You should see the Donut CLI banner and an interactive prompt.

### Test Demo Mode

```bash
donut demo tour
```

This runs without API keys to verify basic functionality.

## Troubleshooting

### "ANTHROPIC_API_KEY not set"

```bash
# Check if .env exists
cat .env | grep ANTHROPIC

# Ensure it's properly formatted (no quotes needed)
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
```

### "Module not found" Errors

```bash
# Clean and reinstall
rm -rf node_modules
bun install
bun run build
```

### "Permission denied" on donut command

```bash
# Make sure dist/index.js is executable
chmod +x dist/index.js

# Or run with bun directly
bun run start
```

### TypeScript Compilation Errors

```bash
# Check for type errors
bun run lint

# Force rebuild
rm -rf dist
bun run build
```

### Backend Connection Issues

```bash
# Test nofx connection
curl http://localhost:8080/health

# Test Hummingbot connection
curl http://localhost:5000/api/status

# Check logs
LOG_LEVEL=debug donut backtest status
```

## Development Setup

For contributing to Donut CLI:

```bash
# Install dev dependencies (included in bun install)
bun install

# Run in development mode
bun run dev

# Run tests
bun test

# Run tests with coverage
bun test:coverage

# Type check without building
bun run lint
```

## Directory Structure

After installation, your project should look like:

```
donut-cli/
├── src/                    # TypeScript source
│   ├── index.ts           # CLI entry point
│   ├── agents/            # AI agent implementations
│   ├── cli/               # Command modules
│   ├── core/              # Core utilities
│   ├── integrations/      # External service clients
│   └── tui/               # Terminal UI
├── dist/                  # Compiled JavaScript
├── docs/                  # Documentation
├── ralph/                 # Autonomous agent system
├── .env                   # Environment configuration
├── .env.example           # Environment template
├── package.json           # Dependencies
└── tsconfig.json          # TypeScript config
```

## Next Steps

- [CLI Reference](./CLI_REFERENCE.md) - Learn all available commands
- [Technical Specification](../spec.md) - Understand the architecture
- [Ralph Autonomous Agent](../ralph/README.md) - Learn about PRD-driven development
