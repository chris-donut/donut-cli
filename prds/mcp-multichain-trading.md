# PRD: Donut CLI MCP + Multi-Chain Trading Expansion

## Introduction

Users want to execute crypto trades directly from Claude Code using natural language commands. Currently, donut-cli is a standalone terminal requiring separate setup and context-switching. Pigeon-mcp demonstrated that MCP server integration enables seamless "Claude terminal → trading terminal" experiences. This PRD addresses the gap by transforming donut-cli into an MCP server with multi-chain DEX, perps, and prediction market support.

## Goals

- **Primary:** Enable natural language → on-chain trade execution in <30 seconds via Claude Code MCP integration
- **OKR Alignment:** Become the default AI trading terminal
- **Success Metric:** Time to first trade < 30 seconds

## Phased Rollout

| Phase | Scope | Timeline |
|-------|-------|----------|
| A | MCP Server + Solana swaps (Jupiter) | Week 1-2 |
| B | Base swaps (0x/1inch) | Week 3 |
| C | Hyperliquid perps | Week 4-5 |
| D | Polymarket + social signals | Week 6+ |

---

## User Stories

### Phase A: MCP Server + Solana Swaps

#### DMCP-001: MCP Server Foundation
**Description:** As a Claude Code user, I want to add donut-cli as an MCP server so that I can trade from my existing Claude terminal.

**Acceptance Criteria:**
- [ ] `src/mcp/server.ts` implements MCP server protocol
- [ ] Server exposes `donut_swap`, `donut_balance`, `donut_quote` tools
- [ ] MCP config example in `README.md` for Claude Code setup
- [ ] Server starts with `donut mcp serve` command
- [ ] MCP server runs independently, does not interfere with existing agent orchestration
- [ ] Existing `donut chat`, `donut strategy`, `donut backtest` commands work unchanged
- [ ] New trading agents registered separately from Strategy Builder / Backtest Analyst
- [ ] Typecheck passes
- [ ] Lint passes

#### DMCP-002: Solana Wallet Integration
**Description:** As a trader, I want to connect my Solana wallet so that I can execute swaps on-chain.

**Acceptance Criteria:**
- [ ] Support wallet via private key in `.env` (SOLANA_PRIVATE_KEY)
- [ ] `donut wallet status` shows connected wallet and SOL balance
- [ ] Wallet connection persists across sessions
- [ ] Private keys NEVER logged, even at debug level
- [ ] Keys loaded only at execution time, not cached in memory
- [ ] `.env` file has restrictive permissions warning in setup
- [ ] Typecheck passes
- [ ] Lint passes

#### DMCP-003: Jupiter Swap Execution
**Description:** As a trader, I want to swap tokens on Solana so that I can trade via natural language.

**Acceptance Criteria:**
- [ ] Integrate Jupiter Aggregator API v6
- [ ] `donut_swap` tool accepts: `{ fromToken, toToken, amount, slippage? }`
- [ ] Returns transaction signature on success
- [ ] Handles common errors (insufficient balance, slippage exceeded)
- [ ] Quote preview before execution with `donut_quote`
- [ ] Transaction polling until confirmed OR timeout (60s) with clear status
- [ ] If timeout: return tx signature + "pending" status, not error
- [ ] Slippage defaults to 0.5%, user can override
- [ ] Quote shows expected vs minimum received amount
- [ ] Confirmation message shows actual vs quoted price
- [ ] Typecheck passes
- [ ] Lint passes

#### DMCP-004: Token Discovery
**Description:** As a trader, I want to find tokens by name/symbol so that I can swap without knowing contract addresses.

**Acceptance Criteria:**
- [ ] `donut_search_token` tool searches Jupiter token list
- [ ] Returns top 5 matches with symbol, name, address, logo
- [ ] Caches token list locally (refresh daily)
- [ ] Token search shows contract address prominently
- [ ] User must confirm token address before swap
- [ ] Warning for tokens with similar names to popular tokens
- [ ] Typecheck passes
- [ ] Lint passes

#### DMCP-005: Transaction Safety Guard
**Description:** As a trader, I want safeguards against failed/stuck transactions so that I don't lose funds.

**Acceptance Criteria:**
- [ ] Pre-flight simulation before signing
- [ ] Transaction timeout with retry option
- [ ] Clear distinction: "signed", "submitted", "confirmed", "failed"
- [ ] Recovery instructions if transaction stuck
- [ ] Typecheck passes
- [ ] Lint passes

### Phase B: Base Chain Swaps

#### DMCP-006: Base Wallet Integration
**Description:** As a trader, I want to connect my Base wallet so that I can trade on Base chain.

**Acceptance Criteria:**
- [ ] Support wallet via private key in `.env` (BASE_PRIVATE_KEY)
- [ ] `donut wallet status` shows Base wallet and ETH balance
- [ ] Same security constraints as Solana wallet (no logging, etc.)
- [ ] Typecheck passes
- [ ] Lint passes

#### DMCP-007: 0x Swap Execution
**Description:** As a trader, I want to swap tokens on Base so that I can access Base ecosystem.

