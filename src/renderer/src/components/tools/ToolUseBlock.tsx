import { useState } from 'react'
import { ChevronDown, ChevronRight, Wrench } from 'lucide-react'
import { BashTool } from './BashTool'
import { ReadTool } from './ReadTool'
import { EditTool } from './EditTool'
import { GlobGrepTool } from './GlobGrepTool'
import { GenericTool } from './GenericTool'

type ToolUseBlockProps = {
  toolName: string
  input: Record<string, unknown>
  toolUseId?: string
}

function getToolSummary(toolName: string, input: Record<string, unknown>): string {
  const name = toolName.toLowerCase()
  if (name.includes('bash') || name.includes('shell')) {
    const cmd = String(input.command ?? input.cmd ?? '').slice(0, 60)
    return cmd
  }
  if (name.includes('read') || name.includes('view')) {
    return String(input.file_path ?? input.path ?? '')
  }
  if (name.includes('edit') || name.includes('write') || name.includes('create')) {
    return String(input.file_path ?? input.path ?? '')
  }
  if (name.includes('glob') || name.includes('grep') || name.includes('search')) {
    return String(input.pattern ?? input.glob ?? input.query ?? '')
  }
  const keys = Object.keys(input)
  if (keys.length > 0) return String(input[keys[0]]).slice(0, 60)
  return ''
}

function ToolRenderer({ toolName, input }: { toolName: string; input: Record<string, unknown> }) {
  const name = toolName.toLowerCase()
  if (name.includes('bash') || name.includes('shell')) {
    return <BashTool input={input} />
  }
  if (name.includes('read') || name.includes('view')) {
    return <ReadTool input={input} />
  }
  if (name.includes('edit') || name.includes('write') || name.includes('create')) {
    return <EditTool input={input} />
  }
  if (name.includes('glob') || name.includes('grep') || name.includes('search')) {
    return <GlobGrepTool input={input} toolName={toolName} />
  }
  return <GenericTool input={input} />
}

export function ToolUseBlock({ toolName, input }: ToolUseBlockProps) {
  const [expanded, setExpanded] = useState(false)
  const summary = getToolSummary(toolName, input)

  return (
    <div className="mb-2 rounded-lg border border-zinc-800 bg-zinc-900/50">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-zinc-800/50"
      >
        <Wrench size={12} className="flex-shrink-0 text-zinc-500" />
        <span className="text-xs font-medium text-zinc-400">{toolName}</span>
        {summary && !expanded && (
          <span className="min-w-0 flex-1 truncate text-xs text-zinc-600">{summary}</span>
        )}
        <div className="ml-auto">
          {expanded ? (
            <ChevronDown size={12} className="text-zinc-600" />
          ) : (
            <ChevronRight size={12} className="text-zinc-600" />
          )}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-zinc-800 px-3 py-2">
          <ToolRenderer toolName={toolName} input={input} />
        </div>
      )}
    </div>
  )
}
