# Tool Output Rendering Improvements

Date: 2026-03-06

## Overview

Four UI improvements to how tool outputs are rendered in the chat view:

1. ANSI color codes rendered as actual colors (not raw escape sequences)
2. Long tool outputs (100+ lines) truncated with expand/scroll
3. Task state tracked and shown in NavRail widget
4. WebSearch results rendered as clickable link lists

## 1. Tool Result Correlation

### Problem
Tool results (`tool_result` blocks in SDK user messages) are currently hidden entirely by `isToolResultMessage()`. Tool use blocks only show inputs, never outputs.

### Solution
Build a `Map<toolUseId, resultText>` in ChatView at render time by scanning messages for `tool_result` blocks. Pass the result as an optional `result?: string` prop to `ToolUseBlock`, which forwards it to tool-specific renderers.

### Data Flow
```
assistant msg → { content: [{ type: "tool_use", id: "xyz", name: "Bash", input: {...} }] }
user msg      → { content: [{ type: "tool_result", tool_use_id: "xyz", content: "..." }] }
                                                    ↓
                           buildToolResultMap() extracts content, keyed by tool_use_id
                                                    ↓
                           <ToolUseBlock result={map.get(toolUseId)} />
```

## 2. CollapsibleOutput Component

### Purpose
Reusable wrapper for long text output with ANSI support.

### Props
```ts
type CollapsibleOutputProps = {
  text: string
  maxPreviewLines?: number   // default 20
  maxExpandedHeight?: string // default "400px"
}
```

### Behavior
- <= 20 lines: render fully, no collapse UI
- > 20 lines: show first 20 lines + "Show all (N lines)" button
- When expanded: `max-h-[400px] overflow-y-auto` scrollable container + "Collapse" button
- ANSI detection: if `hasAnsiCodes(text)` is true, render via `ansiToHtml`; otherwise plain `<pre>`
- Copy button strips ANSI codes before clipboard write

### Integration
Used by BashTool, GlobGrepTool, GenericTool for rendering result text. ReadTool and EditTool don't show results.

## 3. Tasks Widget in NavRail

### Store Changes
Add to session-store:
```ts
type TaskItem = {
  id: string
  subject: string
  status: 'pending' | 'in_progress' | 'completed'
  activeForm?: string
}

tasks: Map<string, TaskItem[]>  // keyed by sessionId
setTasks: (sessionId: string, tasks: TaskItem[]) => void
upsertTask: (sessionId: string, task: TaskItem) => void
```

### Data Extraction
In `use-ipc-bridge.ts`, intercept assistant messages containing `TaskCreate`/`TaskUpdate` tool_use blocks. Extract task state from tool input. Assign sequential client-side IDs (session-scoped, monotonic).

### UI
Collapsible `TasksPanel` in NavRail, visible only when active session has tasks:
- Header: "Tasks 3/5" with completed/total count
- Thin amber progress bar
- Compact single-line items: status icon + subject (truncated)
  - completed: muted, strikethrough, checkmark
  - in_progress: amber spinner
  - pending: dim circle
- Hidden when no tasks exist
- Auto-collapses when all tasks completed

## 4. WebSearch Clickable Links

### New Component
`WebSearchTool.tsx` — detected in ToolUseBlock when tool name contains `websearch`.

### Collapsed Summary
Shows the search query text.

### Expanded Detail (with result)
Parse result text for URLs/titles. Render as compact clickable list:
- Each item: title (or URL) + domain
- Click opens in external browser via `window.open(url, '_blank')`
- Falls back to `CollapsibleOutput` if result doesn't parse as structured links

## 5. ANSI in Tool Results

No new component. Handled by `CollapsibleOutput`:
- Uses existing `hasAnsiCodes()` and `ansiToHtml()` from `lib/ansi.ts`
- `ansi-to-html` already configured with `escapeXML: true` (XSS-safe)
- Copy strips ANSI codes before clipboard write

## Files to Modify

- `src/renderer/src/components/messages/ChatView.tsx` — build tool result map, pass to ToolUseBlock
- `src/renderer/src/components/tools/ToolUseBlock.tsx` — accept and forward `result` prop
- `src/renderer/src/components/tools/BashTool.tsx` — render result via CollapsibleOutput
- `src/renderer/src/components/tools/GlobGrepTool.tsx` — render result via CollapsibleOutput
- `src/renderer/src/components/tools/GenericTool.tsx` — render result via CollapsibleOutput

## Files to Create

- `src/renderer/src/components/tools/CollapsibleOutput.tsx`
- `src/renderer/src/components/tools/WebSearchTool.tsx`
- `src/renderer/src/components/layout/TasksPanel.tsx`

## Store Changes

- `src/renderer/src/store/session-store.ts` — add tasks state + actions
- `src/renderer/src/hooks/use-ipc-bridge.ts` — extract task state from messages
- `src/renderer/src/components/layout/NavRail.tsx` — render TasksPanel