**Acceptance Criteria:**
- [ ] Integrate 0x Swap API (or 1inch as fallback)
- [ ] `donut_swap` tool detects chain from token address
- [ ] Supports same interface as Jupiter swaps
- [ ] Gas estimation included in quote
- [ ] Same transaction safety guards as Solana
- [ ] Typecheck passes
- [ ] Lint passes

### Phase C: Hyperliquid Perps

#### DMCP-008: Hyperliquid Account Connection
**Description:** As a trader, I want to connect my Hyperliquid account so that I can trade perps.

**Acceptance Criteria:**
- [ ] Integrate Hyperliquid TypeScript SDK
- [ ] Support API key authentication
- [ ] `donut_hl_balance` shows account balance and positions
- [ ] Typecheck passes
- [ ] Lint passes

#### DMCP-009: Perp Position Management
**Description:** As a trader, I want to open/close leveraged positions so that I can trade perps via natural language.

**Acceptance Criteria:**
- [ ] `donut_hl_open` tool: `{ market, side, size, leverage, orderType }`
- [ ] `donut_hl_close` tool: close position by market
- [ ] `donut_hl_positions` tool: list open positions with PnL
- [ ] Leverage validation (max per market)
- [ ] Liquidation price shown before opening position
- [ ] Typecheck passes
- [ ] Lint passes

### Phase D: Polymarket + Social Signals

#### DMCP-010: Polymarket Integration
**Description:** As a trader, I want to trade prediction markets so that I can bet on events.

**Acceptance Criteria:**
- [ ] Integrate Polymarket API
- [ ] `donut_pm_markets` tool: search/list markets
- [ ] `donut_pm_buy` / `donut_pm_sell` tools
- [ ] Show market odds and volume
- [ ] Typecheck passes
- [ ] Lint passes

#### DMCP-011: Social Signal Discovery
**Description:** As a trader, I want to discover trending tokens from CT/Farcaster so that I can find opportunities.

**Acceptance Criteria:**
- [ ] Integrate Farcaster API (Neynar or direct)
- [ ] `donut_trending` tool: tokens with high social volume
- [ ] Filter by: mentions, sentiment, volume threshold
- [ ] Returns token + social stats + link to source
- [ ] Typecheck passes
- [ ] Lint passes

---

## Functional Requirements

1. **MCP Protocol Compliance**: Server must implement MCP tool protocol for Claude Code compatibility
2. **Multi-Chain Architecture**: Abstract chain-specific logic behind unified swap interface
3. **Wallet Security**: Private keys stored in `.env`, never logged or transmitted
4. **Error Handling**: All tools return structured errors with actionable messages
5. **Rate Limiting**: Respect API rate limits for Jupiter, 0x, Hyperliquid
6. **Transaction Confirmation**: Wait for on-chain confirmation before returning success
7. **Agent Isolation**: New trading capabilities must not break existing orchestration

## Non-Goals

- **No custodial wallets**: Users manage their own keys
- **No automated trading bots**: This PRD covers manual execution only
- **No CEX integration**: Focus on DeFi/on-chain only (Hummingbot handles CEX)
- **No mobile app**: CLI and MCP server only
- **No portfolio tracking**: Just execution, not analytics
- **No breaking changes**: Existing donut-cli commands must continue working

## Technical Considerations

**Current Architecture (from repo analysis):**
```
src/
├── agents/           # Extend with trading agents
├── cli/commands/     # Add `mcp` command
├── core/             # Add wallet, chain configs
├── integrations/     # Add jupiter/, 0x/, hyperliquid/
└── mcp/              # NEW: MCP server implementation
```

**Key Dependencies to Add:**
- `@solana/web3.js` - Solana transactions
- `@jup-ag/api` - Jupiter aggregator
- `viem` - Base/EVM transactions
- `hyperliquid` - Perps SDK
- MCP server library (or implement protocol directly)

**Files to Modify:**
- `src/index.ts` - Add `mcp` command
- `src/core/config.ts` - Add chain configs
- `.env.example` - Add wallet/API key templates

**Risk Mitigation:**
- Agent orchestration concern: Isolate MCP server in separate process
- Transaction failures: Implement comprehensive status tracking
- Key security: Audit all log statements, add redaction

## Success Metrics

- **Target:** Time to first trade < 30 seconds
- **Baseline:** Currently N/A (no on-chain trading)
- **Measurement:** Time from Claude Code command to transaction confirmation

## PM Engine Context

- **User Feedback:** Add pigeon-mcp style features for competitive parity
- **Product State:** `github.com/chris-donut/donut-cli`
- **Selected Option:** Option 1+2 Phased (MCP + Swaps + Perps)
- **P(conversion):** >80% for Phase A, 60-80% for full rollout
- **OKR:** Become the default AI trading terminal
- **Interview Findings:**
  - Agent orchestration is fragile - isolate new code
  - All 4 failure modes are concerns - added safety guards
  - All Phase A stories essential - no scope cuts
