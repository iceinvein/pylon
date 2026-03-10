type ActivityType = 'explore' | 'think' | 'edit' | 'execute' | 'subagent' | 'ask-user' | 'error-fix' | 'result' | 'task-list'

type FlowNode = {
  id: string
  type: ActivityType
  label: string
  count: number
  messageIndices: number[]
  details: { toolName: string; summary: string }[]
  isActive?: boolean
  isSummary?: boolean
  children?: FlowNode[]
}

/** A layout element: either a single node, a parallel group, or an edge connector */
type FlowElement =
  | { kind: 'node'; node: FlowNode }
  | { kind: 'parallel'; nodes: FlowNode[] }
  | { kind: 'edge'; type: 'sequential' | 'retry' }

type FlowGraph = {
  elements: FlowElement[]
}

export type { ActivityType, FlowNode, FlowElement, FlowGraph }
