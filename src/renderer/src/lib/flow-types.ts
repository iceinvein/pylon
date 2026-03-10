type ActivityType = 'explore' | 'think' | 'edit' | 'execute' | 'subagent' | 'ask-user' | 'error-fix' | 'result'

type FlowNode = {
  id: string
  type: ActivityType
  label: string
  count: number
  messageIndices: number[]
  details: { toolName: string; summary: string }[]
  x: number
  y: number
  parallelGroupId?: string
  isActive?: boolean
  isSummary?: boolean
  children?: FlowNode[]
}

type EdgeType = 'sequential' | 'parallel-fork' | 'parallel-join' | 'retry'

type FlowEdge = {
  id: string
  from: string
  to: string
  type: EdgeType
}

type FlowGraph = {
  nodes: FlowNode[]
  edges: FlowEdge[]
}

export type { ActivityType, FlowNode, FlowEdge, EdgeType, FlowGraph }
