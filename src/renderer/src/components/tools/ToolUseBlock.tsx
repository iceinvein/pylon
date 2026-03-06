import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ChevronRight, Terminal, FileText, Search, Pencil, Wrench, MessageCircleQuestion } from 'lucide-react'
import { BashTool } from './BashTool'
import { ReadTool } from './ReadTool'
import { EditTool } from './EditTool'
import { GlobGrepTool } from './GlobGrepTool'
import { GenericTool } from './GenericTool'
import { AskUserQuestionTool, getAskUserQuestionSummary } from './AskUserQuestionTool'
import { WebSearchTool } from './WebSearchTool'

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
      iconColor: 'text-stone-500',
    }
  }

  if (name.includes('read') || name.includes('view')) {
    const path = String(input.file_path ?? input.path ?? '')
    const shortPath = path.split('/').slice(-2).join('/')
    return {
      icon: FileText,
      label: 'Read',
      summary: shortPath || path,
      iconColor: 'text-stone-500',
    }
  }

  if (name.startsWith('task')) {
    const subject = String(input.subject ?? input.taskId ?? '')
    return {
      icon: Wrench,
      label: toolName.replace(/^Task/, ''),
      summary: subject,
      iconColor: 'text-stone-500',
    }
  }

  if (name.includes('edit')) {
    const path = String(input.file_path ?? input.path ?? '')
    const shortPath = path.split('/').slice(-2).join('/')
    return {
      icon: Pencil,
      label: 'Edit',
      summary: shortPath || path,
      iconColor: 'text-stone-500',
    }
  }

  if (name.includes('write') || name.includes('create')) {
    const path = String(input.file_path ?? input.path ?? '')
    const shortPath = path.split('/').slice(-2).join('/')
    return {
      icon: Pencil,
      label: 'Write',
      summary: shortPath || path,
      iconColor: 'text-stone-500',
    }
  }

  if (name.includes('websearch') || name.includes('web_search')) {
    return {
      icon: Search,
      label: 'Search',
      summary: String(input.query ?? input.search ?? input.q ?? ''),
      iconColor: 'text-blue-400',
    }
  }

  if (name.includes('glob') || name.includes('grep') || name.includes('search')) {
    return {
      icon: Search,
      label: 'Search',
      summary: String(input.pattern ?? input.glob ?? input.query ?? ''),
      iconColor: 'text-stone-500',
    }
  }

  if (name === 'askuserquestion') {
    return {
      icon: MessageCircleQuestion,
      label: 'Question',
      summary: getAskUserQuestionSummary(input),
      iconColor: 'text-blue-400',
    }
  }

  // Generic fallback
  const keys = Object.keys(input)
  const firstVal = keys.length > 0 ? String(input[keys[0]]).slice(0, 60) : ''
  return {
    icon: Wrench,
    label: toolName.replace(/^mcp__\w+__/, '').replace(/_/g, ' '),
    summary: firstVal,
    iconColor: 'text-stone-500',
  }
}

function ToolRenderer({ toolName, input, result }: { toolName: string; input: Record<string, unknown>; result?: string }) {
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
  if (name.includes('edit') || name.includes('write') || name.includes('create')) {
    return <EditTool input={input} />
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
  const [expanded, setExpanded] = useState(false)
  const info = getToolInfo(toolName, input)
  const Icon = info.icon

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="group flex w-full items-center gap-2 py-0.5 text-left"
      >
        <motion.span
          animate={{ rotate: expanded ? 90 : 0 }}
          transition={{ duration: 0.15 }}
          className="flex-shrink-0 text-stone-600"
        >
          <ChevronRight size={14} />
        </motion.span>
        <Icon size={14} className={`flex-shrink-0 ${info.iconColor}`} />
        <span className="text-sm font-medium text-stone-300">{info.label}</span>
        {info.summary && !expanded && (
          <span className="min-w-0 flex-1 truncate text-sm text-stone-500">{info.summary}</span>
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
            <div className="ml-8 mt-1 rounded border border-stone-800 bg-stone-900/50 px-3 py-2">
              <ToolRenderer toolName={toolName} input={input} result={result} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
