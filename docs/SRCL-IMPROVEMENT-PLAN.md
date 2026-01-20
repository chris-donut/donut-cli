# SRCL-Inspired Improvement Plan for Donut CLI

This document outlines a series of improvements to the Donut CLI inspired by the Sacred Computer React Library (SRCL) 1.1.19 - a terminal-aesthetic component repository with MS-DOS/retro styling.

## Executive Summary

The Donut CLI already has solid foundations (chalk colors, box drawing, spinners, banners). This plan transforms it into a visually cohesive, retro-terminal experience by adopting SRCL's design patterns: bordered panels, data tables, navigation systems, progress indicators, and interactive components.

---

## Phase 1: Core Visual Infrastructure

### 1.1 Enhanced Box/Card System
**SRCL Reference**: Cards, Dialogs, Drawers

**Current State**: Simple boxes with `╭─╮╰─╯` borders
**Target State**: MS-DOS-style bordered panels with titles, double-line variants, and shadow effects

```
Current:                    Target:
╭─────────────────╮         ╔═══════════════════╗
│ Content         │         ║ PANEL TITLE       ║
╰─────────────────╯         ╠═══════════════════╣
                            ║ Content           ║
                            ╚═══════════════════╝
```

**Implementation**:
- Create `src/tui/components/panel.ts`
- Support: single/double borders, title positioning, footer, nested panels
- Color variants: default, success, warning, error, info

**Files to Modify**:
- `src/tui/theme.ts` - Add box character sets
- `src/tui/display.ts` - Add panel rendering functions
- New: `src/tui/components/panel.ts`

### 1.2 Action Bar Component
**SRCL Reference**: Action Bar

**Current State**: No persistent action bar
**Target State**: Top/bottom bars showing context, commands, and status

```
┌─ DONUT CLI ─────────────────────────────────────────── F1:Help ─┐
│                                                                  │
│                     [Main Content Area]                          │
│                                                                  │
└─ Session: abc123 ──── Stage: STRATEGY_BUILD ──── 📊 Ready ──────┘
```

**Implementation**:
- Create `src/tui/components/action-bar.ts`
- Persistent status line with session info, stage indicator, hotkey hints
- Auto-update on state changes

### 1.3 Unified Color Theme
**SRCL Reference**: Overall aesthetic

**Current State**: Scattered color usage across theme files
**Target State**: Cohesive MS-DOS-inspired palette with semantic colors

```typescript
// Proposed palette
const RETRO_THEME = {
  // Background variants
  bg: { primary: '#000080', secondary: '#000000', highlight: '#0000AA' },
  // Foreground
  fg: { primary: '#AAAAAA', bright: '#FFFFFF', muted: '#555555' },
  // Semantic
  accent: '#FF6B35',      // Donut orange (brand)
  success: '#00AA00',
  error: '#AA0000',
  warning: '#AA5500',
  info: '#00AAAA',
  // Special
  selection: { bg: '#0000AA', fg: '#FFFFFF' }
};
```

---

## Phase 2: Data Display Components

### 2.1 Data Tables
**SRCL Reference**: Data Tables (static and updating)

**Current State**: Simple `tableRow(label, value)` pairs
**Target State**: Full-featured tables with headers, borders, alignment, sorting indicators

```
┌──────────┬────────┬──────────┬──────────┐
│ NAME     │ SYMBOL │ PRICE    │ HOLDINGS │
├──────────┼────────┼──────────┼──────────┤
│ Bitcoin  │ BTC    │ $67,234  │ 1.5      │
│ Ethereum │ ETH    │ $3,456   │ 10.0     │
│ Solana   │ SOL    │ $178     │ 50.0     │
└──────────┴────────┴──────────┴──────────┘
```

**Features**:
- Column alignment (left, right, center)
- Numeric formatting with color coding
- Sorting indicators (▲▼)
- Row highlighting
- Pagination for large datasets
- Live-updating support (flash changed cells)

