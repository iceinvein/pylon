import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import type { FlowNode as FlowNodeType } from '../../lib/flow-types'
import { NODE_STYLES } from './flow-constants'

type FlowNodeProps = {
  node: FlowNodeType
  onClick: (messageIndices: number[]) => void
  /** Render at reduced size inside a parallel sub-lane */
  isParallel?: boolean
}

/** Loud node: background card with border, full label, expand chevron */
function LoudNode({ node, onClick, isParallel }: FlowNodeProps) {
  const [expanded, setExpanded] = useState(false)
  const style = NODE_STYLES[node.type]
  const Icon = style.icon

  return (
    <button
      type="button"
      className={`flex w-full flex-col rounded-lg border text-left ${style.borderColor} ${style.bgColor} ${node.isSummary ? 'opacity-60' : ''} cursor-pointer transition-all ${node.isActive ? 'flow-card-glow' : ''}`}
      style={
        node.isActive ? ({ '--glow-color': style.accentHex } as React.CSSProperties) : undefined
      }
      onClick={() => onClick(node.messageIndices)}
    >
      <div className={`flex items-center gap-2 ${isParallel ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
        <Icon size={isParallel ? 12 : 14} className={`shrink-0 ${style.color}`} />
        <span
          className={`min-w-0 flex-1 truncate font-medium text-base-text ${isParallel ? 'text-[10px]' : 'text-xs'}`}
        >
          {node.label}
        </span>
        {node.details.length > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setExpanded((v) => !v)
            }}
            className="shrink-0 text-base-text-faint hover:text-base-text"
          >
            <ChevronRight
              size={12}
              className={`transition-transform ${expanded ? 'rotate-90' : ''}`}
            />
          </button>
        )}
      </div>
      {expanded && (
        <div className="border-base-border-subtle/50 border-t px-3 py-1">
          {node.details.map((d, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 py-0.5 text-[10px] text-base-text-muted"
            >
              <span className="text-base-text-faint">{d.toolName}</span>
              <span className="truncate">{d.summary}</span>
            </div>
          ))}
        </div>
      )}
    </button>
  )
}

/** Quiet node: no card background, just muted inline text next to the dot */
function QuietNode({ node, onClick }: FlowNodeProps) {
  const isThink = node.type === 'think'

  return (
    <button
      type="button"
      className={`cursor-pointer py-0.5 text-[10px] leading-tight ${isThink ? 'text-base-text-muted italic' : 'text-base-text-secondary'}`}
      onClick={() => onClick(node.messageIndices)}
    >
      {node.label}
    </button>
  )
}

export function FlowNode({ node, onClick, isParallel }: FlowNodeProps) {
  const style = NODE_STYLES[node.type]

  if (style.isQuiet && !isParallel) {
    return <QuietNode node={node} onClick={onClick} />
  }

  return <LoudNode node={node} onClick={onClick} isParallel={isParallel} />
}
