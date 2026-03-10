import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { NODE_STYLES, NODE_WIDTH, NODE_HEIGHT } from './flow-constants'
import type { FlowNode as FlowNodeType } from '../../lib/flow-types'

type FlowNodeProps = {
  node: FlowNodeType
  onClick: (messageIndices: number[]) => void
}

export function FlowNode({ node, onClick }: FlowNodeProps) {
  const [expanded, setExpanded] = useState(false)
  const style = NODE_STYLES[node.type]
  const Icon = style.icon
  const expandedHeight = NODE_HEIGHT + node.details.length * 24 + 8

  return (
    <foreignObject
      x={node.x - NODE_WIDTH / 2}
      y={node.y}
      width={NODE_WIDTH}
      height={expanded ? expandedHeight : NODE_HEIGHT}
    >
      <div
        className={`flex flex-col rounded-lg border ${style.borderColor} ${style.bgColor} ${node.isActive ? 'animate-flow-pulse' : ''} ${node.isSummary ? 'opacity-60' : ''} cursor-pointer transition-all`}
        onClick={() => onClick(node.messageIndices)}
      >
        <div className="flex items-center gap-2 px-3" style={{ height: NODE_HEIGHT }}>
          <Icon size={14} className={`flex-shrink-0 ${style.color}`} />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-stone-200">
            {node.label}
          </span>
          {node.details.length > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setExpanded((v) => !v)
              }}
              className="flex-shrink-0 text-stone-600 hover:text-stone-300"
            >
              <ChevronRight
                size={12}
                className={`transition-transform ${expanded ? 'rotate-90' : ''}`}
              />
            </button>
          )}
        </div>
        {expanded && (
          <div className="border-t border-stone-800/50 px-3 py-1">
            {node.details.map((d, i) => (
              <div key={i} className="flex items-center gap-1.5 py-0.5 text-[10px] text-stone-500">
                <span className="text-stone-600">{d.toolName}</span>
                <span className="truncate">{d.summary}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </foreignObject>
  )
}
