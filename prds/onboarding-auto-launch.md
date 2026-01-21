# PRD: Onboarding Auto-Launch Flow

## Introduction

When users run `donut start`, they successfully create a session but are then dropped back to the shell with only text hints about next steps. This creates confusion—users don't know if the session is still active or what to do next. The "Next steps" text is printed after the CLI exits, requiring users to manually run another command.

This friction causes users to abandon the flow before building their first strategy.

## Goals

- **Primary:** After session creation, auto-prompt users to continue into interactive mode with a single keypress
- **OKR Alignment:** 构建策略交易功能体系，使用户能够安全配置与运行策略，无交易级 P0 事故
- **Success Metric:** Users set up their first trade strategy through CLI in < 30 seconds

## User Stories

### OALF-001: Auto-prompt after session creation

**Description:** As a new user, I want to be prompted to continue after `donut start` so that I don't have to figure out what command to run next.

**Acceptance Criteria:**
- [ ] After session creation success message, show prompt: "Press Enter to build your first strategy (or Ctrl+C to exit)"
- [ ] Pressing Enter launches interactive chat mode (`startInteractiveMode()`)
- [ ] Pressing Ctrl+C exits cleanly without error message
- [ ] Prompt only appears when NOT using `--demo` flag
- [ ] Typecheck passes
- [ ] Lint passes

### OALF-002: Skip prompt when goal is provided

**Description:** As a user who provides a goal via `--goal` flag, I want the system to auto-launch strategy building so that I reach my strategy faster.

**Acceptance Criteria:**
- [ ] `donut start --goal "momentum strategy on SOL"` skips the Enter prompt
- [ ] Auto-launches interactive mode with the goal pre-loaded as first message
- [ ] Goal is displayed before entering chat mode
- [ ] Typecheck passes
- [ ] Lint passes

### OALF-003: Auto-resume recent session

**Description:** As a returning user, I want to be offered to resume my recent session so that I don't lose my progress.

**Acceptance Criteria:**
- [ ] On `donut start`, check for sessions updated within last 1 hour
- [ ] If recent session exists, prompt: "Resume session [id]? (Y/n)"
- [ ] Pressing Enter or Y resumes the session and enters chat mode
- [ ] Pressing N creates a new session as normal
- [ ] Display session age and current stage in the prompt
- [ ] Typecheck passes
- [ ] Lint passes

### OALF-004: Graceful API key error with recovery path

**Description:** As a user without an API key configured, I want a clear error with immediate recovery option so that I can fix it without googling.

**Acceptance Criteria:**
- [ ] When ANTHROPIC_API_KEY is missing, show actionable error
- [ ] Offer: "Run setup wizard now? (Y/n)"
- [ ] Pressing Y launches `runSetupWizard()` directly
- [ ] Pressing N shows manual instructions and exits
- [ ] Typecheck passes
- [ ] Lint passes

## Functional Requirements

1. Modify `src/cli/commands/session.ts`:
   - Add readline prompt after session creation (~15 LOC)
   - Add recent session detection and resume prompt (~25 LOC)
   - Add API key error recovery prompt (~15 LOC)
2. Reuse existing `startInteractiveMode()` from `src/tui/index.ts`
3. Reuse existing `runSetupWizard()` from `src/cli/commands/setup.ts`
4. Handle Ctrl+C gracefully via existing shutdown handler

## Non-Goals

- This feature will NOT change the demo mode flow (`--demo` flag)
- This feature will NOT modify the interactive chat mode itself
- This feature will NOT add new session stages or workflow state
- This feature will NOT change the `donut chat` command behavior
- This feature will NOT add `--no-interactive` flag (users can Ctrl+C)
- This feature will NOT handle backend connection errors during onboarding (separate concern)

## Technical Considerations

**Files to modify:**
- `src/cli/commands/session.ts` - Main changes (~55 LOC total)

**Dependencies (all existing):**
- `readline` from Node.js (already used in `src/index.ts`)
- `startInteractiveMode()` from `src/tui/index.ts`
- `runSetupWizard()` from `src/cli/commands/setup.ts`
- `playDonutAnimation()` from `src/cli/theme.ts` (for consistent UX)
- `SessionManager.listSessions()` for recent session detection

**Risk mitigation:**
- Ctrl+C handling already robust via `registerShutdownHandler`
- No new npm dependencies
- All referenced functions already exported and tested
- Session age calculation uses existing `updatedAt` timestamp

**Known drop-off risks (from interview):**
1. API key not set → Addressed by OALF-004
2. Chat mode confusion → Out of scope (separate chat UX improvement)
3. Backend not running → Out of scope (graceful degradation story)

## Success Metrics

- **Target:** Users set up first strategy in < 30 seconds
- **Baseline:** Currently requires 2+ manual commands, ~60+ seconds with confusion
- **Measurement:** Time from `donut start` Enter to first AI response in chat

## PM Engine Context

- **User Feedback:** `donut start` exits to shell with confusing "Next steps" text, unclear how to proceed
- **Product State:** https://github.com/chris-donut/donut-cli (`src/cli/commands/session.ts`)
- **Selected Option:** Option 1 - Auto-launch chat after session creation
- **P(conversion):** >80%
- **OKR:** 构建策略交易功能体系，使用户能够安全配置与运行策略，无交易级 P0 事故
- **Interview Findings:**
  - Auto-resume recent sessions (<1hr) requested
  - Cut `--no-interactive` flag (Ctrl+C sufficient)
  - Added API key error recovery path
