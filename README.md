<p align="center">
  <img src="resources/icon.png" alt="Pylon" width="128" height="128" />
</p>

<h1 align="center">Pylon</h1>

<p align="center">
  A native desktop client for Claude, built on the <a href="https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk">Claude Agent SDK</a>.<br/>
  Rich chat interface · tool visualization · git management · PR reviews · AI testing · multi-session tabs
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-39-47848F?logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS" />
</p>

---

## Features

### Chat & Conversation

- **Agentic chat** — Full Claude Agent SDK integration with tool use, extended thinking, and subagent orchestration
- **Model selection** — Switch between Claude Opus 4.6, Sonnet 4.6, and Haiku 4.5
- **Effort levels** — Adjust reasoning depth (low / medium / high / max) per session
- **Real-time streaming** — Token streaming at 60 fps with delta batching via `requestAnimationFrame`
- **Extended thinking** — Expandable/collapsible thinking blocks showing Claude's reasoning
- **Subagent support** — Visual containers for multi-agent orchestration with threaded message history
- **Session persistence** — All sessions and messages stored in SQLite (WAL mode), resumable across app restarts
- **Session resume** — Resume previous sessions with full context restoration
- **Context window indicator** — Live progress bar showing token usage vs. model context limit, with color-coded warnings
- **Cost tracking** — Real-time token usage and USD cost per session
- **Draft persistence** — Draft messages preserved across tab switches

### Tool Visualization

Rich, purpose-built renderers for every tool Claude can use:

| Tool | Rendering |
|------|-----------|
| **Bash** | Terminal-style output with ANSI color support |
| **Read** | File contents with syntax highlighting |
| **Edit** | Inline diff preview of changes |
| **Write** | New file creation with content display |
| **Glob / Grep** | File match results with paths |
| **TodoWrite** | Task items extracted into a sidebar panel with status tracking |
| **WebSearch** | Search results with clickable links |
| **AskUserQuestion** | Multi-select question dialogs with option descriptions |
| **Generic** | Fallback renderer for any other tool |

### Git Management

Full-featured git panel accessible from the navigation rail:

- **Graph visualization** — Canvas-rendered commit graph with lane assignment, branch coloring, and interactive commit selection
- **Branch list** — View and checkout local and remote branches
- **Commit detail** — Inspect any commit with an AI "explain" button powered by Claude
- **AI commit** — Stage files, get AI-generated commit messages with inline editing, and commit — all from the panel
- **Natural language operations** — Type git operations in plain English (e.g. "rebase onto main") and Claude translates to commands with a confirmation step
- **Conflict resolution** — AI-powered merge conflict resolver with per-file confidence badges

### Git Worktree Isolation

- **Automatic worktrees** — Optionally run each session in an isolated git worktree (`~/.pylon/worktrees/`)
- **Dirty state detection** — Prompts to create a worktree when the repo has uncommitted changes
- **Branch management** — Auto-creates branches named `claude/{title-slug}`
- **Baseline diffing** — Captures git baseline on first Edit/Write to show only session changes
- **Merge & cleanup** — Dialog to merge worktree changes back or discard, with conflict detection

### File Change Tracking

- **Changes panel** — Visual list of all modified/added/deleted/renamed files with status badges (A/M/D/R/U)
- **Unified diffs** — View diffs for every file Claude has touched, computed against the session baseline
- **Attachments** — Drag-and-drop or paste images and text files into the chat with inline previews

### GitHub PR Reviews

- **PR browsing** — List and inspect pull requests from your GitHub repos via `gh` CLI
- **AI-powered reviews** — Multi-agent review system with specialized focus areas:
  - **Security** — Authentication, injection, secrets, crypto flaws
  - **Bugs** — Logic errors, null checks, state handling
  - **Performance** — N+1 queries, unnecessary renders, memory leaks
  - **Style** — Naming, formatting, consistency, duplication
  - **Architecture** — Design patterns, abstractions, separation of concerns
  - **UX** — User experience and usability concerns
