# PRD: User Onboarding Improvements

## Introduction

New users launching DOnut CLI for the first time face multiple friction points: they don't know what command to run first, demo mode is undiscoverable without prior knowledge, the setup wizard doesn't connect to demo, and there's no transition path from demo exploration to real usage. This results in low demo-to-real conversion rates.

## Goals

- **Primary:** Implement first-run detection with welcome flow, banner hints, demo-to-real transitions, and interactive wizards
- **OKR Alignment:** Accelerate time-to-value for new users
- **Success Metric:** Demo → Real conversion > 50%

## User Stories

### UO-001: First-Run Detection
**Description:** As a new user, I want the CLI to detect this is my first time and guide me, so that I know what to do without reading documentation.

**Acceptance Criteria:**
- [ ] Detect first run when `.env` missing or `ANTHROPIC_API_KEY` not set
- [ ] Skip detection if user ran `donut demo`, `donut setup`, `--help`, or `--version`
- [ ] Show welcome screen with 3 options: Demo, Setup, Skip
- [ ] Route to demo tour when user selects option 1
- [ ] Route to setup wizard when user selects option 2
- [ ] Show helpful tip and continue when user selects skip
- [ ] Typecheck passes
- [ ] Lint passes

### UO-002: Banner Quick Start Hints
**Description:** As a new user, I want to see available commands at a glance, so that I can start using the CLI without memorizing documentation.

**Acceptance Criteria:**
- [ ] Create `BANNER_WITH_HINTS` constant in theme.ts
- [ ] Show hints for: `donut demo tour`, `donut setup`, `donut chat`, `donut --help`
- [ ] Display hints banner on first run and bare `donut` command
- [ ] Keep original banner for interactive modes (chat, paper trading)
- [ ] Typecheck passes
- [ ] Lint passes

### UO-003: Setup Wizard Post-Completion Guidance
**Description:** As a user completing setup, I want clear next steps, so that I know what to do after configuration.

**Acceptance Criteria:**
- [ ] Show contextual next steps based on what was configured
- [ ] If API key configured: suggest demo tour → chat → backtest progression
- [ ] If no API key: suggest demo mode with link to get API key
- [ ] Offer to start demo tour immediately after setup completion
- [ ] Export `runSetupWizard()` function for import from other modules
- [ ] Typecheck passes
- [ ] Lint passes

### UO-004: Demo-to-Real Transition Prompts
**Description:** As a user completing a demo scenario, I want guidance on trying real features, so that I convert from demo exploration to actual usage.

**Acceptance Criteria:**
- [ ] Show transition prompt after each scenario completion
- [ ] If no API key: offer Setup wizard vs Continue demos
- [ ] If has API key: suggest context-specific real command:
  - `getting-started` → `donut chat`
  - `strategy-basics` → `donut strategy build`
  - `backtest-workflow` → `donut backtest run`
  - `trade-analysis` → `donut paper start`
  - `full-workflow` → `donut chat`
- [ ] Preserve existing navigation (menu, quit) as fallback options
- [ ] Typecheck passes
- [ ] Lint passes

### UO-005: Interactive Backtest Wizard
**Description:** As a user wanting to run a backtest, I want a guided wizard when I don't know the flags, so that I can run my first backtest without reading help text.

**Acceptance Criteria:**
- [ ] Detect when `donut backtest run` called with no flags
- [ ] Launch interactive wizard with 3 steps: Symbols, Time Range, Balance
- [ ] Provide sensible defaults (BTCUSDT,ETHUSDT, 30 days, $10000)
- [ ] Show summary and confirmation before running
- [ ] Preserve flag-based interface for scripting (don't break existing usage)
- [ ] Typecheck passes
- [ ] Lint passes

## Functional Requirements

1. First-run detection must not interfere with explicit command usage
2. Banner hints must be visually consistent with existing theme
3. All prompts must use existing readline/chalk patterns
4. Demo transitions must check API key status dynamically
5. Backtest wizard must produce identical results to flag-based invocation

## Non-Goals

- Changing the demo scenario content (scenarios stay as-is)
- Adding new demo scenarios
- Modifying the core agent architecture
- Adding analytics or telemetry
- Changing the setup wizard's existing steps (only adding post-completion)
- Supporting non-English languages
- **User preference persistence** - Not tracking which path (demo vs setup) users prefer
- **Onboarding for advanced features** - Paper trading, notifications setup not covered

## Interview Findings

- **Risk Assessment:** Low - all changes are additive, not modifying core logic
- **State Management:** Demo already has resume capability via tutorial-engine; first-run detection should be stateless (checks .env each time)
- **Known Deferral:** User preference tracking deferred to future iteration

## Technical Considerations

**Current Architecture:**
- Entry point: `src/index.ts` with Commander.js program
- Theme: `src/cli/theme.ts` exports BANNER, colors
- Setup: `src/cli/commands/setup.ts` with wizard flow
- Demo: `src/demo/tutorial-engine.ts` handles scenario progression
- Backtest: `src/cli/commands/backtest.ts` uses flags

**Files to Modify:**
| File | Change |
|------|--------|
| `src/index.ts` | Add `isFirstRun()`, `showFirstRunWelcome()`, intercept before `program.parse()` |
| `src/cli/theme.ts` | Add `BANNER_WITH_HINTS`, `getBanner()` helper |
| `src/cli/commands/setup.ts` | Enhance completion section, export `runSetupWizard()` |
| `src/demo/tutorial-engine.ts` | Add `showTransitionPrompt()` after scenario completion |
| `src/cli/commands/backtest.ts` | Add `runBacktestWizard()`, detect no-flags invocation |

**Dependencies:**
- No new dependencies required
- Uses existing: chalk, ora, readline, fs

## Success Metrics

- **Target:** Demo → Real conversion > 50%
- **Baseline:** Unknown (no current tracking)
- **Measurement:** Manual observation of user flow completion

## PM Engine Context

- **User Feedback:** Users don't know where to start, demo mode undiscovered, setup abandonment, gap between demo and real usage
- **Product State:** github.com/chris-donut/donut-cli
- **Selected Option:** Option 1 - Full onboarding flow (first-run + banner + transitions + wizard)
- **P(conversion):** >80%
- **OKR:** Accelerate time-to-value
