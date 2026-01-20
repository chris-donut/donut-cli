# PRD: Agent Execution & Trust Layer

## Introduction

Users abandon Donut CLI because the jump from "install" to "first trade" requires too much manual orchestration. The current MCP tools are granular actions (swap, quote, balance) that force users to mentally sequence operations without safety rails. Meanwhile, Claude Code is commoditizing generic agent UX, making "another trading CLI" undifferentiated.

The strategic pivot: **Donut becomes the trust substrate Claude plugs into** — not a competing harness, but the trading-grade runtime that provides policy enforcement, workflow orchestration, and execution accountability.

## Goals

- **Primary:** Implement workflow MCP primitives (`research` → `plan` → `pretrade_check` → `execute` → `report`) backed by a policy engine with hard limit enforcement
- **OKR Alignment:** Make Donut the default crypto trading agent
- **Success Metric:** Activation rate >50% (50%+ of new installs complete first trade within 24h)

## User Stories

### WFL-001: Research Tool - Market Context Primitive

**Description:** As a trader using Claude Code, I want to call `donut_research` with a token or narrative so that I receive structured market context without manually querying multiple sources.

**Acceptance Criteria:**
- [ ] MCP tool `donut_research` accepts token address, symbol, or narrative string
- [ ] Returns structured JSON: { sentiment, keyLevels, recentNews, socialMentions, riskFactors }
- [ ] Integrates existing Farcaster trending + token search tools internally
- [ ] Read-only operation (no state changes)
- [ ] Response time <5s for token lookups
- [ ] Typecheck passes
- [ ] Lint passes

### WFL-002: Plan Tool - Trade Plan Object

**Description:** As a trader, I want to call `donut_plan` with a thesis and risk parameters so that I receive a structured trade plan object I can review before execution.

**Acceptance Criteria:**
- [ ] MCP tool `donut_plan` accepts: { thesis, token, direction, riskPercent, timeHorizon }
- [ ] Returns trade plan object: { entry, target, stopLoss, size, invalidation, confidence, warnings }
- [ ] Size calculated from portfolio balance and riskPercent
- [ ] Validates token exists and is tradeable on supported venues
- [ ] Plan object includes unique planId for tracking
- [ ] Does not execute any trades (planning only)
- [ ] Typecheck passes
- [ ] Lint passes

### WFL-003: Pretrade Check Tool - Policy Enforcement Gate

**Description:** As a trader, I want to call `donut_pretrade_check` with a plan object so that I know if the trade violates any of my risk policies before execution.

**Acceptance Criteria:**
- [ ] MCP tool `donut_pretrade_check` accepts plan object from WFL-002
- [ ] Returns: { passed: boolean, violations: string[], warnings: string[] }
- [ ] Checks against policy engine (see POL-001)
- [ ] Violations are hard stops (position limit, drawdown cap exceeded)
- [ ] Warnings are soft alerts (unusual size, low liquidity)
- [ ] Failed pretrade prevents execution via donut_execute
- [ ] Typecheck passes
- [ ] Lint passes

### WFL-004: Execute Tool - Validated Plan Execution

**Description:** As a trader, I want to call `donut_execute` with a validated plan so that the trade executes only if pretrade checks passed.

**Acceptance Criteria:**
- [ ] MCP tool `donut_execute` accepts planId from validated plan
- [ ] Rejects execution if pretrade_check not called or failed
- [ ] Routes to appropriate venue (Jupiter/0x/Hyperliquid) based on token chain
- [ ] Returns execution result: { executionId, status, fills, avgPrice, fees }
- [ ] **Failure handling:** If tx signed but not confirmed, auto-retry once then fail
- [ ] Status includes: "pending" | "confirmed" | "failed" | "retrying"
- [ ] Stores execution event for posttrade reporting
- [ ] Integrates with existing wallet.ts and base-wallet.ts (careful: fragile code)
- [ ] Typecheck passes
- [ ] Lint passes

### WFL-005: Report Tool - Posttrade Analysis

**Description:** As a trader, I want to call `donut_report` with an execution ID so that I receive posttrade analysis and attribution.

**Acceptance Criteria:**
- [ ] MCP tool `donut_report` accepts executionId
- [ ] Returns: { plan, execution, slippage, fees, pnlIfClosed, holdingPeriod }
- [ ] Includes original thesis and invalidation conditions
- [ ] Calculates unrealized PnL at current prices
- [ ] Read-only (does not modify positions)
- [ ] Typecheck passes
- [ ] Lint passes

### POL-001: Policy Engine Core

**Description:** As Donut, I want a policy engine that enforces hard limits so that users cannot accidentally exceed their risk parameters.