- **Smart chunking** — Large diffs automatically split into reviewable chunks for parallel agents
- **Findings UI** — Severity-filtered results (critical / warning / suggestion / nitpick) with file and line references
- **Split diff view** — Side-by-side diff display with inline finding annotations
- **Post to GitHub** — Post individual findings or batch-post as a full review
- **Review history** — Browse and revisit past reviews
- **Custom prompts** — Edit each review agent's system prompt with reset-to-default

### PR Creation

- **Raise PRs from Pylon** — Create pull requests without leaving the app
- **AI-generated descriptions** — Claude analyzes your commits and diffs to draft PR title and body
- **Commit & file overview** — Review included commits and changed files before submitting
- **Metadata controls** — Set base branch and squash preferences

### AI Exploration Testing

AI-powered E2E testing that explores your app and finds bugs:

- **Project scanning** — Auto-detects framework, dev command, port, package manager, and Playwright config
- **Dev server management** — Automatically starts and manages your dev server during test runs
- **Goal suggestions** — Claude analyzes your project and suggests exploration goals
- **Manual & requirements modes** — Explore freely or constrain agents to specific requirements
- **Batch orchestration** — Run multiple exploration agents in parallel across different goals
- **Findings dashboard** — Severity-graded results (critical / high / medium / low / info) with reproduction steps and screenshots
- **Test generation** — Agents produce Playwright test files you can add to your suite
- **Cost tracking** — Per-exploration token usage and cost

### Plan Detection & Review

- **Auto-detection** — Recognizes plan/design files (`*-plan.md`, `*-design.md`, `docs/plans/*`, `docs/specs/*`)
- **Hierarchical parsing** — Sections parsed into H2 parent / H3 children structure
- **Per-section comments** — Add comments to individual sections of a plan
- **Approval flow** — Approve plans or request changes through a dedicated dialog

### Tool Permissions

- **Ask mode** — Interactive modal for each tool call, showing tool name and input preview
- **Auto-approve mode** — "YOLO" mode that grants all permissions automatically
- **Pattern suggestions** — Suggested permission patterns when granting access

### UI & Navigation

- **Multi-session tabs** — Open parallel sessions with `Cmd+N`, switch with `Cmd+1..9`
- **Tab persistence** — Open tabs restored on app restart with lazy hydration
- **Command palette** — Searchable quick-action menu (`Cmd+Shift+K`) with session commands, global commands, and recent sessions
- **Navigation rail** — Left sidebar with Home, History, PR Review, AI Testing, and Settings views
- **Status bar** — Bottom bar showing current branch, ahead/behind counts, and git panel toggle
- **Agent flow visualization** — Graph view of agent/subagent execution with flow nodes
- **Settings overlay** — Tabbed settings for general config, review agents, and integrations (`Cmd+K`)
- **Plugin management** — View and toggle installed Claude Code plugins
- **Dark theme** — Purpose-built dark interface
- **Animated transitions** — Smooth motion effects via Motion (Framer Motion)

### Usage Analytics

- **Spending dashboard** — Daily cost trends (area chart), token usage by day, cost breakdown by model and project
- **Top sessions** — 10 most expensive sessions at a glance
- **Time filters** — 7-day, 30-day, 90-day, and all-time views

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+N` | New tab |
| `Cmd+1..9` | Switch to tab by index |
| `Cmd+Shift+K` | Command palette |
| `Cmd+K` | Settings |
| `Escape` | Close modal / palette |

---

## Prerequisites

- [Bun](https://bun.sh) v1.1+
- A valid [Claude Code](https://claude.ai/code) login (the app uses your existing Claude Code authentication)
- [GitHub CLI](https://cli.github.com/) (`gh`) — optional, required for PR review and PR creation features

## Getting Started

```bash
# Install dependencies
bun install

# Start in development mode (with HMR)
bun run dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start Electron dev server with HMR |
| `bun run build` | Production build |
| `bun run start` | Preview production build |
| `bun run typecheck` | Typecheck main + renderer |
| `bun run typecheck:node` | Typecheck main/preload only |
| `bun run typecheck:web` | Typecheck renderer only |
| `bun run lint` | Check lint + format violations |
| `bun run lint:fix` | Auto-fix safe violations |
| `bun run format` | Format all source files |
| `bun test` | Run all tests |

