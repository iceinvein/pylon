# Tool Output Rendering Improvements — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Render tool results inline with ANSI color support, truncate long outputs, track task state in NavRail, and show WebSearch results as clickable links.

**Architecture:** Extract tool results from SDK messages at render time via a correlation map, display them inside existing collapsible tool blocks using a new `CollapsibleOutput` component with ANSI support. Task state is stored in Zustand and rendered in the NavRail. WebSearch gets a dedicated renderer.

**Tech Stack:** React 19, Zustand, Tailwind CSS 4, Framer Motion, ansi-to-html (already installed), Lucide icons

**Security note:** All uses of `dangerouslySetInnerHTML` in this plan are safe — `ansi-to-html` is configured with `escapeXML: true`, which HTML-escapes all text content before wrapping in `<span>` color tags. This is the same pattern already used in `TextBlock.tsx:AnsiOutput`.

---

### Task 1: Create CollapsibleOutput Component

**Files:**
- Create: `src/renderer/src/components/tools/CollapsibleOutput.tsx`

**Step 1: Create the component**

```tsx
import { useState, useCallback } from 'react'
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react'
import { hasAnsiCodes, ansiToHtml } from '../../lib/ansi'

type CollapsibleOutputProps = {
  text: string
  maxPreviewLines?: number
  maxExpandedHeight?: string
}

// eslint-disable-next-line no-control-regex
const ANSI_STRIP = /\x1b\[[0-9;]*m/g

export function CollapsibleOutput({
  text,
  maxPreviewLines = 20,
  maxExpandedHeight = '400px',
}: CollapsibleOutputProps) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const lines = text.split('\n')
  const totalLines = lines.length
  const needsTruncation = totalLines > maxPreviewLines
  const isAnsi = hasAnsiCodes(text)

  const displayText = !expanded && needsTruncation
    ? lines.slice(0, maxPreviewLines).join('\n')
    : text

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text.replace(ANSI_STRIP, ''))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [text])

  return (
    <div className="mt-1.5">
      <div className="relative">
        <button
          onClick={handleCopy}
          className="absolute top-1.5 right-2 z-10 flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-stone-500 transition-colors hover:bg-stone-700 hover:text-stone-300"
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <div
          className="overflow-x-auto rounded bg-stone-800/60 px-3 py-2 font-[family-name:var(--font-mono)] text-xs leading-relaxed text-stone-300"
          style={expanded && needsTruncation ? { maxHeight: maxExpandedHeight, overflowY: 'auto' } : undefined}
        >
          {isAnsi ? (
            <pre
              className="whitespace-pre-wrap"
              // Safe: ansiToHtml uses escapeXML:true — all text is HTML-escaped before color wrapping
              dangerouslySetInnerHTML={{ __html: ansiToHtml(displayText) }}
            />
          ) : (
            <pre className="whitespace-pre-wrap">{displayText}</pre>
          )}
        </div>
      </div>
      {needsTruncation && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 flex items-center gap-1 text-[11px] text-stone-500 transition-colors hover:text-stone-300"
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {expanded ? 'Collapse' : `Show all (${totalLines} lines)`}
        </button>
      )}
    </div>
  )
}
```

**Step 2: Verify the component compiles**

Run: `bun run typecheck:web`
Expected: No new errors related to CollapsibleOutput

**Step 3: Commit**

```bash
git add -f src/renderer/src/components/tools/CollapsibleOutput.tsx
git commit -m "feat: add CollapsibleOutput component with ANSI support and truncation"
```

---

### Task 2: Build Tool Result Correlation Map in ChatView

**Files:**
- Modify: `src/renderer/src/components/messages/ChatView.tsx`
- Modify: `src/renderer/src/components/messages/AssistantMessage.tsx`

**Step 1: Add the result map builder function**

In `ChatView.tsx`, after the existing `SdkMessage` type (line ~27), add:

