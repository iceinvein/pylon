# UI Uplift Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the current harsh black/white zinc UI into a warm, mellow stone-based design with sticky user messages, rich code blocks, and hybrid typography (Inter + JetBrains Mono).

**Architecture:** Pure styling refactor — no structural/logic changes. Every file gets its Tailwind classes updated from zinc-* to stone-* palette. ChatView gets sticky user message sections. TextBlock gets rich code blocks with copy buttons. Fonts bundled locally due to CSP restrictions.

**Tech Stack:** Tailwind CSS v4, React, lucide-react (existing). New: locally bundled Inter + JetBrains Mono font files.

---

### Task 1: Bundle fonts locally

**Files:**
- Create: `src/renderer/src/fonts/` directory
- Modify: `src/renderer/src/styles/globals.css`
- Modify: `src/renderer/index.html` (update CSP if needed)

**Step 1: Download Inter and JetBrains Mono font files**

Run:
```bash
mkdir -p src/renderer/src/fonts
# Download Inter (variable weight)
curl -L "https://github.com/rsms/inter/raw/master/docs/font-files/InterVariable.woff2" -o src/renderer/src/fonts/InterVariable.woff2
# Download JetBrains Mono (variable weight)
curl -L "https://github.com/JetBrains/JetBrainsMono/raw/master/fonts/variable/JetBrainsMono%5Bwght%5D.woff2" -o src/renderer/src/fonts/JetBrainsMono-Variable.woff2
```

If the URLs fail, search for the latest download links. Alternative: use `@fontsource/inter` and `@fontsource/jetbrains-mono` npm packages via `bun install`.

**Step 2: Update globals.css with @font-face declarations and CSS custom properties**

Replace the entire `src/renderer/src/styles/globals.css` with:

```css
@import "tailwindcss";
@plugin "@tailwindcss/typography";

@font-face {
  font-family: 'Inter';
  src: url('../fonts/InterVariable.woff2') format('woff2');
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'JetBrains Mono';
  src: url('../fonts/JetBrainsMono-Variable.woff2') format('woff2');
  font-weight: 100 800;
  font-style: normal;
  font-display: swap;
}

:root {
  --font-sans: 'Inter', ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, 'Cascadia Code', 'Fira Code', monospace;
}

body {
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Custom scrollbar for the warm theme */
::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: #44403c;
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: #57534e;
}
```

**Step 3: Verify fonts load**

Run: `bun run dev`
Expected: App launches with Inter for body text, visible font change from default sans-serif.

**Step 4: Commit**

```bash
git add src/renderer/src/fonts/ src/renderer/src/styles/globals.css
git commit -m "feat: bundle Inter and JetBrains Mono fonts locally"
```

---

### Task 2: Reskin Layout shell (Layout, NavRail, TabBar)

**Files:**
- Modify: `src/renderer/src/components/layout/Layout.tsx`
- Modify: `src/renderer/src/components/layout/NavRail.tsx`
- Modify: `src/renderer/src/components/layout/TabBar.tsx`

**Step 1: Update Layout.tsx**

Replace the root div classes:

Old: `"flex h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100"`
New: `"flex h-screen w-screen overflow-hidden bg-stone-950 text-stone-200"`

**Step 2: Update NavRail.tsx**

Replace the nav container classes:

Old: `"flex w-[50px] flex-col items-center gap-1 border-r border-zinc-800 bg-zinc-950 pt-12 pb-3"`
New: `"flex w-[50px] flex-col items-center gap-1 border-r border-stone-800 bg-stone-950 pt-12 pb-3"`

Home button active state:
Old: `'bg-zinc-700 text-zinc-100'`
New: `'bg-stone-700 text-stone-100'`

Home button inactive state:
Old: `'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'`
New: `'text-stone-400 hover:bg-stone-800 hover:text-stone-100'`

Open Folder button:
Old: `"flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"`
New: `"flex h-9 w-9 items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-stone-800 hover:text-stone-100"`

**Step 3: Update TabBar.tsx**

TabBar container:
Old: `"flex h-9 items-center gap-0.5 overflow-x-auto border-b border-zinc-800 bg-zinc-950 px-1 scrollbar-none"`
New: `"flex h-9 items-center gap-0.5 overflow-x-auto border-b border-stone-800 bg-stone-950 px-1 scrollbar-none"`