**Implementation**:
- Create `src/tui/components/data-table.ts`
- Integrate with backtest results, paper trading positions, session lists

**Use Cases**:
- Backtest results display
- Paper trading positions
- Session list
- Trade history
- Portfolio summary

### 2.2 Tree View Component
**SRCL Reference**: Tree Views

**Current State**: None
**Target State**: Hierarchical display for nested data

```
├───╦ Strategies
│   ├─── momentum_btc.json
│   └─── mean_reversion_eth.json
├───╦ Sessions
│   ├───╦ 2024-01-15
│   │   ├─── session_abc123.json
│   │   └─── session_def456.json
│   └───╦ 2024-01-16
│       └─── session_ghi789.json
└───╦ Backtests
    └─── results/
```

**Implementation**:
- Create `src/tui/components/tree-view.ts`
- Support expand/collapse state
- Interactive navigation with arrow keys

**Use Cases**:
- Session browser
- Strategy explorer
- Configuration hierarchy
- Menu systems

### 2.3 Progress Visualization
**SRCL Reference**: Progress Bars, Loaders

**Current State**: Simple `progressBar()` with `█░` characters
**Target State**: Multiple progress styles with custom characters

```
// Standard bar
Processing: [████████████░░░░░░░░] 60%

// Block-style (SRCL block loader)
Loading ⣿⣿⣿⣿⣿⣿⣿⣿░░░░░░░░ 50%

// Retro ASCII
Analyzing: (✿﹏●)(✿﹏●)(✿﹏●)... 75%

// Step progress
Step 2 of 5: ◉ ◉ ○ ○ ○

// Multi-stage pipeline
[████████] → [████░░░░] → [░░░░░░░░]
  Build        Test       Deploy
```

**Implementation**:
- Enhance `src/tui/display.ts` with progress variants
- Create `src/tui/components/progress.ts` for advanced displays

---

## Phase 3: Interactive Components

### 3.1 Menu System
**SRCL Reference**: Action Lists, Dropdown Menu, Navigation Bar

**Current State**: Text-based prompts
**Target State**: Visual menus with selection highlighting

```
┌─ MAIN MENU ─────────────────┐
│ → Strategy Builder          │
│   Backtest Analyst          │
│   Paper Trading             │
│   ───────────────────────── │
│   Settings                  │
│   Help                      │
│   Quit                      │
└─────────────────────────────┘
```

**Features**:
- Arrow key navigation
- Visual selection indicator
- Submenus support
- Keyboard shortcuts
- Descriptions/hints for items

**Implementation**:
- Create `src/tui/components/menu.ts`
- Replace current prompt-based menus
- Integrate with readline for input handling

### 3.2 Form Components
**SRCL Reference**: Input Fields, Checkboxes, Radio Buttons, Select

**Current State**: Basic readline prompts
**Target State**: Visual form inputs with borders and indicators

```
┌─ BACKTEST CONFIGURATION ────────────────────────────┐
│                                                     │
│ Trading Pairs: [BTC/USDT, ETH/USDT_________]       │
│                                                     │
│ Time Range:                                         │
│   Start: [2024-01-01 00:00_____]                   │
│   End:   [2024-01-31 23:59_____]                   │
│                                                     │
│ Initial Balance: [$10,000________]                  │
│                                                     │
│ Strategy Type:                                      │
│   ◉ Momentum                                        │
│   ○ Mean Reversion                                  │
│   ○ Arbitrage                                       │
│                                                     │
│ Options:                                            │
│   ☑ Enable stop-loss                               │
│   ☐ Enable take-profit                             │
│   ☑ Use trailing stops                             │
│                                                     │
│               [ Run Backtest ]  [ Cancel ]          │
└─────────────────────────────────────────────────────┘
```

**Implementation**:
- Create `src/tui/components/form.ts`
- Input field with visual cursor
- Radio button groups
- Checkbox lists
- Select dropdowns
- Form validation display

### 3.3 Dialog/Modal System
**SRCL Reference**: Dialog Components