```ts
type ToolResultBlock = {
  type: string
  tool_use_id?: string
  content?: string | Array<{ type: string; text?: string }>
}

function buildToolResultMap(messages: unknown[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const raw of messages) {
    const msg = raw as SdkMessage
    if (msg.type !== 'user') continue
    const rawContent = msg.content ?? (msg.message as Record<string, unknown> | undefined)?.content
    if (!Array.isArray(rawContent)) continue
    for (const block of rawContent as ToolResultBlock[]) {
      if (block.type === 'tool_result' && block.tool_use_id) {
        const text = typeof block.content === 'string'
          ? block.content
          : Array.isArray(block.content)
            ? block.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n')
            : ''
        if (text) map.set(block.tool_use_id, text)
      }
    }
  }
  return map
}
```

**Step 2: Compute the map with useMemo inside the ChatView component**

Add `useMemo` to the imports (line 1). Inside the component, after `const { agentMap, mainThreadMessages } = useAgentGrouping(...)` (line ~56), add:

```ts
const toolResultMap = useMemo(() => buildToolResultMap(sessionMessages), [sessionMessages])
```

**Step 3: Pass results to ToolUseBlock in renderAssistantContent**

In `renderAssistantContent` (~line 121), update the ToolUseBlock call:
```tsx
<ToolUseBlock
  key={i}
  toolName={block.name ?? 'unknown'}
  input={block.input ?? {}}
  toolUseId={block.id}
  result={toolResultMap.get(block.id ?? '')}
/>
```

**Step 4: Pass toolResultMap to AssistantMessage**

Update the `<AssistantMessage>` call (~line 93):
```tsx
return <AssistantMessage content={content} sessionId={sessionId} toolResultMap={toolResultMap} />
```

**Step 5: Update AssistantMessage to accept and forward toolResultMap**

In `AssistantMessage.tsx`, update the props type:

```tsx
type AssistantMessageProps = {
  content: ContentBlock[]
  sessionId?: string
  toolResultMap?: Map<string, string>
}

export function AssistantMessage({ content, toolResultMap }: AssistantMessageProps) {
  return (
    <div className="space-y-1 px-6 py-2">
      {content.map((block, i) => {
        if (block.type === 'text' && block.text) {
          return <TextBlock key={i} text={block.text} />
        }
        if (block.type === 'thinking' && block.thinking) {
          return <ThinkingBlock key={i} thinking={block.thinking} />
        }
        if (block.type === 'tool_use') {
          return (
            <ToolUseBlock
              key={i}
              toolName={block.name ?? 'unknown'}
              input={block.input ?? {}}
              toolUseId={block.id}
              result={toolResultMap?.get(block.id ?? '')}
            />
          )
        }
        return null
      })}
    </div>
  )
}
```

**Step 6: Verify compilation**

Run: `bun run typecheck:web`
Expected: No new errors

**Step 7: Commit**

```bash
git add src/renderer/src/components/messages/ChatView.tsx src/renderer/src/components/messages/AssistantMessage.tsx
git commit -m "feat: build tool result correlation map and pass results to ToolUseBlock"
```

---

### Task 3: Update ToolUseBlock to Accept and Display Results

**Files:**
- Modify: `src/renderer/src/components/tools/ToolUseBlock.tsx`
- Modify: `src/renderer/src/components/tools/BashTool.tsx`
- Modify: `src/renderer/src/components/tools/GlobGrepTool.tsx`
- Modify: `src/renderer/src/components/tools/GenericTool.tsx`

**Step 1: Add `result` prop to ToolUseBlock**

In `ToolUseBlock.tsx`, update the props type (line ~11):

```ts
type ToolUseBlockProps = {
  toolName: string
  input: Record<string, unknown>
  toolUseId?: string
  result?: string
}
```

Update the component signature (line ~120):
```tsx
export function ToolUseBlock({ toolName, input, result }: ToolUseBlockProps) {
```

Pass `result` to `ToolRenderer` (line ~154):
```tsx
<ToolRenderer toolName={toolName} input={input} result={result} />
```

