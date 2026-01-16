# Ralph - Autonomous PRD-Driven Agent

Ralph is an autonomous coding agent that implements user stories from a Product Requirements Document (PRD) using iterative AI-powered development loops.

## What is Ralph?

Ralph automates software development by:
1. Reading a PRD (`prd.json`) containing prioritized user stories
2. Picking the highest-priority incomplete story
3. Implementing it using AI-powered coding (via [amp](https://ampcode.com))
4. Running quality checks (typecheck, lint, tests)
5. Committing changes and updating progress
6. Repeating until all stories are complete

Named after Ralph Wiggum (The Simpsons), the agent works steadily through tasks one at a time, building features incrementally while maintaining code quality.

## Quick Start

```bash
# Navigate to the donut-cli project root
cd /path/to/donut-cli

# Run ralph (defaults to 10 iterations)
./ralph/ralph.sh

# Or specify max iterations
./ralph/ralph.sh 20
```

## File Structure

```
ralph/
├── ralph.sh          # Main execution script (bash)
├── prompt.md         # Agent instructions and workflow rules
├── prd.json          # Current PRD with user stories
├── progress.txt      # Learning log from completed iterations
├── CLAUDE.md         # Memory context for the agent
├── .last-branch      # Tracks current branch for archiving
├── archive/          # Historical PRD snapshots
│   └── YYYY-MM-DD-branch-name/
│       ├── prd.json
│       └── progress.txt
└── README.md         # This file
```

## How the Iteration Loop Works

```
┌──────────────────────────────────────────────────────────┐
│                    Ralph Iteration Loop                  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│   1. Read prd.json                                       │
│      ↓                                                   │
│   2. Read progress.txt (check Codebase Patterns first)   │
│      ↓                                                   │
│   3. Checkout correct branch from PRD branchName         │
│      ↓                                                   │
│   4. Pick highest-priority story where passes: false     │
│      ↓                                                   │
│   5. Implement the single user story                     │
│      ↓                                                   │
│   6. Run quality checks (tsc, lint, test)                │
│      ↓                                                   │
│   7. Commit with message: feat: [Story ID] - [Title]     │
│      ↓                                                   │
│   8. Update PRD to set passes: true                      │
│      ↓                                                   │
│   9. Append progress to progress.txt                     │
│      ↓                                                   │
│  10. If ALL stories pass → output <promise>COMPLETE      │
│      Otherwise → iteration ends, next one picks up       │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

## PRD Format

The `prd.json` file defines the work to be done:

```json
{
  "project": "Project Name",
  "branchName": "ralph/feature-branch",
  "description": "What this PRD implements",
  "userStories": [
    {
      "id": "STORY-001",
      "title": "Short descriptive title",
      "description": "As a [user], I want [feature] so that [benefit]",
      "acceptanceCriteria": [
        "Specific testable criterion 1",
        "Specific testable criterion 2"
      ],
      "priority": 1,
      "passes": false,
      "notes": ""
    }
  ]
}
```

### PRD Fields

| Field | Description |
|-------|-------------|
| `project` | Human-readable project name |
| `branchName` | Git branch for this work (created if doesn't exist) |
| `description` | Overall goal of this PRD |
| `userStories` | Array of stories to implement |
| `id` | Unique story identifier (used in commit messages) |
| `priority` | Lower number = higher priority |
| `passes` | `false` = not done, `true` = complete |
| `notes` | Ralph adds notes after completing each story |

## Creating a New PRD

1. **Create or edit `prd.json`:**
   ```json
   {
     "project": "My Feature",
     "branchName": "ralph/my-feature",
     "description": "Add awesome functionality",
     "userStories": [
       {
         "id": "MF-001",
         "title": "First task",
         "description": "As a user, I want X so that Y",
         "acceptanceCriteria": ["Criterion 1", "Criterion 2"],
         "priority": 1,
         "passes": false,
         "notes": ""
       }
     ]
   }
   ```

2. **Run ralph:**
   ```bash
   ./ralph/ralph.sh
   ```

3. **Watch the progress:**
   - Each iteration logs to console
   - Check `progress.txt` for detailed learnings
   - Git commits show completed work

## Progress Log

The `progress.txt` file contains:

### Codebase Patterns Section (Top)
Consolidated reusable patterns that help future iterations:
```
## Codebase Patterns
- Use `sql<number>` template for aggregations
- Always use `IF NOT EXISTS` for migrations
- Export types from actions.ts for UI components
```

### Iteration Entries (Chronological)
Each completed story adds an entry:
```markdown
## [Date/Time] - [Story ID]
Thread: https://ampcode.com/threads/$AMP_CURRENT_THREAD_ID
- What was implemented
- Files changed
- **Learnings for future iterations:**
  - Patterns discovered
  - Gotchas encountered
  - Useful context
---
```

## Automatic Archiving

When Ralph detects a branch change (new PRD with different `branchName`):
1. Archives current `prd.json` and `progress.txt` to `archive/YYYY-MM-DD-branch-name/`
2. Resets `progress.txt` for the new run
3. Continues with the new PRD

This preserves history while keeping the working files clean.

## Stop Conditions

Ralph stops when:
- **All stories complete**: Outputs `<promise>COMPLETE</promise>` and exits 0
- **Max iterations reached**: Exits 1 (check progress.txt for status)
- **Ctrl+C**: Manual interruption

## Troubleshooting

### "Ralph reached max iterations without completing"
- Check `progress.txt` for what was accomplished
- Increase max iterations: `./ralph/ralph.sh 30`
- Check if a story is too large and should be split

### "Command not found: amp"
- Install amp: `npm install -g @anthropic-ai/amp`
- Or use your local amp installation

### "PRD file not found"
- Ensure `prd.json` exists in the `ralph/` directory
- Check the file is valid JSON

### "Quality checks failing"
- Ralph won't commit broken code
- Fix the underlying issue, then run again
- Or mark the story with notes explaining the blocker

## Integration with Donut CLI

Ralph is used to implement features for the [Donut CLI](../README.md) trading terminal. Example PRD implementations:

- **Phase 1 Foundation**: CLI modularization, structured logging, retry logic
- **Phase 2 Intelligence**: Market analysis agents, sentiment integration
- **Phase 3 Execution**: Trade execution, risk management hooks

See `archive/` for historical implementations.

## Requirements

- [amp](https://ampcode.com) - AI coding assistant (uses `--dangerously-allow-all` flag)
- `jq` - JSON processor (for branch detection)
- `bash` - Shell interpreter
- Git configured with commit permissions

## Safety Notes

Ralph runs with `--dangerously-allow-all` which grants broad permissions. Use in:
- Trusted development environments
- Git repositories with proper backup
- Projects with CI/CD quality gates

The agent follows quality requirements (typecheck, lint, test must pass) before committing.
