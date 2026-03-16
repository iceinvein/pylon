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

function getToolInfo(toolName: string, input: Record<string, unknown>): ToolInfo {
  const name = toolName.toLowerCase()

  if (name.includes('bash') || name.includes('shell')) {
    const desc = String(input.description ?? '').slice(0, 80)
    const cmd = String(input.command ?? input.cmd ?? '').slice(0, 80)
    return {
      icon: Terminal,
      label: 'Run',
      summary: desc || cmd,
      iconColor: 'text-[var(--color-accent-text)]',
    }
  }

  if (name.includes('read') || name.includes('view')) {
    const path = String(input.file_path ?? input.path ?? '')
    const shortPath = path.split('/').slice(-2).join('/')
    return {
      icon: FileText,
      label: 'Read',
      summary: shortPath || path,
      iconColor: 'text-[var(--color-base-text-secondary)]',
    }
  }

  if (name.startsWith('task')) {
    const subject = String(input.subject ?? input.taskId ?? '')
    return {
      icon: Wrench,
      label: toolName.replace(/^Task/, ''),
      summary: subject,
      iconColor: 'text-[var(--color-warning)]',
    }
  }

  if (name.includes('edit')) {
    const path = String(input.file_path ?? input.path ?? '')
    const shortPath = path.split('/').slice(-2).join('/')
    return {
      icon: Pencil,
      label: 'Edit',
      summary: shortPath || path,
      iconColor: 'text-[var(--color-warning)]',
    }
  }

  if (name === 'todowrite') {
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
  }

  if (name.includes('write') || name.includes('create')) {
    const path = String(input.file_path ?? input.path ?? '')
    const shortPath = path.split('/').slice(-2).join('/')
    return {
      icon: FilePlus,
      label: 'Write',
      summary: shortPath || path,
      iconColor: 'text-[var(--color-success)]',
    }
  }

  if (name.includes('websearch') || name.includes('web_search')) {
    return {
      icon: Search,
      label: 'Search',
      summary: String(input.query ?? input.search ?? input.q ?? ''),
      iconColor: 'text-[var(--color-info)]',
    }
  }

  if (name.includes('glob') || name.includes('grep') || name.includes('search')) {
    return {
      icon: Search,
      label: 'Search',
      summary: String(input.pattern ?? input.glob ?? input.query ?? ''),
      iconColor: 'text-[var(--color-base-text-muted)]',
    }
  }

  if (name === 'askuserquestion') {
    return {
      icon: MessageCircleQuestion,
      label: 'Question',
      summary: getAskUserQuestionSummary(input),
      iconColor: 'text-[var(--color-info)]',
    }
  }

  // Generic fallback
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
  const name = toolName.toLowerCase()
  if (name.includes('bash') || name.includes('shell')) {
    return <BashTool input={input} result={result} />
  }
  if (name.includes('read') || name.includes('view')) {
    return <ReadTool input={input} />
  }
  if (name.startsWith('task')) {
    return <GenericTool input={input} result={result} />
  }
  if (name.includes('edit')) {
    return <EditTool input={input} />
  }
  if (name === 'todowrite') {
    return <TodoWriteTool input={input} />
  }
  if (name.includes('write') || name.includes('create')) {
    return <WriteTool input={input} result={result} />
  }
  if (name.includes('websearch') || name.includes('web_search')) {
    return <WebSearchTool input={input} result={result} />
  }
  if (name.includes('glob') || name.includes('grep') || name.includes('search')) {
    return <GlobGrepTool input={input} toolName={toolName} result={result} />
  }
  if (name === 'askuserquestion') {
    return <AskUserQuestionTool input={input} />
  }
  return <GenericTool input={input} result={result} />
}

export function ToolUseBlock({ toolName, input, result }: ToolUseBlockProps) {
  const [expanded, setExpanded] = useState(!result)
  const [userToggled, setUserToggled] = useState(false)
  const prevResult = useRef(result)

  useEffect(() => {
    if (result && !prevResult.current && !userToggled) {
      setExpanded(false)
    }
    prevResult.current = result
  }, [result, userToggled])

  const info = getToolInfo(toolName, input)
  const Icon = info.icon

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setUserToggled(true)
          setExpanded((v) => !v)
        }}
        className="group flex w-full items-center gap-2 py-0.5 text-left"
      >
        <motion.span
          animate={{ rotate: expanded ? 90 : 0 }}
          transition={{ duration: 0.15 }}
          className="flex-shrink-0 text-[var(--color-base-text-faint)]"
        >
          <ChevronRight size={14} />
        </motion.span>
        <Icon size={14} className={`flex-shrink-0 ${info.iconColor}`} />
        <span className="font-medium text-[var(--color-base-text)] text-sm">{info.label}</span>
        {info.summary && !expanded && (
          <span className="min-w-0 flex-1 truncate text-[var(--color-base-text-muted)] text-sm">
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
            <div className="mt-1 ml-8 rounded border border-[var(--color-base-border)] bg-[var(--color-base-surface)] px-3 py-2">
              <ToolRenderer toolName={toolName} input={input} result={result} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