**Current State**: Inline confirmations
**Target State**: Centered overlay dialogs

```
          ╔═══════════════════════════════╗
          ║       CONFIRM ACTION          ║
          ╠═══════════════════════════════╣
          ║                               ║
          ║  Execute trade for 0.5 BTC?   ║
          ║                               ║
          ║  Amount: $33,617.00           ║
          ║  Fee:    $33.62               ║
          ║                               ║
          ║      [ OK ]    [ Cancel ]     ║
          ║                               ║
          ╚═══════════════════════════════╝
```

**Implementation**:
- Create `src/tui/components/dialog.ts`
- Confirmation dialogs
- Alert/warning/error dialogs
- Input dialogs
- Option dialogs

---

## Phase 4: Specialized Displays

### 4.1 Trading Dashboard
**SRCL Reference**: AS/400 Interface, Dashboard Radar

**Target**: Full-screen trading dashboard with multiple panels

```
╔═══════════════════════════════════════════════════════════════════════╗
║ DONUT CLI v1.0                                     Session: abc123    ║
╠═════════════════════════════════╦═════════════════════════════════════╣
║ PORTFOLIO                       ║ MARKET DATA                         ║
║ ─────────────────────────────── ║ ───────────────────────────────────║
║ BTC:  1.500  │ $100,851.00      ║ BTC/USDT  $67,234.12  ▲ +2.34%     ║
║ ETH:  10.00  │ $34,560.00       ║ ETH/USDT  $3,456.78   ▼ -0.56%     ║
║ SOL:  50.00  │ $8,900.00        ║ SOL/USDT  $178.00     ▲ +5.12%     ║
║ ─────────────────────────────── ║ ───────────────────────────────────║
║ Total: $144,311.00  ▲ +12.4%    ║ Last Update: 12:34:56              ║
╠═════════════════════════════════╬═════════════════════════════════════╣
║ RECENT TRADES                   ║ ACTIVE STRATEGY                     ║
║ ─────────────────────────────── ║ ───────────────────────────────────║
║ 12:30 BUY  BTC 0.1 @ $67,100    ║ Name: Momentum Alpha               ║
║ 12:28 SELL ETH 1.0 @ $3,450     ║ Type: Momentum                     ║
║ 12:15 BUY  SOL 10  @ $175       ║ Confidence: 0.85                   ║
╠═════════════════════════════════╩═════════════════════════════════════╣
║ F1:Help  F2:Trade  F3:Strategy  F4:Backtest  F5:Settings  ESC:Menu   ║
╚═══════════════════════════════════════════════════════════════════════╝
```

**Implementation**:
- Create `src/tui/screens/dashboard.ts`
- Multi-panel layout system
- Real-time data updates
- Keyboard shortcuts

### 4.2 Backtest Results Visualization
**SRCL Reference**: Data Tables, Progress Bars

**Target**: Comprehensive backtest results display

```
╔═══════════════════════════════════════════════════════════════════════╗
║                        BACKTEST RESULTS                               ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║  Strategy: Momentum Alpha          Period: Jan 1 - Jan 31, 2024       ║
║  ─────────────────────────────────────────────────────────────────────║
║                                                                       ║
║  Performance Summary                                                  ║
║  ┌─────────────────────┬─────────────────────┐                        ║
║  │ Initial Balance     │ $10,000.00          │                        ║
║  │ Final Balance       │ $12,340.00          │                        ║
║  │ Total Return        │ +23.40% ████████░░  │                        ║
║  │ Max Drawdown        │ -8.50%  ███░░░░░░░  │                        ║
║  │ Sharpe Ratio        │ 1.85                │                        ║
║  │ Win Rate            │ 62.5%               │                        ║
║  └─────────────────────┴─────────────────────┘                        ║
║                                                                       ║
║  Equity Curve                                                         ║
║  $12.5k ┤                                        ╭─╮                  ║
║  $12.0k ┤                               ╭──────╯   ╰──               ║
║  $11.5k ┤                        ╭─────╯                              ║
║  $11.0k ┤                 ╭─────╯                                     ║
║  $10.5k ┤           ╭────╯                                            ║
║  $10.0k ┼─────────╯                                                   ║
║         └──────────────────────────────────────────────                ║
║          Jan 1    Jan 8    Jan 15   Jan 22   Jan 29                   ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝
```