Update `ToolRenderer` signature and all branches that need result (line ~100):
```tsx
function ToolRenderer({ toolName, input, result }: { toolName: string; input: Record<string, unknown>; result?: string }) {
  const name = toolName.toLowerCase()
  if (name.includes('bash') || name.includes('shell')) {
    return <BashTool input={input} result={result} />
  }
  if (name.includes('read') || name.includes('view')) {
    return <ReadTool input={input} />
  }
  if (name.includes('edit') || name.includes('write') || name.includes('create')) {
    return <EditTool input={input} />
  }
  if (name.includes('glob') || name.includes('grep') || name.includes('search')) {
    return <GlobGrepTool input={input} toolName={toolName} result={result} />
  }
  if (name === 'askuserquestion') {
    return <AskUserQuestionTool input={input} />
  }
  return <GenericTool input={input} result={result} />
}
```

**Step 2: Update BashTool to show result**

Replace `BashTool.tsx` contents:

```tsx
import { Terminal } from 'lucide-react'
import { CollapsibleOutput } from './CollapsibleOutput'

type BashToolProps = {
  input: Record<string, unknown>
  result?: string
}

export function BashTool({ input, result }: BashToolProps) {
  const command = String(input.command ?? input.cmd ?? '')

  return (
    <div>
      <div className="flex items-start gap-2">
        <Terminal size={13} className="mt-0.5 flex-shrink-0 text-green-400" />
        <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap rounded bg-stone-800 px-2 py-1.5 font-[family-name:var(--font-mono)] text-xs text-green-300">
          {command}
        </pre>
      </div>
      {result && <CollapsibleOutput text={result} />}
    </div>
  )
}
```

**Step 3: Update GlobGrepTool to show result**

Replace `GlobGrepTool.tsx` contents:

```tsx
import { Search } from 'lucide-react'
import { CollapsibleOutput } from './CollapsibleOutput'

type GlobGrepToolProps = {
  input: Record<string, unknown>
  toolName: string
  result?: string
}

export function GlobGrepTool({ input, toolName, result }: GlobGrepToolProps) {
  const pattern = String(input.pattern ?? input.glob ?? input.query ?? '')
  const path = input.path ? String(input.path) : undefined
  const isGrep = toolName.toLowerCase().includes('grep')

  return (
    <div>
      <div className="flex items-center gap-2 text-xs">
        <Search size={13} className="flex-shrink-0 text-purple-400" />
        <span className="font-[family-name:var(--font-mono)] text-stone-300">{pattern}</span>
        {path && <span className="text-stone-500">in {path}</span>}
        <span className="ml-auto text-stone-600">{isGrep ? 'grep' : 'glob'}</span>
      </div>
      {result && <CollapsibleOutput text={result} />}
    </div>
  )
}
```

**Step 4: Update GenericTool to show result**

Replace `GenericTool.tsx` contents:

```tsx
import { CollapsibleOutput } from './CollapsibleOutput'

type GenericToolProps = {
  input: Record<string, unknown>
  result?: string
}

export function GenericTool({ input, result }: GenericToolProps) {
  return (
    <div>
      <pre className="overflow-x-auto rounded bg-stone-800 p-2 font-[family-name:var(--font-mono)] text-xs text-stone-300">
        {JSON.stringify(input, null, 2)}
      </pre>
      {result && <CollapsibleOutput text={result} />}
    </div>
  )
}
```

**Step 5: Verify compilation**

Run: `bun run typecheck:web`
Expected: No new errors

**Step 6: Manual verification**

Run: `bun run dev`
- Send a message that triggers Bash tool use — verify output appears beneath the command with ANSI colors rendered
- Send a message that triggers Glob — verify file list appears, truncated at 20 lines if >20 results
- Verify expand/collapse and copy buttons work

**Step 7: Commit**

```bash
git add src/renderer/src/components/tools/ToolUseBlock.tsx src/renderer/src/components/tools/BashTool.tsx src/renderer/src/components/tools/GlobGrepTool.tsx src/renderer/src/components/tools/GenericTool.tsx
git commit -m "feat: display tool results inline with ANSI rendering and collapsible output"
```