StatusDot colors:
- `bg-zinc-600` → `bg-stone-600`
- `bg-green-500` stays (functional color)
- `bg-red-500` stays (functional color)

Active tab:
Old: `'bg-zinc-800 text-zinc-100'`
New: `'bg-stone-800 text-stone-100'`

Inactive tab:
Old: `'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-300'`
New: `'text-stone-400 hover:bg-stone-800/60 hover:text-stone-300'`

Close button hover:
Old: `"hover:bg-zinc-600"`
New: `"hover:bg-stone-600"`

New tab button:
Old: `"ml-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"`
New: `"ml-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-stone-500 transition-colors hover:bg-stone-800 hover:text-stone-300"`

**Step 4: Verify**

Run: `bun run dev`
Expected: NavRail, TabBar, and Layout shell all render in warm stone tones.

**Step 5: Commit**

```bash
git add src/renderer/src/components/layout/
git commit -m "feat: reskin layout shell to warm stone palette"
```

---

### Task 3: Reskin ChatView with sticky user messages

**Files:**
- Modify: `src/renderer/src/components/messages/ChatView.tsx`
- Modify: `src/renderer/src/components/messages/UserMessage.tsx`

**Step 1: Update UserMessage.tsx for sticky + accent bar**

Replace the entire component render:

```tsx
return (
  <div className="sticky top-0 z-10 border-l-[3px] border-l-amber-600 bg-stone-800/95 px-6 py-3 backdrop-blur-sm">
    {images.length > 0 && (
      <div className="mb-2 space-y-2">
        {images.map((img, i) => (
          <div key={i} className="overflow-hidden rounded-lg border border-stone-700">
            <img
              src={`data:${img.source?.media_type};base64,${img.source?.data}`}
              alt="attachment"
              className="max-h-64 max-w-full object-contain"
            />
          </div>
        ))}
      </div>
    )}
    {text && (
      <p className="whitespace-pre-wrap text-sm text-stone-100">{text}</p>
    )}
  </div>
)
```

Key changes:
- `sticky top-0 z-10` for sticky positioning
- `border-l-[3px] border-l-amber-600` for amber left accent bar
- `bg-stone-800/95 backdrop-blur-sm` for slightly transparent sticky header
- `px-6` instead of `px-5` for more breathing room
- All zinc → stone

**Step 2: Update ChatView.tsx**

Container:
Old: `"flex h-full flex-col overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent"`
New: `"flex h-full flex-col overflow-y-auto"`

Skill name mini-display:
Old classes: `"flex items-center gap-2 px-5 py-1"`, text `"text-xs text-zinc-500"`, `"text-zinc-400"`
New classes: `"flex items-center gap-2 px-6 py-1"`, text `"text-xs text-stone-500"`, `"text-stone-400"`

The `renderAssistantContent` wrapper div:
Old: `"space-y-1 px-5 py-2"`
New: `"space-y-1 px-6 py-2"`

ThinkingIndicator:
Old: `"px-5 py-3"`, `"text-sm text-zinc-500"`, `"bg-zinc-500"`
New: `"px-6 py-3"`, `"text-sm text-stone-500"`, `"bg-stone-500"`

Streaming text wrapper:
Old: `"px-5 py-2"`, cursor `"bg-zinc-400"`
New: `"px-6 py-2"`, cursor `"bg-stone-400"`

**Step 3: Verify sticky behavior**

Run: `bun run dev`
Expected: Send a message, get a long response. The user message stays pinned at the top while scrolling through the assistant's response. When a new user message appears, it replaces the sticky header.

**Step 4: Commit**

```bash
git add src/renderer/src/components/messages/ChatView.tsx src/renderer/src/components/messages/UserMessage.tsx
git commit -m "feat: sticky user messages with amber accent bar"
```

---

### Task 4: Reskin AssistantMessage, ThinkingBlock, SystemMessage

**Files:**
- Modify: `src/renderer/src/components/messages/AssistantMessage.tsx`
- Modify: `src/renderer/src/components/messages/ThinkingBlock.tsx`
- Modify: `src/renderer/src/components/messages/SystemMessage.tsx`

**Step 1: Update AssistantMessage.tsx**

Old: `"space-y-1 px-5 py-2"`
New: `"space-y-1 px-6 py-2"`

**Step 2: Update ThinkingBlock.tsx**

Chevron icons:
Old: `"text-zinc-600"` (both ChevronDown and ChevronRight)
New: `"text-stone-600"`

