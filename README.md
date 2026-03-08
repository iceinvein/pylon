# Claude UI

A native desktop app for interacting with Claude, built on the [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk). Provides a rich chat interface with tool execution visualization, file diffs, git worktree isolation, and multi-session tab management.

![Electron](https://img.shields.io/badge/Electron-39-47848F?logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)

## Features

- **Agentic chat** — Full Claude Agent SDK integration with tool use, extended thinking, and subagent support
- **Tool visualization** — Rich rendering for Bash, Read, Edit, Write, Glob, Grep, TodoWrite, WebSearch, and more
- **Git worktree isolation** — Optionally run each session in an isolated git worktree so changes don't touch your working tree
- **File change tracking** — See diffs for all files Claude has modified, computed against a baseline snapshot
- **Multi-session tabs** — Open multiple sessions side-by-side with Cmd+N / Cmd+1..9
- **Tool permissions** — Approve or deny each tool call, or enable auto-approve mode
- **Markdown rendering** — GitHub Flavored Markdown with Shiki syntax highlighting
- **Session persistence** — All sessions and messages stored in SQLite, resumable across app restarts
- **Streaming** — Real-time token streaming at 60fps with delta batching

## Prerequisites

- [Bun](https://bun.sh) (v1.1+)
- A valid [Claude Code](https://claude.ai/code) login (the app uses your existing Claude Code authentication)

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

## Project Structure

```
src/
├── main/             # Electron main process
│   ├── index.ts          # App bootstrap, window creation
│   ├── session-manager.ts # Session lifecycle, SDK orchestration, git ops
│   ├── ipc-handlers.ts    # IPC channel registration
│   └── db.ts              # SQLite schema & initialization
├── preload/          # Context bridge (window.api)
│   ├── index.ts
│   └── index.d.ts
├── renderer/src/     # React frontend
│   ├── App.tsx
│   ├── pages/            # HomePage, SessionView
│   ├── store/            # Zustand stores (session, tab, ui)
│   ├── hooks/            # IPC bridge, folder open, Shiki
│   ├── lib/              # Delta batcher, task extraction
│   └── components/
│       ├── messages/     # Chat bubbles, thinking, permissions
│       ├── tools/        # Tool-specific renderers
│       └── layout/       # Shell, NavRail, TabBar
└── shared/           # Types & IPC channel constants
```

## Tech Stack

- **Framework:** [Electron](https://www.electronjs.org/) + [electron-vite](https://electron-vite.org/)
- **Frontend:** [React 19](https://react.dev/), [Tailwind CSS 4](https://tailwindcss.com/), [Zustand](https://zustand.docs.pmnd.rs/)
- **Routing:** [Wouter](https://github.com/molefrog/wouter)
- **Database:** [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) (WAL mode)
- **AI:** [@anthropic-ai/claude-agent-sdk](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)
- **Syntax Highlighting:** [Shiki](https://shiki.style/)
- **Icons:** [Lucide React](https://lucide.dev/)

## License

Private — not yet published.
