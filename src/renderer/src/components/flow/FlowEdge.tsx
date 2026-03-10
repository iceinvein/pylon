import { NODE_HEIGHT } from './flow-constants'
import type { FlowEdge as FlowEdgeType, FlowNode } from '../../lib/flow-types'

type FlowEdgeProps = {
  edge: FlowEdgeType
  nodes: Map<string, FlowNode>
}

export function FlowEdge({ edge, nodes }: FlowEdgeProps) {
  const from = nodes.get(edge.from)
  const to = nodes.get(edge.to)
  if (!from || !to) return null

  const fromX = from.x
  const fromY = from.y + NODE_HEIGHT
  const toX = to.x
  const toY = to.y

  const strokeColor = edge.type === 'retry' ? '#ef4444' : '#57534e'

  if (edge.type === 'sequential' || edge.type === 'retry') {
    return (
      <line
        x1={fromX}
        y1={fromY}
        x2={toX}
        y2={toY}
        stroke={strokeColor}
        strokeWidth={1.5}
        strokeDasharray={edge.type === 'retry' ? '4 3' : undefined}
      />
    )
  }

  // Parallel fork/join — curved bezier
  const midY = (fromY + toY) / 2
  const d = `M ${fromX} ${fromY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY}`

  return (
    <path
      d={d}
      fill="none"
      stroke={strokeColor}
      strokeWidth={1.5}
    />
  )
}