CircleDot:
Old: `"text-zinc-500"`
New: `"text-stone-500"`

Label:
Old: `"text-sm font-medium text-zinc-300"`
New: `"text-sm font-medium text-stone-300"`

Expanded content:
Old: `"ml-8 mt-1 rounded border border-zinc-800 bg-zinc-900/50 px-3 py-2"`
New: `"ml-8 mt-1 rounded border border-stone-800 bg-stone-900/50 px-3 py-2"`

Text:
Old: `"text-zinc-400"`
New: `"text-stone-400"`

**Step 3: Update SystemMessage.tsx**

Skill message:
Old: `"px-5 py-1"`, `"text-zinc-500"`, `"text-zinc-400"`
New: `"px-6 py-1"`, `"text-stone-500"`, `"text-stone-400"`

System message:
Old: `"px-5 py-1.5"`, Info icon `"text-zinc-600"`, subtype `"text-zinc-600"`, text `"text-zinc-500"`
New: `"px-6 py-1.5"`, Info icon `"text-stone-600"`, subtype `"text-stone-600"`, text `"text-stone-500"`

**Step 4: Commit**

```bash
git add src/renderer/src/components/messages/AssistantMessage.tsx src/renderer/src/components/messages/ThinkingBlock.tsx src/renderer/src/components/messages/SystemMessage.tsx
git commit -m "feat: reskin assistant, thinking, and system messages to stone palette"
```

---

### Task 5: Reskin TextBlock with rich code blocks

**Files:**
- Modify: `src/renderer/src/components/messages/TextBlock.tsx`

**Step 1: Update prose classes for stone palette**

Replace the `proseClasses` array:

```typescript
const proseClasses = [
  'prose prose-invert prose-sm max-w-none',
  'prose-p:text-stone-200 prose-li:text-stone-200',
  'prose-headings:text-stone-100 prose-strong:text-stone-100',
  'prose-a:text-amber-400 prose-a:no-underline hover:prose-a:underline',
  'prose-pre:bg-stone-900 prose-pre:border prose-pre:border-stone-800 prose-pre:text-stone-200 prose-pre:relative',
  'prose-code:text-amber-300 prose-code:bg-stone-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-[family-name:var(--font-mono)]',
  'prose-code:before:content-none prose-code:after:content-none',
  'prose-table:border-collapse',
  'prose-th:border prose-th:border-stone-700 prose-th:bg-stone-800/50 prose-th:px-3 prose-th:py-1.5 prose-th:text-stone-200',
  'prose-td:border prose-td:border-stone-800 prose-td:px-3 prose-td:py-1.5 prose-td:text-stone-300',
  'prose-blockquote:border-stone-600 prose-blockquote:text-stone-400',
  'prose-hr:border-stone-800',
].join(' ')
```

**Step 2: Add rich code block component with copy button and language label**

Add a new `CodeBlock` component inside TextBlock.tsx (above `MarkdownContent`):

```tsx
import { useState, useCallback } from 'react'
import { Copy, Check } from 'lucide-react'

function CodeBlock({ className, children }: { className?: string; children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false)
  const language = className?.replace('language-', '') ?? ''
  const code = String(children).replace(/\n$/, '')

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [code])

  return (
    <div className="group relative my-3 overflow-hidden rounded-lg border border-stone-800 bg-stone-900">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-stone-800/60 bg-stone-900/80 px-3 py-1.5">
        <span className="font-[family-name:var(--font-mono)] text-[11px] text-stone-500">
          {language || 'code'}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-stone-500 transition-colors hover:bg-stone-800 hover:text-stone-300"
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {/* Code content */}
      <pre className="overflow-x-auto p-3">
        <code className="font-[family-name:var(--font-mono)] text-xs leading-relaxed text-stone-200">
          {code}
        </code>
      </pre>
    </div>
  )
}
```

**Step 3: Wire CodeBlock into MarkdownContent via custom components**

Update `MarkdownContent`:

```tsx
function MarkdownContent({ text }: { text: string }) {
  return (
    <div className={proseClasses}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const isInline = !className
            if (isInline) {
              return (
                <code className="rounded bg-stone-800 px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-xs text-amber-300" {...props}>
                  {children}
                </code>
              )
            }
            return <CodeBlock className={className}>{children}</CodeBlock>
          },
          pre({ children }) {
            // Let CodeBlock handle the wrapper
            return <>{children}</>
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
```

