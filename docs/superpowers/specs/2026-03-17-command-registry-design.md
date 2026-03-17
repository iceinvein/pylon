# Command Registry Design

## Problem

Pylon's slash commands are hardcoded inside `CommandPalette.tsx` in a `useMemo` block. This couples command definitions to the palette UI, making it impossible for other consumers (like a future InputBar autocomplete) to access the same command list. Adding new commands means editing a large React component instead of a focused module.

## Solution

A renderer-side command registry module that owns all slash command definitions. The `CommandPalette` becomes a pure consumer — it queries the registry and renders results. Future consumers (InputBar autocomplete, keyboard shortcuts) can query the same registry.

## Design Decisions

- **Renderer-only** — commands compose existing `window.api.*` methods and Zustand stores. No new IPC channels or main-process logic.
- **Registry replaces inline commands** — CommandPalette owns zero command definitions. Single source of truth.
- **Static metadata with filter flags** — each command is a plain object with `requiresSession: boolean`. No factory functions.
- **Mixed output styles** — commands declare their own behavior. Some inject system messages into chat, some toggle UI overlays, some send text to the SDK. The registry doesn't prescribe a pattern.

## Types

```typescript
type CommandContext = {
  sessionId: string | null
  activeTabId: string | null
  cwd: string | null
  model: string
  permissionMode: string
}

type SlashCommand = {
  id: string
  label: string
  description: string
  icon: LucideIcon
  section: 'session' | 'global'
  requiresSession: boolean
  keywords?: string[]
  execute: (context: CommandContext) => void | Promise<void>
}
```

### Field semantics

- `id` — unique key used for direct lookup (e.g., `'commit'`, `'compact'`)
- `label` — display name shown in the palette and autocomplete
- `description` — one-liner explaining what the command does
- `icon` — Lucide icon component, consistent with existing palette styling
- `section` — groups commands in palette UI: `'session'` (active session commands) or `'global'` (always available)
- `requiresSession` — when `true`, the command is filtered out if `context.sessionId` is null
- `keywords` — optional extra terms for fuzzy matching (e.g., `['git']` for commit)
- `execute` — receives a read-only context snapshot for conditional logic. Commands import stores (`useSessionStore`, `useTabStore`, `useUiStore`) and `window.api` directly at the module level — context is not the command's only input, it's a convenience snapshot of the current state

## Registry Module

**File:** `src/renderer/src/lib/command-registry.ts`

### Exports

- `COMMANDS: SlashCommand[]` — the full list of registered commands
- `getCommands(context: CommandContext): SlashCommand[]` — returns commands available in the given context (filters by `requiresSession`)
- `findCommand(id: string): SlashCommand | undefined` — direct lookup by ID

### Filtering logic

`getCommands` filters based on one rule:

```
if (command.requiresSession && !context.sessionId) → exclude
```

No other filtering. The consumer (CommandPalette) handles text search against `label`, `description`, and `keywords` using the existing `String.includes()` approach (not fuzzy matching).

### Palette dismissal

CommandPalette dismisses itself (calls `toggleCommandPalette()`) before invoking `execute()`. Commands do not need to manage palette visibility.

### Command ordering

Commands are displayed in `COMMANDS` array definition order. No explicit priority field — the array position is the display order.

## Initial Command Set

### Session commands (requiresSession: true)

| ID | Label | Description | Behavior |
|---|---|---|---|
| `clear` | Clear chat | Clear conversation and start fresh | Stop session, clear Zustand messages/tasks, reset tab's sessionId to null |
| `commit` | Commit | Commit current changes with AI-generated message | Append user message "commit", call `sendMessage(sessionId, 'commit')` |
| `compact` | Compact conversation | Summarize and compress history to save context | Call `sendMessage(sessionId, '/compact')` |
| `cost` | Show cost | Display token usage and cost | Call `sendMessage(sessionId, '/cost')` |
| `status` | Show status | Display session info, model, cwd, and cost | Inject a system message showing: model name, cwd, permission mode, and session duration |

### Global commands (requiresSession: false)

| ID | Label | Description | Behavior |
|---|---|---|---|
| `help` | Help | Show available commands | Inject a system message listing all commands returned by `getCommands(context)` — i.e., only commands available in the current context |
| `config` | Settings | Open settings | Toggle SettingsOverlay via ui-store |
| `open-folder` | Open folder | Open a project folder in a new tab | Call `window.api.openFolder()`, then `addTab(path)` |

## CommandPalette Changes

### Before (current)

CommandPalette builds commands in a `useMemo` that mixes command definitions with UI logic. The palette owns both what commands exist and how they're displayed.

### After

1. Import `getCommands` from `command-registry`
2. Build `CommandContext` from existing store hooks (`useTabStore`, `useSessionStore`, `useUiStore`)
3. Replace the `useMemo` commands block with `getCommands(context)`
4. Keep the "recent sessions" section unchanged — it's a separate data source appended after registry commands
5. Text filtering against `label`, `description`, and `keywords` stays in the palette

### What stays the same

- Keyboard navigation (arrow keys, Enter)
- Visual design and animations
- The "recent sessions" section
- Cmd+K toggle
- InputBar's `/` trigger opening the palette
- `SLASH_EXECUTE` IPC channel left as-is (unused)

## File Changes

| File | Change |
|---|---|
| `src/renderer/src/lib/command-registry.ts` | **New** — types, COMMANDS array, getCommands, findCommand |
| `src/renderer/src/lib/command-registry.test.ts` | **New** — unit tests for registry functions |
| `src/renderer/src/components/CommandPalette.tsx` | **Modified** — remove inline command definitions, import and consume registry |

## Tests

`src/renderer/src/lib/command-registry.test.ts` covers:

- `getCommands` returns all commands when sessionId is present
- `getCommands` filters out `requiresSession: true` commands when sessionId is null
- `findCommand` returns the correct command by ID
- `findCommand` returns undefined for unknown IDs
- `COMMANDS` array has no duplicate IDs

## Out of Scope

- InputBar inline autocomplete (future feature that will consume the registry)
- Main-process command handlers
- Custom/user-defined commands
- The `SLASH_EXECUTE` IPC channel (left as dead code)