## Architecture

```
src/
├── main/                 # Electron main process
│   ├── index.ts              # App bootstrap, window creation, DB init
│   ├── session-manager.ts    # Session lifecycle, SDK orchestration, git worktrees
│   ├── ipc-handlers.ts       # IPC channel registrations
│   ├── db.ts                 # SQLite schema (WAL mode) & migrations
│   ├── pr-review-manager.ts  # Multi-agent PR review orchestration
│   ├── diff-chunker.ts       # Smart diff chunking for parallel review agents
│   ├── gh-cli.ts             # GitHub CLI wrapper for PR operations
│   ├── git-graph-service.ts  # Git log parsing and lane assignment
│   ├── git-commit-service.ts # Staging, message generation, commit execution
│   ├── git-ops-service.ts    # NL command execution and conflict handling
│   ├── git-ai-bridge.ts      # Claude SDK bridge for git AI features
│   ├── git-ipc-handlers.ts   # Git-specific IPC registrations
│   ├── git-watcher.ts        # Filesystem watcher for git status changes
│   ├── git-status.ts         # Branch status polling
│   ├── test-manager.ts       # AI exploration test orchestration
│   ├── test-tools.ts         # Playwright tool definitions for test agents
│   ├── server-manager.ts     # Dev server lifecycle management
│   ├── project-scanner.ts    # Framework/port/config auto-detection
│   └── worktree-cleanup.ts   # Worktree lifecycle management
├── preload/              # Context bridge (window.api)
│   ├── index.ts
│   └── index.d.ts
├── renderer/src/         # React frontend
│   ├── App.tsx               # Route dispatch, keyboard shortcuts, IPC bridge
│   ├── pages/                # HomePage, SessionView, PrReviewView, TestView
│   ├── store/                # Zustand stores (session, tab, ui, draft,
│   │                         #   pr-review, pr-raise, git-graph, git-commit,
│   │                         #   git-ops, test)
│   ├── hooks/                # IPC bridge, folder picker, Shiki loader,
│   │                         #   git bridge, test bridge, PR review bridge
│   ├── lib/                  # Delta batcher, context usage, git graph layout,
│   │                         #   task extraction, ANSI parser, flow graph
│   └── components/
│       ├── messages/         # Chat bubbles, thinking, permissions, questions
│       ├── tools/            # Tool-specific renderers (Bash, Edit, etc.)
│       ├── layout/           # Shell, NavRail, TabBar
│       ├── git/              # GitPanel, GraphTab, CommitTab, OpsTab,
│       │                     #   ConflictResolver, BranchList, CommitDetail
│       ├── pr-review/        # PR list, detail, split diff, findings, review
│       ├── pr-raise/         # PR creation overlay with AI descriptions
│       ├── flow/             # Agent execution flow visualization
│       └── review/           # Inline code review UI
└── shared/               # Types, IPC channel constants, logger
```

**Key data flow:** Renderer invokes `window.api.*()` → `ipcMain.handle()` → SessionManager calls Claude Agent SDK → messages stream back via IPC → delta batcher flushes to Zustand at 60 fps → React renders.

## Tech Stack

- **Runtime:** [Electron 39](https://www.electronjs.org/) + [electron-vite](https://electron-vite.org/)
- **Frontend:** [React 19](https://react.dev/), [Tailwind CSS 4](https://tailwindcss.com/), [Zustand](https://zustand.docs.pmnd.rs/)
- **Routing:** [Wouter](https://github.com/molefrog/wouter)
- **Database:** [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) (WAL mode)
- **AI:** [@anthropic-ai/claude-agent-sdk](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)
- **Charts:** [Recharts](https://recharts.org/)
- **Animations:** [Motion](https://motion.dev/) (formerly Framer Motion)
- **Syntax Highlighting:** [Shiki](https://shiki.style/)
- **Markdown:** [react-markdown](https://github.com/remarkjs/react-markdown) + [remark-gfm](https://github.com/remarkjs/remark-gfm)
- **Icons:** [Lucide React](https://lucide.dev/)
- **Linting:** [Biome](https://biomejs.dev/)

## License

Private — not yet published.