**Step 4: Update InsightCard to stone palette**

```tsx
function InsightCard({ text }: { text: string }) {
  return (
    <div className="my-3 rounded-lg border border-amber-800/40 bg-amber-950/15 px-4 py-3">
      <div className="mb-2 flex items-center gap-2">
        <Lightbulb size={14} className="text-amber-400" />
        <span className="text-xs font-semibold tracking-wide text-amber-400 uppercase">Insight</span>
      </div>
      <div className={proseClasses + ' prose-p:text-stone-300 prose-li:text-stone-300 prose-strong:text-amber-200'}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      </div>
    </div>
  )
}
```

**Step 5: Verify code blocks render**

Run: `bun run dev`
Expected: Markdown code blocks show language label + copy button header. Inline code uses JetBrains Mono with amber color on stone bg.

**Step 6: Commit**

```bash
git add src/renderer/src/components/messages/TextBlock.tsx
git commit -m "feat: rich code blocks with copy button and stone palette"
```

---

### Task 6: Reskin all tool blocks

**Files:**
- Modify: `src/renderer/src/components/tools/ToolUseBlock.tsx`
- Modify: `src/renderer/src/components/tools/BashTool.tsx`
- Modify: `src/renderer/src/components/tools/ReadTool.tsx`
- Modify: `src/renderer/src/components/tools/EditTool.tsx`
- Modify: `src/renderer/src/components/tools/GlobGrepTool.tsx`
- Modify: `src/renderer/src/components/tools/GenericTool.tsx`
- Modify: `src/renderer/src/components/tools/SubagentBlock.tsx`

**Step 1: Update ToolUseBlock.tsx**

All `iconColor` values in `getToolInfo`:
Old: `'text-zinc-500'`
New: `'text-stone-500'`

Chevron icons:
Old: `"text-zinc-600"`
New: `"text-stone-600"`

Label:
Old: `"text-sm font-medium text-zinc-300"`
New: `"text-sm font-medium text-stone-300"`

Summary:
Old: `"text-sm text-zinc-500"`
New: `"text-sm text-stone-500"`

Expanded container:
Old: `"ml-8 mt-1 rounded border border-zinc-800 bg-zinc-900/50 px-3 py-2"`
New: `"ml-8 mt-1 rounded border border-stone-800 bg-stone-900/50 px-3 py-2"`

Add monospace font to summary text:
Old: `"min-w-0 flex-1 truncate text-sm text-zinc-500"`
New: `"min-w-0 flex-1 truncate font-[family-name:var(--font-mono)] text-sm text-stone-500"`

**Step 2: Update BashTool.tsx**

Command pre:
Old: `"min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap rounded bg-zinc-800 px-2 py-1.5 font-mono text-xs text-green-300"`
New: `"min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap rounded bg-stone-800 px-2 py-1.5 font-[family-name:var(--font-mono)] text-xs text-green-300"`

**Step 3: Update ReadTool.tsx**

Path:
Old: `"min-w-0 truncate font-mono text-zinc-300"`
New: `"min-w-0 truncate font-[family-name:var(--font-mono)] text-stone-300"`

Text colors:
Old: `"text-xs text-zinc-400"`, `"text-zinc-500"`
New: `"text-xs text-stone-400"`, `"text-stone-500"`

**Step 4: Update EditTool.tsx**

Path text:
Old: `"text-xs text-zinc-400"`, `"font-mono text-zinc-300"`
New: `"text-xs text-stone-400"`, `"font-[family-name:var(--font-mono)] text-stone-300"`

Diff blocks — warm-shift the red/green:
Old red block: `"border-red-900/40 bg-red-950/20"`, `"text-red-300"`, `"text-red-700"`
New red block: `"border-red-900/30 bg-red-950/15"`, `"text-red-300/90"`, `"text-red-700/80"`

Old green block: `"border-green-900/40 bg-green-950/20"`, `"text-green-300"`, `"text-green-700"`
New green block: `"border-emerald-900/30 bg-emerald-950/15"`, `"text-emerald-300/90"`, `"text-emerald-700/80"`

Add mono font to pre blocks:
Old: `"p-2 text-xs text-red-300"`
New: `"p-2 font-[family-name:var(--font-mono)] text-xs text-red-300/90"`
(same for green pre)

**Step 5: Update GlobGrepTool.tsx**

Pattern text:
Old: `"font-mono text-zinc-300"`
New: `"font-[family-name:var(--font-mono)] text-stone-300"`

