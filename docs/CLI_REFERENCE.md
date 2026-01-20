# CLI Reference

Complete reference for all Donut CLI commands.

## Global Options

```bash
donut --version    # Show version number
donut --help       # Show help
donut <cmd> --help # Show help for a specific command
```

---

## Session Commands

Manage trading sessions with persistent state.

### `donut start`

Start a new trading session.

```bash
donut start [options]
```

**Options:**
| Option | Description |
|--------|-------------|
| `-g, --goal <goal>` | Your trading goal or strategy idea |
| `-d, --demo` | Run in demo mode (no backend required) |

**Examples:**
```bash
# Start a new session
donut start

# Start with a specific goal
donut start --goal "Build a BTC momentum strategy"

# Start in demo mode
donut start --demo
```

### `donut resume`

Resume a previous session.

```bash
donut resume <sessionId>
```

**Examples:**
```bash
donut resume abc12345
```

### `donut status`

Show current session status.

```bash
donut status [options]
```

**Options:**
| Option | Description |
|--------|-------------|
| `-v, --verbose` | Show detailed status |

**Examples:**
```bash
donut status
donut status --verbose
```

---

## Strategy Commands

Build and manage trading strategies.

### `donut strategy build`

Build a new trading strategy with AI assistance.

```bash
donut strategy build [description]
```

**Arguments:**
| Argument | Description |
|----------|-------------|
| `description` | Optional strategy description or requirements |

**Examples:**
```bash
# Interactive strategy building
donut strategy build

# Build with specific requirements
donut strategy build "A mean reversion strategy for ETH with 2% stop loss"
```

### `donut strategy list`

List available strategies (requires Hummingbot).

```bash
donut strategy list
```

---

## Backtest Commands

Run and analyze backtests.

### `donut backtest run`

Run a new backtest.

```bash
donut backtest run [options]
```

**Options:**
| Option | Description | Default |
|--------|-------------|---------|
| `-s, --symbols <symbols>` | Comma-separated symbols | - |
| `--start <timestamp>` | Start timestamp (Unix seconds) | - |
| `--end <timestamp>` | End timestamp (Unix seconds) | - |
| `-b, --balance <amount>` | Initial balance | `10000` |

**Examples:**
```bash
# Run with default settings
donut backtest run

# Run with specific symbols
donut backtest run --symbols BTCUSDT,ETHUSDT

# Run with custom parameters
donut backtest run --symbols BTCUSDT --balance 50000 --start 1704067200 --end 1706745600
```

### `donut backtest status`

Check backtest status.

```bash
donut backtest status <runId>
```

**Examples:**
```bash
donut backtest status run-abc123
```

### `donut backtest analyze`

Analyze backtest results with AI.

```bash
donut backtest analyze <runId>
```

**Examples:**
```bash
donut backtest analyze run-abc123
```

### `donut backtest list`

List recent backtests.

```bash
donut backtest list [options]
```

**Options:**
| Option | Description | Default |
|--------|-------------|---------|
| `-l, --limit <number>` | Number of results | `10` |

**Examples:**
```bash
donut backtest list
donut backtest list --limit 20
```

---

## Paper Trading Commands

Paper trading simulation.

### `donut paper start`

Start a new paper trading session.

```bash
donut paper start [options]
```

**Options:**
| Option | Description | Default |
|--------|-------------|---------|
| `-s, --strategy <name>` | Strategy name or ID (required) | - |
| `-b, --balance <amount>` | Initial balance in USD | `10000` |
| `-l, --live` | Enable live price updates from Hummingbot | `false` |

**Examples:**
```bash
# Start paper trading with a strategy
donut paper start --strategy momentum-btc

# Start with custom balance
donut paper start --strategy my-strat --balance 50000

# Enable live prices from Hummingbot
donut paper start --strategy my-strat --live
```

### `donut paper status`

Show paper trading session status.

```bash
donut paper status [sessionId]
```

If no sessionId provided, shows most recent session.

**Examples:**
```bash
donut paper status
donut paper status abc12345
```

### `donut paper trades`

List trades for a paper trading session.

```bash
donut paper trades [sessionId] [options]
```

**Options:**
| Option | Description | Default |
|--------|-------------|---------|
| `-l, --limit <number>` | Number of trades to show | `20` |

**Examples:**
```bash
donut paper trades
donut paper trades abc12345 --limit 50
```