**Acceptance Criteria:**
- [ ] Policy config stored in `~/.donut/policies.json`
- [ ] Supports: maxPositionSize, maxPortfolioRisk, maxDrawdown, cooldownMinutes
- [ ] Policy engine exposes `checkPolicy(plan): PolicyResult` function
- [ ] PolicyResult includes: { passed, violations[], warnings[] }
- [ ] Default policies created on first run (conservative defaults)
- [ ] Typecheck passes
- [ ] Lint passes

### POL-002: Policy Configuration Tool

**Description:** As a trader, I want to call `donut_policy_set` to configure my risk limits so that the policy engine enforces my preferences.

**Acceptance Criteria:**
- [ ] MCP tool `donut_policy_set` accepts policy key-value pairs
- [ ] Validates policy values are within sane ranges
- [ ] Persists to `~/.donut/policies.json`
- [ ] Returns current policy state after update
- [ ] Typecheck passes
- [ ] Lint passes

### POL-003: Kill Switch Tool

**Description:** As a trader, I want a `donut_kill_switch` tool that immediately blocks all new executions so that I can halt trading in emergencies.

**Acceptance Criteria:**
- [ ] MCP tool `donut_kill_switch` accepts: { enabled: boolean, reason?: string }
- [ ] When enabled, all `donut_execute` calls fail with "Kill switch active: {reason}"
- [ ] Kill switch state persisted to disk (survives restarts)
- [ ] `donut_policy_get` returns kill switch status
- [ ] Can be disabled by calling with { enabled: false }
- [ ] Typecheck passes
- [ ] Lint passes

### POL-004: Position Limit Enforcement

**Description:** As a trader, I want the policy engine to enforce maximum position sizes so that no single trade exceeds my risk tolerance.

**Acceptance Criteria:**
- [ ] Policy engine checks proposed size against maxPositionSize (% of portfolio)
- [ ] Checks against maxPortfolioRisk (total risk across all positions)
- [ ] Checks against per-asset concentration limits
- [ ] Returns violation if any limit exceeded
- [ ] Limits configurable via donut_policy_set
- [ ] Typecheck passes
- [ ] Lint passes

## Functional Requirements

1. **Workflow Tools** must chain: research → plan → pretrade → execute → report
2. **Policy Engine** must run synchronously in pretrade_check (no async race conditions)
3. **Execution** must be idempotent (same planId cannot execute twice)
4. **All tools** must return structured JSON for Claude to reason over
5. **State** persisted to `~/.donut/` directory (policies, executions, portfolio state)

## Non-Goals

- **Alpha generation**: We do not claim to predict markets or generate trading signals
- **Real-time streaming UI**: This is MCP-first, not a competing terminal
- **Shadow ledger/replay**: Deferred to future PRD (valuable but not activation-critical)
- **Multi-user/team features**: Single-user focus for v1
- **Finetuned trading model**: Use Claude as-is with domain tools
- **Drawdown protection (v1)**: Complex to implement correctly; deferred per interview scope cut

## Interview Findings

**Fragile Code:** Wallet tools (wallet.ts, base-wallet.ts) are the main integration risk. Execute tool must carefully wrap existing swap logic.

**Failure Handling:** Optimistic retry once - if tx signed but not confirmed, auto-retry once then mark failed. User can explicitly retry with new plan if needed.

**Scope Cut:** POL-005 (Drawdown Protection) removed from v1. Can add in follow-up PRD once core workflow proven.

## Technical Considerations

**Current Architecture (from GitHub):**
- `src/mcp-external/tools/` - existing MCP tool implementations
- `src/core/` - config, session, errors, logger
- `src/integrations/` - Hummingbot, venue clients
- `src/agents/` - Strategy Builder, Backtest Analyst

**New Components:**
- `src/mcp-external/tools/workflow.ts` - research, plan, pretrade, execute, report
- `src/core/policy-engine.ts` - policy enforcement logic
- `src/core/policies.ts` - policy types and defaults
- `~/.donut/policies.json` - user policy config
- `~/.donut/executions/` - execution event storage

**Dependencies:**
- Existing wallet tools (Solana, Base, Hyperliquid)
- Existing Farcaster integration for research
- Turnkey auth for execution signing

## Success Metrics

- **Target:** Activation rate >50% (first trade within 24h of install)
- **Baseline:** Current activation rate (measure before launch)
- **Measurement:** Track `donut_execute` success within 24h of first `donut` command
- **Secondary:** Policy violation prevention rate (violations caught / total pretrades)

## PM Engine Context

- **User Feedback:** Strategic pivot from "trading CLI" to "Agent Execution & Trust Layer" with MCP interface. Focus on policy enforcement and workflow orchestration rather than competing on agent UX.
- **Product State:** https://github.com/chris-donut/donut-cli
- **Selected Option:** Option 1+2 - Workflow MCP primitives + Policy Engine
- **P(activation):** >80% (workflow reduces friction) + 60-80% (policy builds trust)
- **OKR:** Make Donut the default crypto trading agent