Other text:
Old: `"text-zinc-500"`, `"text-zinc-600"`
New: `"text-stone-500"`, `"text-stone-600"`

**Step 6: Update GenericTool.tsx**

Pre block:
Old: `"overflow-x-auto rounded bg-zinc-800 p-2 text-xs text-zinc-300"`
New: `"overflow-x-auto rounded bg-stone-800 p-2 font-[family-name:var(--font-mono)] text-xs text-stone-300"`

**Step 7: Update SubagentBlock.tsx**

Button container:
Old: `"border-zinc-800 bg-zinc-900/50"`, `"hover:border-zinc-700 hover:bg-zinc-800/60"`
New: `"border-stone-800 bg-stone-900/50"`, `"hover:border-stone-700 hover:bg-stone-800/60"`

Text:
Old: `"text-zinc-500"`, `"text-zinc-300"`, `"text-zinc-600"`
New: `"text-stone-500"`, `"text-stone-300"`, `"text-stone-600"`

Chevron:
Old: `"text-zinc-700"`, `"group-hover:text-zinc-500"`
New: `"text-stone-700"`, `"group-hover:text-stone-500"`

**Step 8: Commit**

```bash
git add src/renderer/src/components/tools/
git commit -m "feat: reskin all tool blocks to warm stone + JetBrains Mono"
```

---

### Task 7: Reskin InputBar

**Files:**
- Modify: `src/renderer/src/components/InputBar.tsx`

**Step 1: Update InputBar colors**

Container border:
Old: `"border-t border-zinc-800 bg-zinc-950"`
New: `"border-t border-stone-800 bg-stone-950"`

Attachment area:
Old: `"border-b border-zinc-800"`
New: `"border-b border-stone-800"`

Attachment chips:
Old: `"border-zinc-700 bg-zinc-800"`, `"text-zinc-400"`, `"text-zinc-500"`, `"text-zinc-600"`
New: `"border-stone-700 bg-stone-800"`, `"text-stone-400"`, `"text-stone-500"`, `"text-stone-600"`

Attachment remove button:
Old: `"bg-zinc-600 text-zinc-300"`, `"hover:bg-zinc-500"`
New: `"bg-stone-600 text-stone-300"`, `"hover:bg-stone-500"`

Drag area active:
Old: `'bg-blue-950/20'`
New: `'bg-amber-950/20'`

Paperclip button:
Old: `"text-zinc-500"`, `"hover:bg-zinc-800 hover:text-zinc-300"`
New: `"text-stone-500"`, `"hover:bg-stone-800 hover:text-stone-300"`

Textarea:
Old: `"bg-zinc-800 ... text-zinc-100 placeholder-zinc-600 ... focus:ring-zinc-600"`
New: `"bg-stone-800 ... text-stone-100 placeholder-stone-600 ... focus:ring-amber-700/50"`

Send button:
Old: `"bg-zinc-700 text-zinc-100"`, `"hover:bg-zinc-600"`
New: `"bg-amber-700 text-stone-100"`, `"hover:bg-amber-600"`

Stop button (keep red — functional):
Old: `"bg-red-700"`, `"hover:bg-red-600"`
No change needed.

**Step 2: Commit**

```bash
git add src/renderer/src/components/InputBar.tsx
git commit -m "feat: reskin input bar with amber send button and stone palette"
```

---

### Task 8: Reskin StatusBar, ResultMessage, PermissionPrompt

**Files:**
- Modify: `src/renderer/src/components/StatusBar.tsx`
- Modify: `src/renderer/src/components/messages/ResultMessage.tsx`
- Modify: `src/renderer/src/components/messages/PermissionPrompt.tsx`

**Step 1: Update StatusBar.tsx**

Container:
Old: `"border-t border-zinc-800 bg-zinc-950"`
New: `"border-t border-stone-800 bg-stone-950"`

StatusDot:
Old: `bg-zinc-600`, `bg-zinc-500`
New: `bg-stone-600`, `bg-stone-500`

Text:
Old: `"text-zinc-500"`, `"text-zinc-600"`, `"text-zinc-700"`
New: `"text-stone-500"`, `"text-stone-600"`, `"text-stone-700"`

**Step 2: Update ResultMessage.tsx**

Success row:
Old: `"border-t border-zinc-800/60"`
New: `"border-t border-stone-800/60"`