**Implementation**:
- Create `src/tui/screens/backtest-results.ts`
- ASCII charts for equity curve
- Trade summary tables
- Performance metrics panel

### 4.3 Strategy Builder Interface
**SRCL Reference**: Forms, Text Areas, Code Blocks

**Target**: Visual strategy configuration

```
╔═══════════════════════════════════════════════════════════════════════╗
║                      STRATEGY BUILDER                                 ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║  Strategy Name: [Momentum Alpha____________]                          ║
║                                                                       ║
║  Description:                                                         ║
║  ┌───────────────────────────────────────────────────────────────────┐║
║  │ A momentum-based strategy that identifies trending assets and     │║
║  │ enters positions based on RSI and moving average crossovers.      │║
║  │ _                                                                 │║
║  └───────────────────────────────────────────────────────────────────┘║
║                                                                       ║
║  Trading Pairs:                                                       ║
║    ☑ BTC/USDT                                                        ║
║    ☑ ETH/USDT                                                        ║
║    ☐ SOL/USDT                                                        ║
║    ☐ AVAX/USDT                                                       ║
║                                                                       ║
║  Parameters:                                                          ║
║    Max Positions:    [5___]                                          ║
║    Max Leverage:     [3.0_]                                          ║
║    Min Confidence:   [0.7_] ─────────────●──────── 70%               ║
║                                                                       ║
║  Risk Management:                                                     ║
║    ◉ Conservative (2% max per trade)                                 ║
║    ○ Moderate (5% max per trade)                                     ║
║    ○ Aggressive (10% max per trade)                                  ║
║                                                                       ║
║                    [ Build Strategy ]  [ Cancel ]                     ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝
```

### 4.4 Message/Chat Interface
**SRCL Reference**: Messages Component

**Target**: Improved AI conversation display

```
╔═══════════════════════════════════════════════════════════════════════╗
║ DONUT AI ASSISTANT                                        Session 123 ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║  🍩 Donut AI                                            12:30 PM     ║
║  ┌───────────────────────────────────────────────────────────────┐   ║
║  │ I've analyzed the market data for BTC/USDT. Based on the      │   ║
║  │ momentum indicators, here's what I recommend:                  │   ║
║  │                                                                │   ║
║  │ • RSI is at 65, approaching overbought                        │   ║
║  │ • MACD showing bullish crossover                              │   ║
║  │ • Volume is 20% above average                                 │   ║
║  │                                                                │   ║
║  │ Confidence: 0.78 ████████░░                                   │   ║
║  └───────────────────────────────────────────────────────────────┘   ║
║                                                                       ║
║  👤 You                                                  12:31 PM     ║
║  ┌───────────────────────────────────────────────────────────────┐   ║
║  │ What's the suggested position size?                            │   ║
║  └───────────────────────────────────────────────────────────────┘   ║
║                                                                       ║
║  🍩 Donut AI                                             12:31 PM    ║
║  ┌───────────────────────────────────────────────────────────────┐   ║
║  │ Based on your risk profile and current portfolio, I suggest:   │   ║
║  │                                                                │   ║
║  │ Position: 0.15 BTC (~$10,085)                                 │   ║
║  │ Entry:    $67,234                                             │   ║
║  │ Stop:     $65,000 (-3.3%)                                     │   ║
║  │ Target:   $72,000 (+7.1%)                                     │   ║
║  └───────────────────────────────────────────────────────────────┘   ║
║                                                                       ║
╠═══════════════════════════════════════════════════════════════════════╣
║ > Type your message... _                                              ║
╚═══════════════════════════════════════════════════════════════════════╝
```

