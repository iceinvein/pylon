import {
  ChevronRight,
  FilePlus,
  FileText,
  ListChecks,
  MessageCircleQuestion,
  Pencil,
  Search,
  Terminal,
  Wrench,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { AskUserQuestionTool, getAskUserQuestionSummary } from './AskUserQuestionTool'
import { BashTool } from './BashTool'
import { EditTool } from './EditTool'
import { GenericTool } from './GenericTool'
import { GlobGrepTool } from './GlobGrepTool'
import { ReadTool } from './ReadTool'
import { TodoWriteTool } from './TodoWriteTool'
import { WebSearchTool } from './WebSearchTool'
import { WriteTool } from './WriteTool'

type ToolUseBlockProps = {
  toolName: string
  input: Record<string, unknown>
  toolUseId?: string
  result?: string
}

type ToolInfo = {
  icon: typeof Terminal
  label: string
  summary: string
  iconColor: string
}

function shortPath(input: Record<string, unknown>): string {
  const path = String(input.file_path ?? input.path ?? '')
  return path.split('/').slice(-2).join('/') || path
}

type ToolRegistryEntry = {
  match: (name: string) => boolean
  info: (toolName: string, input: Record<string, unknown>) => ToolInfo
  render: (props: {
    toolName: string
    input: Record<string, unknown>
    result?: string
  }) => React.ReactNode
}

const TOOL_REGISTRY: ToolRegistryEntry[] = [
  {
    match: (n) => n.includes('bash') || n.includes('shell'),
    info: (_tn, input) => ({
      icon: Terminal,
      label: 'Run',
      summary:
        String(input.description ?? '').slice(0, 80) ||
        String(input.command ?? input.cmd ?? '').slice(0, 80),
      iconColor: 'text-[var(--color-accent-text)]',
    }),
    render: ({ input, result }) => <BashTool input={input} result={result} />,
  },
  {
    match: (n) => n.includes('read') || n.includes('view'),
    info: (_tn, input) => ({
      icon: FileText,
      label: 'Read',
      summary: shortPath(input),
      iconColor: 'text-[var(--color-base-text-secondary)]',
    }),
    render: ({ input }) => <ReadTool input={input} />,
  },
  {
    match: (n) => n.startsWith('task'),
    info: (toolName, input) => ({
      icon: Wrench,
      label: toolName.replace(/^Task/i, ''),
      summary: String(input.subject ?? input.taskId ?? ''),
      iconColor: 'text-[var(--color-warning)]',
    }),
    render: ({ input, result }) => <GenericTool input={input} result={result} />,
  },
  {
    match: (n) => n.includes('edit'),
    info: (_tn, input) => ({
      icon: Pencil,
      label: 'Edit',
      summary: shortPath(input),
      iconColor: 'text-[var(--color-warning)]',
    }),
    render: ({ input }) => <EditTool input={input} />,
  },
  {
    match: (n) => n === 'todowrite',
    info: (_tn, input) => {
      const todos = input.todos as Array<{ content: string; status: string }> | undefined
      if (Array.isArray(todos)) {
        const done = todos.filter((t) => t.status === 'completed').length
        return {
          icon: ListChecks,
          label: 'Tasks',
          summary: `${done}/${todos.length} completed`,
          iconColor: 'text-[var(--color-accent-text)]',
        }
      }
      return {
        icon: ListChecks,
        label: 'Tasks',
        summary: '',
        iconColor: 'text-[var(--color-accent-text)]',
      }
    },
    render: ({ input }) => <TodoWriteTool input={input} />,
  },
  {
    match: (n) => n.includes('write') || n.includes('create'),
    info: (_tn, input) => ({
      icon: FilePlus,
      label: 'Write',
      summary: shortPath(input),
      iconColor: 'text-[var(--color-success)]',
    }),
    render: ({ input, result }) => <WriteTool input={input} result={result} />,
  },
  {
    match: (n) => n.includes('websearch') || n.includes('web_search'),
    info: (_tn, input) => ({
      icon: Search,
      label: 'Search',
      summary: String(input.query ?? input.search ?? input.q ?? ''),
      iconColor: 'text-[var(--color-info)]',
    }),
    render: ({ input, result }) => <WebSearchTool input={input} result={result} />,
  },
  {
    match: (n) => n.includes('glob') || n.includes('grep') || n.includes('search'),
    info: (_tn, input) => ({
      icon: Search,
      label: 'Search',
      summary: String(input.pattern ?? input.glob ?? input.query ?? ''),
      iconColor: 'text-[var(--color-base-text-muted)]',
    }),
    render: ({ toolName, input, result }) => (
      <GlobGrepTool input={input} toolName={toolName} result={result} />
    ),
  },
  {
    match: (n) => n === 'askuserquestion',
    info: (_tn, input) => ({
      icon: MessageCircleQuestion,
      label: 'Question',
      summary: getAskUserQuestionSummary(input),
      iconColor: 'text-[var(--color-info)]',
    }),
    render: ({ input }) => <AskUserQuestionTool input={input} />,
  },
]

function findToolEntry(toolName: string): ToolRegistryEntry | undefined {
  const name = toolName.toLowerCase()
  return TOOL_REGISTRY.find((entry) => entry.match(name))
}

function getToolInfo(toolName: string, input: Record<string, unknown>): ToolInfo {
  const entry = findToolEntry(toolName)
  if (entry) return entry.info(toolName, input)

  const keys = Object.keys(input)
  const firstVal = keys.length > 0 ? String(input[keys[0]]).slice(0, 60) : ''
  return {
    icon: Wrench,
    label: toolName.replace(/^mcp__\w+__/, '').replace(/_/g, ' '),
    summary: firstVal,
    iconColor: 'text-[var(--color-base-text-muted)]',
  }
}

function ToolRenderer({
  toolName,
  input,
  result,
}: {
  toolName: string
  input: Record<string, unknown>
  result?: string
}) {
  const entry = findToolEntry(toolName)
  if (entry) return <>{entry.render({ toolName, input, result })}</>
  return <GenericTool input={input} result={result} />
}

export function ToolUseBlock({ toolName, input, result }: ToolUseBlockProps) {
  const [expanded, setExpanded] = useState(!result)
  const [userToggled, setUserToggled] = useState(false)
  const [settleKey, setSettleKey] = useState(0)
  const prevResult = useRef(result)

  useEffect(() => {
    if (result && !prevResult.current && !userToggled) {
      setExpanded(false)
      // Trigger the settle micro-pulse
      setSettleKey((k) => k + 1)
    }
    prevResult.current = result
  }, [result, userToggled])

  const info = getToolInfo(toolName, input)
  const Icon = info.icon
  const isCompleted = !!result && !expanded

  return (
    <div className={isCompleted ? 'opacity-90' : ''}>
      <button
        type="button"
        onClick={() => {
          setUserToggled(true)
          setExpanded((v) => !v)
        }}
        className="group flex w-full items-center gap-1.5 py-0.5 text-left"
      >
        <motion.span
          animate={{ rotate: expanded ? 90 : 0 }}
          transition={{ duration: 0.15 }}
          className="shrink-0 text-base-text-faint"
        >
          <ChevronRight size={12} />
        </motion.span>
        <span
          key={settleKey}
          className={`shrink-0 ${settleKey > 0 ? 'animate-settle' : ''} ${isCompleted ? 'opacity-60' : ''} ${info.iconColor}`}
        >
          <Icon size={12} />
        </span>
        <span
          className={`text-xs ${isCompleted ? 'text-base-text-muted' : 'font-medium text-base-text-secondary'}`}
        >
          {info.label}
        </span>
        {info.summary && !expanded && (
          <span className="min-w-0 flex-1 truncate text-base-text-faint text-xs">
            {info.summary}
          </span>
        )}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="mt-1 ml-8 rounded border border-base-border bg-base-surface px-3 py-2">
              <ToolRenderer toolName={toolName} input={input} result={result} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