All zinc text:
- `text-zinc-500` → `text-stone-500`
- `text-zinc-600` → `text-stone-600`
- `text-zinc-400` → `text-stone-400`

Error container:
Old: `"mx-5"`, `"bg-zinc-900/50"`
New: `"mx-6"`, `"bg-stone-900/50"`

**Step 3: Update PermissionPrompt.tsx**

Container:
Old: `"mx-4"`
New: `"mx-6"`

Pre block:
Old: `"bg-zinc-900/50"`, `"text-zinc-400"`
New: `"bg-stone-900/50"`, `"text-stone-400"`

Suggestion text:
Old: `"text-zinc-500"`, `"text-zinc-600"`, `"text-zinc-400"`
New: `"text-stone-500"`, `"text-stone-600"`, `"text-stone-400"`

Deny button:
Old: `"bg-zinc-700"`, `"text-zinc-200"`, `"hover:bg-zinc-600"`
New: `"bg-stone-700"`, `"text-stone-200"`, `"hover:bg-stone-600"`

**Step 4: Commit**

```bash
git add src/renderer/src/components/StatusBar.tsx src/renderer/src/components/messages/ResultMessage.tsx src/renderer/src/components/messages/PermissionPrompt.tsx
git commit -m "feat: reskin status bar, result message, and permission prompt"
```

---

### Task 9: Reskin overlays (CommandPalette, SlashCommandMenu, SubagentDrawer, SessionHistory)

**Files:**
- Modify: `src/renderer/src/components/CommandPalette.tsx`
- Modify: `src/renderer/src/components/SlashCommandMenu.tsx`
- Modify: `src/renderer/src/components/SubagentDrawer.tsx`
- Modify: `src/renderer/src/components/SessionHistory.tsx`

**Step 1: Update CommandPalette.tsx**

Backdrop:
Old: `"bg-black/60"`
New: `"bg-black/50"`

Panel:
Old: `"border-zinc-700 bg-zinc-900"`
New: `"border-stone-700 bg-stone-900"`

Search border:
Old: `"border-b border-zinc-800"`
New: `"border-b border-stone-800"`

Input:
Old: `"text-zinc-100 placeholder-zinc-600"`, Search icon `"text-zinc-500"`
New: `"text-stone-100 placeholder-stone-600"`, Search icon `"text-stone-500"`

Kbd:
Old: `"border-zinc-700"`, `"text-zinc-600"`
New: `"border-stone-700"`, `"text-stone-600"`

Items:
Old: `'bg-zinc-800'`, `'hover:bg-zinc-800/50'`
New: `'bg-stone-800'`, `'hover:bg-stone-800/50'`

Item text:
Old: `"text-zinc-500"`, `"text-zinc-200"`, `"text-zinc-500"`
New: `"text-stone-500"`, `"text-stone-200"`, `"text-stone-500"`

No results:
Old: `"text-zinc-600"`
New: `"text-stone-600"`

**Step 2: Update SlashCommandMenu.tsx**

Panel:
Old: `"border-zinc-700 bg-zinc-900"`
New: `"border-stone-700 bg-stone-900"`

Items:
Old: `'bg-zinc-800'`, `'hover:bg-zinc-800/50'`
New: `'bg-stone-800'`, `'hover:bg-stone-800/50'`

Text:
Old: `"text-zinc-500"`, `"text-zinc-300"`, `"text-zinc-500"`
New: `"text-stone-500"`, `"text-stone-300"`, `"text-stone-500"`

**Step 3: Update SubagentDrawer.tsx**

Backdrop:
Old: `"bg-black/50"`
New: `"bg-black/40"`

Panel:
Old: `"bg-zinc-950"`
New: `"bg-stone-950"`

Header:
Old: `"border-b border-zinc-800/80"`, `"bg-zinc-800"`, `"text-zinc-400"`, `"text-zinc-200"`, `"text-zinc-500"`
New: `"border-b border-stone-800/80"`, `"bg-stone-800"`, `"text-stone-400"`, `"text-stone-200"`, `"text-stone-500"`

Close button:
Old: `"text-zinc-600"`, `"hover:bg-zinc-800 hover:text-zinc-400"`
New: `"text-stone-600"`, `"hover:bg-stone-800 hover:text-stone-400"`

Scrollbar:
Old: `"scrollbar-thumb-zinc-800"`
New: (already handled by CSS in globals.css)