---

## Phase 5: Micro-Interactions & Polish

### 5.1 Loading States
**SRCL Reference**: Block Loader, Long Loader

**Current**: Ora spinner
**Target**: Multiple themed loaders

```typescript
// Block spinner characters (rotating)
const BLOCK_CHARS = ['⡀', '⢿', '▗', '▆', '▏', '↗', '└', '◥', '◱', '◵', '◒'];

// Progress dots
const DOT_CHARS = ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷'];

// Classic ASCII
const ASCII_CHARS = ['|', '/', '-', '\\'];
```

**Implementation**:
- Add loader variants to `src/tui/components/loader.ts`
- Context-appropriate loader selection

### 5.2 Alert/Banner System
**SRCL Reference**: Alert Banners

**Target**: Contextual notifications

```
╔═══════════════════════════════════════════════════════════════════════╗
║ ⚠ WARNING: High volatility detected in BTC/USDT market           [×] ║
╚═══════════════════════════════════════════════════════════════════════╝

╔═══════════════════════════════════════════════════════════════════════╗
║ ✓ SUCCESS: Backtest completed - 23.4% return over 30 days        [×] ║
╚═══════════════════════════════════════════════════════════════════════╝

╔═══════════════════════════════════════════════════════════════════════╗
║ ✗ ERROR: Connection to Hummingbot API failed. Retrying...        [×] ║
╚═══════════════════════════════════════════════════════════════════════╝
```

### 5.3 Breadcrumb Navigation
**SRCL Reference**: Breadcrumbs

**Target**: Context trail for nested navigation

```
Main Menu ❯ Strategy ❯ Build ❯ Configuration
```

### 5.4 Tooltips & Help
**SRCL Reference**: Tooltips

**Target**: Contextual help overlays

```
┌─ HELP ──────────────────────────────────────┐
│ Min Confidence: The minimum AI confidence   │
│ score (0.0-1.0) required before executing   │
│ a trade. Higher values = fewer but safer    │
│ trades.                                     │
└─────────────────────────────────────────────┘
```

---

## Implementation Roadmap

### Priority 1: Foundation (High Impact, Moderate Effort)
1. **Enhanced Panel/Box System** - Base for all other components
2. **Data Table Component** - Critical for displaying trading data
3. **Unified Theme System** - Consistent visual language

### Priority 2: Interactive (High Impact, Higher Effort)
4. **Menu System** - Improved navigation experience
5. **Form Components** - Better configuration workflows
6. **Dialog System** - Clean confirmations and alerts

### Priority 3: Specialized Screens (Medium Impact, Higher Effort)
7. **Trading Dashboard** - At-a-glance overview
8. **Backtest Results** - Visual performance analysis
9. **Strategy Builder UI** - Guided strategy creation

### Priority 4: Polish (Lower Impact, Lower Effort)
10. **Loading Variants** - Themed spinners/loaders
11. **Alert Banners** - Notifications
12. **Breadcrumbs** - Navigation context
13. **Tooltips** - Help system

---

## File Structure

```
src/tui/
├── components/
│   ├── index.ts              # Component exports
│   ├── panel.ts              # Box/card/panel rendering
│   ├── data-table.ts         # Table with headers, sorting
│   ├── tree-view.ts          # Hierarchical list
│   ├── menu.ts               # Interactive menu system
│   ├── form.ts               # Form inputs (text, checkbox, radio, select)
│   ├── dialog.ts             # Modal dialogs
│   ├── progress.ts           # Progress bars and indicators
│   ├── loader.ts             # Spinner variants
│   ├── alert.ts              # Notification banners
│   ├── breadcrumb.ts         # Navigation breadcrumbs
│   └── tooltip.ts            # Help tooltips
├── screens/
│   ├── dashboard.ts          # Main trading dashboard
│   ├── backtest-results.ts   # Backtest visualization
│   └── strategy-builder.ts   # Strategy creation UI
├── theme.ts                  # Updated with SRCL-inspired theme
├── display.ts                # Enhanced display utilities
└── index.ts                  # TUI main loop
```