### `donut paper stop`

Stop a paper trading session.

```bash
donut paper stop <sessionId>
```

**Examples:**
```bash
donut paper stop abc12345
```

### `donut paper list`

List all paper trading sessions.

```bash
donut paper list
```

### `donut paper compare`

Compare paper trading results with backtest predictions.

```bash
donut paper compare <sessionId> <backtestRunId>
```

**Examples:**
```bash
donut paper compare abc12345 run-xyz789
```

---

## Notification Commands

Configure notification channels.

### `donut notify setup`

Set up a notification channel.

```bash
donut notify setup <channel> [options]
```

**Channels:** `telegram`, `discord`, `webhook`

**Options:**
| Option | Description |
|--------|-------------|
| `-t, --token <token>` | Bot token (for Telegram) |
| `-c, --chat <chatId>` | Chat ID (for Telegram) |
| `-w, --webhook <url>` | Webhook URL (for Discord or custom) |

**Examples:**
```bash
# Set up Telegram
donut notify setup telegram --token YOUR_BOT_TOKEN --chat YOUR_CHAT_ID

# Set up Discord webhook
donut notify setup discord --webhook https://discord.com/api/webhooks/...

# Set up custom webhook
donut notify setup webhook --webhook https://your-server.com/webhook
```

### `donut notify test`

Send a test notification to all configured channels.

```bash
donut notify test
```

### `donut notify status`

Show configured notification channels.

```bash
donut notify status
```

---

## Demo Commands

Demo mode for learning without backends.

### `donut demo tour`

Run an interactive demo tour (default command).

```bash
donut demo
# or
donut demo tour
```

### `donut demo strategies`

List demo strategies.

```bash
donut demo strategies
```

### `donut demo backtest`

Show demo backtest results.

```bash
donut demo backtest
```

### `donut demo trades`

Show demo trade history.

```bash
donut demo trades [options]
```

**Options:**
| Option | Description | Default |
|--------|-------------|---------|
| `-l, --limit <number>` | Number of trades to show | `15` |

**Examples:**
```bash
donut demo trades
donut demo trades --limit 30
```

### `donut demo runs`

List demo backtest runs.

```bash
donut demo runs
```

---

## Interactive Mode

### `donut chat`

Start interactive chat mode with Claude AI.

```bash
donut chat
```

This opens a terminal UI for conversational interaction with the trading system. Requires `ANTHROPIC_API_KEY` to be set.

---

## Environment Variables

Configure behavior via environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Claude API key (required for AI features) | - |
| `HUMMINGBOT_URL` | Hummingbot Dashboard URL | - |
| `LOG_LEVEL` | Logging level (`debug`, `info`, `warn`, `error`) | `info` |
| `SESSION_DIR` | Session storage directory | `.sessions` |
| `HARNESS_WORKING_DIR` | Python harness directory | - |
| `PYTHON_PATH` | Python interpreter path | `python3` |
| `DONUT_BROWSER_URL` | Donut browser interface URL | - |

---

## Common Workflows

### First Time Setup

```bash
# 1. Start in demo mode to explore
donut demo tour

# 2. When ready, set up your API key
export ANTHROPIC_API_KEY=sk-ant-...

# 3. Start a real session
donut start

# 4. Build a strategy
donut strategy build
```

### Backtest Workflow

```bash
# 1. Run a backtest
donut backtest run --symbols BTCUSDT,ETHUSDT --balance 10000

# 2. Check status
donut backtest status <runId>

# 3. Analyze results
donut backtest analyze <runId>
```

### Paper Trading Workflow

```bash
# 1. Start paper trading
donut paper start --strategy my-strategy --balance 10000

# 2. Monitor status
donut paper status

# 3. View trades
donut paper trades

# 4. Compare with backtest
donut paper compare <sessionId> <backtestRunId>

# 5. Stop when done
donut paper stop <sessionId>
```

### Set Up Notifications

```bash
# 1. Configure Telegram
donut notify setup telegram --token BOT_TOKEN --chat CHAT_ID

# 2. Test it
donut notify test

# 3. Check status
donut notify status
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Error (check stderr for details) |

---

## Related Documentation

- [Installation Guide](./INSTALLATION.md)
- [Technical Specification](../spec.md)
- [Ralph Autonomous Agent](../ralph/README.md)