Prompt section:
Old: `"border-b border-zinc-800/50 bg-zinc-900/40"`, `"text-zinc-600"`, `"text-zinc-400"`
New: `"border-b border-stone-800/50 bg-stone-900/40"`, `"text-stone-600"`, `"text-stone-400"`

Streaming cursor:
Old: `"bg-zinc-500"`
New: `"bg-stone-500"`

Empty state:
Old: `"text-zinc-700"`
New: `"text-stone-700"`

**Step 4: Update SessionHistory.tsx**

Section label:
Old: `"text-zinc-600"`
New: `"text-stone-600"`

Session button:
Old: `"hover:bg-zinc-800/60"`
New: `"hover:bg-stone-800/60"`

Text:
Old: `"text-zinc-300"`, `"text-zinc-600"`, `"text-zinc-700"`
New: `"text-stone-300"`, `"text-stone-600"`, `"text-stone-700"`

Delete button:
Old: `"text-zinc-600"`, `"hover:bg-zinc-700 hover:text-red-400"`
New: `"text-stone-600"`, `"hover:bg-stone-700 hover:text-red-400"`

Loading/empty:
Old: `"text-zinc-600"`, `"text-zinc-700"`
New: `"text-stone-600"`, `"text-stone-700"`

**Step 5: Commit**

```bash
git add src/renderer/src/components/CommandPalette.tsx src/renderer/src/components/SlashCommandMenu.tsx src/renderer/src/components/SubagentDrawer.tsx src/renderer/src/components/SessionHistory.tsx
git commit -m "feat: reskin all overlay components to stone palette"
```

---

### Task 10: Reskin HomePage and SessionView

**Files:**
- Modify: `src/renderer/src/pages/HomePage.tsx`
- Modify: `src/renderer/src/pages/SessionView.tsx`

**Step 1: Update HomePage.tsx**

Title:
Old: `"text-zinc-100"`
New: `"text-stone-100"`

Subtitle:
Old: `"text-zinc-500"`
New: `"text-stone-400"`

Button:
Old: `"bg-zinc-100 ... text-zinc-900 ... hover:bg-zinc-200"`
New: `"bg-amber-600 ... text-stone-50 ... hover:bg-amber-500"`

**Step 2: Update SessionView.tsx**

Empty state text:
Old: `"text-zinc-600"`
New: `"text-stone-600"`

**Step 3: Commit**

```bash
git add src/renderer/src/pages/
git commit -m "feat: reskin homepage and session view"
```

---

### Task 11: Add max-width content constraint to chat

**Files:**
- Modify: `src/renderer/src/components/messages/ChatView.tsx`

**Step 1: Wrap chat content in a centered max-width container**

In `ChatView`, wrap the `mainThreadMessages.map(...)` and subsequent elements in:

```tsx
<div className="mx-auto w-full max-w-3xl">
  {mainThreadMessages.map(...)}
  {/* ...existing streaming, thinking, permissions, bottomRef */}
</div>
```

This constrains long text lines to ~768px width while keeping the scrollable container full-width.

**Step 2: Verify**

Run: `bun run dev`
Expected: On wide windows, chat content is centered and doesn't stretch edge-to-edge. On narrow windows, fills available space.

**Step 3: Commit**

```bash
git add src/renderer/src/components/messages/ChatView.tsx
git commit -m "feat: constrain chat content to max-w-3xl centered"
```

---

### Task 12: Final visual QA pass

**Step 1: Run the app and check every screen**

Run: `bun run dev`

Verify:
- [ ] Fonts: Inter for prose, JetBrains Mono for code (check devtools)
- [ ] Homepage: warm stone bg, amber CTA button
- [ ] Session view: user messages sticky with amber bar
- [ ] Code blocks: language label + copy button
- [ ] Tool use blocks: collapsible, monospace, stone colors
- [ ] Edit diffs: warm red/green tones
- [ ] Input bar: amber send button, amber focus ring
- [ ] Status bar: stone palette
- [ ] Command palette: stone palette
- [ ] Subagent drawer: stone palette
- [ ] Permission prompts: amber accents maintained
- [ ] Scrollbar: stone-colored thumb

**Step 2: Fix any zinc remnants**

Search codebase:
```bash
grep -r "zinc" src/renderer/src/ --include="*.tsx" --include="*.css" -l
```

Any remaining `zinc` references in .tsx or .css files need updating to `stone`.

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete UI uplift to warm stone palette"
```