---

## Technical Considerations

### Terminal Compatibility
- Use chalk's detection for color support
- Graceful degradation for limited terminals
- Test on: macOS Terminal, iTerm2, Windows Terminal, VS Code terminal

### Performance
- Batch screen updates to reduce flicker
- Use cursor positioning for partial updates
- Cache computed layouts

### Accessibility
- Maintain keyboard-only navigation
- Clear focus indicators
- Screen reader considerations for critical information

### Testing
- Unit tests for component rendering
- Integration tests for interactive flows
- Visual regression tests (snapshots)

---

## Success Metrics

1. **Visual Consistency**: All screens use unified theme and components
2. **User Feedback**: Improved clarity and usability ratings
3. **Code Quality**: Reusable component architecture
4. **Maintainability**: Centralized theming, easy to update styles
5. **Performance**: No perceptible lag in UI updates

---

## References

- SRCL 1.1.19 Documentation (Sacred Computer React Library)
- Current Donut CLI implementation (`src/tui/`, `src/cli/`)
- MS-DOS interface design patterns
- Terminal UI best practices (blessed, ink, chalk)

---

## Appendix: Component API Examples

### Panel Component

```typescript
import { panel } from './components/panel';

// Basic panel
console.log(panel({
  title: 'PORTFOLIO',
  content: portfolioContent,
  width: 40,
  border: 'double' // 'single' | 'double' | 'rounded'
}));

// Panel with footer
console.log(panel({
  title: 'BACKTEST RESULTS',
  content: resultsContent,
  footer: 'Press Enter to continue',
  variant: 'success' // 'default' | 'success' | 'warning' | 'error'
}));
```

### Data Table Component

```typescript
import { dataTable } from './components/data-table';

console.log(dataTable({
  columns: [
    { key: 'name', label: 'NAME', width: 12, align: 'left' },
    { key: 'symbol', label: 'SYMBOL', width: 8 },
    { key: 'price', label: 'PRICE', width: 10, align: 'right', format: 'currency' },
    { key: 'change', label: 'CHANGE', width: 10, align: 'right', format: 'percent' }
  ],
  data: assets,
  sortBy: 'price',
  sortOrder: 'desc'
}));
```

### Menu Component

```typescript
import { menu } from './components/menu';

const selection = await menu({
  title: 'MAIN MENU',
  items: [
    { key: 's', label: 'Strategy Builder', description: 'Create trading strategies' },
    { key: 'b', label: 'Backtest', description: 'Test strategies on historical data' },
    { key: 'p', label: 'Paper Trading', description: 'Practice with virtual money' },
    { type: 'separator' },
    { key: 'q', label: 'Quit' }
  ],
  selectedIndex: 0
});
```

### Form Component

```typescript
import { form, textInput, checkbox, radio, select } from './components/form';

const config = await form({
  title: 'BACKTEST CONFIGURATION',
  fields: [
    textInput({ name: 'pairs', label: 'Trading Pairs', default: 'BTC/USDT' }),
    textInput({ name: 'startDate', label: 'Start Date', default: '2024-01-01' }),
    textInput({ name: 'balance', label: 'Initial Balance', default: '10000' }),
    select({
      name: 'strategy',
      label: 'Strategy',
      options: ['Momentum', 'Mean Reversion', 'Arbitrage']
    }),
    checkbox({ name: 'stopLoss', label: 'Enable stop-loss', default: true }),
    radio({
      name: 'risk',
      label: 'Risk Level',
      options: [
        { value: 'conservative', label: 'Conservative (2%)' },
        { value: 'moderate', label: 'Moderate (5%)' },
        { value: 'aggressive', label: 'Aggressive (10%)' }
      ]
    })
  ]
});
```

---

*This improvement plan transforms Donut CLI into a visually stunning, retro-terminal experience while maintaining its powerful AI trading capabilities.*