---

### Task 4: Create WebSearchTool Component

**Files:**
- Create: `src/renderer/src/components/tools/WebSearchTool.tsx`
- Modify: `src/renderer/src/components/tools/ToolUseBlock.tsx`

**Step 1: Create WebSearchTool**

```tsx
import { ExternalLink } from 'lucide-react'
import { CollapsibleOutput } from './CollapsibleOutput'

type WebSearchToolProps = {
  input: Record<string, unknown>
  result?: string
}

type ParsedLink = {
  title: string
  url: string
  domain: string
}

const URL_REGEX = /https?:\/\/[^\s)<>]+/g

function parseLinks(text: string): ParsedLink[] {
  const links: ParsedLink[] = []
  const lines = text.split('\n')

  for (const line of lines) {
    const urls = line.match(URL_REGEX)
    if (!urls) continue
    for (const url of urls) {
      try {
        const parsed = new URL(url)
        const titlePart = line.split(url)[0].replace(/[-*\[\]()]/g, '').trim()
        const title = titlePart || parsed.pathname.split('/').filter(Boolean).pop() || parsed.hostname
        links.push({
          title,
          url,
          domain: parsed.hostname.replace(/^www\./, ''),
        })
      } catch {
        // skip invalid URLs
      }
    }
  }

  const seen = new Set<string>()
  return links.filter((link) => {
    if (seen.has(link.url)) return false
    seen.add(link.url)
    return true
  })
}

export function WebSearchTool({ input, result }: WebSearchToolProps) {
  const query = String(input.query ?? input.search ?? input.q ?? '')

  if (!result) {
    return (
      <div className="text-xs text-stone-400">
        Searching: <span className="text-stone-300">{query}</span>
      </div>
    )
  }

  const links = parseLinks(result)

  if (links.length === 0) {
    return <CollapsibleOutput text={result} />
  }

  return (
    <div className="space-y-1">
      {links.map((link, i) => (
        <a
          key={i}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded px-2 py-1 text-xs transition-colors hover:bg-stone-800"
        >
          <ExternalLink size={11} className="flex-shrink-0 text-stone-500" />
          <span className="min-w-0 flex-1 truncate text-stone-300">{link.title}</span>
          <span className="flex-shrink-0 text-stone-600">{link.domain}</span>
        </a>
      ))}
    </div>
  )
}
```

**Step 2: Register WebSearchTool in ToolUseBlock**

In `ToolUseBlock.tsx`, add the import:
```ts
import { WebSearchTool } from './WebSearchTool'
```

In `getToolInfo`, add a case **before** the existing glob/grep/search catch-all (before line ~71):
```ts
if (name.includes('websearch') || name.includes('web_search')) {
  return {
    icon: Search,
    label: 'Search',
    summary: String(input.query ?? input.search ?? input.q ?? ''),
    iconColor: 'text-blue-400',
  }
}
```

In `ToolRenderer`, add a case **before** the existing glob/grep/search catch-all (before line ~111):
```ts
if (name.includes('websearch') || name.includes('web_search')) {
  return <WebSearchTool input={input} result={result} />
}
```

**Step 3: Verify compilation**

Run: `bun run typecheck:web`
Expected: No new errors

**Step 4: Commit**

```bash
git add -f src/renderer/src/components/tools/WebSearchTool.tsx src/renderer/src/components/tools/ToolUseBlock.tsx
git commit -m "feat: add WebSearchTool with clickable link rendering"
```

---

### Task 5: Add Task State to Session Store

**Files:**
- Modify: `src/renderer/src/store/session-store.ts`

**Step 1: Add TaskItem type and store fields**

After the `SessionState` type (line ~17), add:

```ts
type TaskItem = {
  id: string
  subject: string
  status: 'pending' | 'in_progress' | 'completed'
  activeForm?: string
}
```

Add to the `SessionStore` type (after `subagentMessages` field, ~line 28):
```ts
tasks: Map<string, TaskItem[]>
```

Add actions to the `SessionStore` type (after `appendSubagentMessage`, ~line 42):
```ts
upsertTask: (sessionId: string, task: TaskItem) => void
clearTasks: (sessionId: string) => void
```

**Step 2: Add initial state and action implementations**

In the `create` call, add initial state (after `subagentMessages: new Map()`):
```ts
tasks: new Map(),
```

Add action implementations (after `appendSubagentMessage`):
```ts
upsertTask: (sessionId, task) =>
  set((state) => {
    const next = new Map(state.tasks)
    const existing = next.get(sessionId) ?? []
    const idx = existing.findIndex((t) => t.id === task.id)
    if (idx >= 0) {
      const updated = [...existing]
      updated[idx] = { ...existing[idx], ...task }
      next.set(sessionId, updated)
    } else {
      next.set(sessionId, [...existing, task])
    }
    return { tasks: next }
  }),

clearTasks: (sessionId) =>
  set((state) => {
    const next = new Map(state.tasks)
    next.delete(sessionId)
    return { tasks: next }
  }),
```

**Step 3: Export TaskItem type**

At the bottom of the file, update the export:
```ts
export type { SessionState, TaskItem }
```

**Step 4: Verify compilation**

Run: `bun run typecheck:web`
Expected: No new errors

**Step 5: Commit**

```bash
git add src/renderer/src/store/session-store.ts
git commit -m "feat: add task tracking state to session store"
```

---

### Task 6: Extract Task State from Messages in IPC Bridge

**Files:**
- Modify: `src/renderer/src/hooks/use-ipc-bridge.ts`

**Step 1: Add task extraction logic**

Inside the `unsubMessage` callback, after the existing handling that calls `store().appendMessage(sessionId, message)` (line ~124), add task extraction:

```ts
// Extract task state from assistant messages containing TaskCreate/TaskUpdate tool calls
if (msg.type === 'assistant') {
  const messageObj = msg.message as { content?: Array<{ type: string; name?: string; input?: Record<string, unknown> }> } | undefined
  const content = messageObj?.content ?? (msg.content as Array<{ type: string; name?: string; input?: Record<string, unknown> }> | undefined)
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block.type !== 'tool_use' || !block.input) continue
      if (block.name === 'TaskCreate') {
        const subject = String(block.input.subject ?? '')
        if (subject) {
          const currentTasks = store().tasks.get(sessionId) ?? []
          const id = String(currentTasks.length + 1)
          store().upsertTask(sessionId, {
            id,
            subject,
            status: 'pending',
            activeForm: block.input.activeForm as string | undefined,
          })
        }
      } else if (block.name === 'TaskUpdate') {
        const taskId = String(block.input.taskId ?? '')
        const status = block.input.status as string | undefined
        if (taskId && (status === 'pending' || status === 'in_progress' || status === 'completed')) {
          const currentTasks = store().tasks.get(sessionId) ?? []
          const existing = currentTasks.find((t) => t.id === taskId)
          store().upsertTask(sessionId, {
            id: taskId,
            subject: (block.input.subject as string) ?? existing?.subject ?? '',
            status,
            activeForm: (block.input.activeForm as string) ?? existing?.activeForm,
          })
        }
      }
    }
  }
}
```

**Step 2: Verify compilation**

Run: `bun run typecheck:web`
Expected: No new errors

**Step 3: Commit**

```bash
git add src/renderer/src/hooks/use-ipc-bridge.ts
git commit -m "feat: extract TaskCreate/TaskUpdate state from SDK messages"
```

---

### Task 7: Create TasksPanel Component and Add to NavRail

**Files:**
- Create: `src/renderer/src/components/layout/TasksPanel.tsx`
- Modify: `src/renderer/src/components/layout/NavRail.tsx`

**Step 1: Create TasksPanel**

```tsx
import { motion, AnimatePresence } from 'motion/react'
import { CheckCircle, Circle, Loader } from 'lucide-react'
import { useSessionStore } from '../../store/session-store'
import type { TaskItem } from '../../store/session-store'

type TasksPanelProps = {
  sessionId: string | null
}

function TaskIcon({ status }: { status: TaskItem['status'] }) {
  if (status === 'completed') return <CheckCircle size={12} className="text-green-500" />
  if (status === 'in_progress') return <Loader size={12} className="animate-spin text-amber-400" />
  return <Circle size={12} className="text-stone-600" />
}

export function TasksPanel({ sessionId }: TasksPanelProps) {
  const tasks = useSessionStore((s) => (sessionId ? s.tasks.get(sessionId) : undefined)) ?? []

  if (tasks.length === 0) return null

  const completed = tasks.filter((t) => t.status === 'completed').length
  const total = tasks.length

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      className="border-t border-stone-800 px-2 py-2"
    >
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="text-[11px] font-medium text-stone-400">
          Tasks {completed}/{total}
        </span>
      </div>

      <div className="mb-2 h-0.5 overflow-hidden rounded-full bg-stone-800 mx-1">
        <motion.div
          className="h-full rounded-full bg-amber-500"
          initial={{ width: 0 }}
          animate={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        />
      </div>

      <AnimatePresence>
        {tasks.map((task) => (
          <motion.div
            key={task.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-1.5 rounded px-1 py-0.5"
            title={task.subject}
          >
            <TaskIcon status={task.status} />
            <span
              className={`min-w-0 flex-1 truncate text-[11px] ${
                task.status === 'completed'
                  ? 'text-stone-600 line-through'
                  : task.status === 'in_progress'
                    ? 'text-amber-300'
                    : 'text-stone-400'
              }`}
            >
              {task.status === 'in_progress' && task.activeForm
                ? task.activeForm
                : task.subject}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  )
}
```

**Step 2: Add TasksPanel to NavRail**

In `NavRail.tsx`, add imports:
```ts
import { TasksPanel } from './TasksPanel'
```

Update `useTabStore` destructuring to get active session:
```ts
const { addTab, activeTabId, tabs } = useTabStore()
const activeTab = tabs.find((t) => t.id === activeTabId)
const activeSessionId = activeTab?.sessionId ?? null
```

Note: check the tab store export to confirm `activeTabId` and `tabs` are available. If the store uses different names, adapt accordingly.

Add TasksPanel at the bottom of the NavRail, just before the closing `</div>`:
```tsx
<div className="mt-auto">
  <TasksPanel sessionId={activeSessionId} />
</div>
```

**Step 3: Verify compilation**

Run: `bun run typecheck:web`
Expected: No new errors

**Step 4: Manual verification**

Run: `bun run dev`
- Send a message that triggers TaskCreate calls — verify tasks appear in NavRail
- Verify status transitions (pending -> in_progress -> completed) update icons
- Verify progress bar fills as tasks complete
- Verify panel hides when no tasks exist

**Step 5: Commit**

```bash
git add -f src/renderer/src/components/layout/TasksPanel.tsx src/renderer/src/components/layout/NavRail.tsx
git commit -m "feat: add TasksPanel widget to NavRail with live task tracking"
```

---

### Task 8: Final Integration Verification

**Step 1: Run full typecheck**

Run: `bun run typecheck`
Expected: Clean pass for both node and web

**Step 2: Run dev server and test all four features**

Run: `bun run dev`

Test each feature:
1. **ANSI colors** — Ask Claude to run a command that produces colored output (e.g. `ls --color` or a failing test). Verify colors render, not raw `[31m` codes.
2. **Long output truncation** — Ask Claude to glob for `**/*.ts`. Verify output shows first 20 lines with "Show all (N lines)" button. Click expand, verify max-height scroll. Click collapse.
3. **Task tracking** — Ask Claude to do something that creates tasks. Verify NavRail shows tasks panel with progress bar and status icons.
4. **WebSearch links** — Ask Claude to search the web. Verify results show as clickable links that open in browser.

**Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: integration fixes for tool output rendering"
```
