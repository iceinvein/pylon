import type { ActivityType, FlowNode, FlowEdge, FlowGraph } from './flow-types'
import { NODE_WIDTH, NODE_HEIGHT, NODE_GAP_Y, PARALLEL_GAP_X, SVG_PADDING } from '../components/flow/flow-constants'

type SdkMessage = {
  type: string
  content?: unknown
  subtype?: string
  parent_tool_use_id?: string | null
  is_error?: boolean
  total_cost_usd?: number
  duration_ms?: number
  error?: string
  message?: {
    content?: ContentBlock[]
    [key: string]: unknown
  }
  [key: string]: unknown
}

type ContentBlock = {
  type: string
  text?: string
  thinking?: string
  name?: string
  id?: string
  input?: Record<string, unknown>
  tool_use_id?: string
}

type ToolResultBlock = {
  type: string
  tool_use_id?: string
  is_error?: boolean
  content?: string | Array<{ type: string; text?: string }>
}

function classifyTool(name: string): ActivityType {
  const n = name.toLowerCase()
  if (n.includes('read') || n.includes('view') || n.includes('glob') || n.includes('grep') || n.includes('search')) return 'explore'
  if (n.includes('edit')) return 'edit'
  if (n.includes('write') || n.includes('create')) return 'edit'
  if (n.includes('bash') || n.includes('shell')) return 'execute'
  if (n === 'agent' || n.startsWith('task')) return 'subagent'
  if (n === 'askuserquestion' || n === 'skill') return 'ask-user'
  if (n === 'todowrite') return 'explore'
  return 'execute'
}

function toolSummary(name: string, input: Record<string, unknown>): string {
  const n = name.toLowerCase()
  if (n.includes('bash') || n.includes('shell')) {
    return String(input.description ?? input.command ?? input.cmd ?? '').slice(0, 60)
  }
  if (n.includes('read') || n.includes('view') || n.includes('edit') || n.includes('write') || n.includes('create')) {
    const path = String(input.file_path ?? input.path ?? '')
    return path.split('/').slice(-2).join('/')
  }
  if (n.includes('glob') || n.includes('grep') || n.includes('search')) {
    return String(input.pattern ?? input.glob ?? input.query ?? '').slice(0, 60)
  }
  if (n === 'agent') {
    return String(input.description ?? '').slice(0, 60)
  }
  return ''
}

type ClassifiedBlock = {
  activityType: ActivityType
  toolName: string
  summary: string
  messageIndex: number
  toolUseId?: string
  isError?: boolean
}

export function buildFlowGraph(messages: unknown[], isStreaming: boolean): FlowGraph {
  const msgs = messages as SdkMessage[]
  if (msgs.length === 0) return { nodes: [], edges: [] }

  // Collect tool_result error status
  const errorToolUseIds = new Set<string>()
  for (const msg of msgs) {
    if (msg.type !== 'user') continue
    const rawContent = msg.content ?? msg.message?.content
    if (!Array.isArray(rawContent)) continue
    for (const block of rawContent as ToolResultBlock[]) {
      if (block.type === 'tool_result' && block.tool_use_id && block.is_error) {
        errorToolUseIds.add(block.tool_use_id)
      }
    }
  }

  // Pass 1: Classify
  const classified: ClassifiedBlock[] = []

  for (let i = 0; i < msgs.length; i++) {
    const msg = msgs[i]
    if (msg.parent_tool_use_id) continue

    if (msg.type === 'assistant') {
      const content = (msg.message?.content ?? msg.content ?? []) as ContentBlock[]
      for (const block of content) {
        if (block.type === 'thinking' && block.thinking && block.thinking.length > 50) {
          classified.push({
            activityType: 'think',
            toolName: 'thinking',
            summary: block.thinking.slice(0, 60).replace(/\n/g, ' '),
            messageIndex: i,
          })
        }
        if (block.type === 'tool_use' && block.name) {
          classified.push({
            activityType: classifyTool(block.name),
            toolName: block.name,
            summary: toolSummary(block.name, block.input ?? {}),
            messageIndex: i,
            toolUseId: block.id,
            isError: block.id ? errorToolUseIds.has(block.id) : false,
          })
        }
      }
    }

    if (msg.type === 'result') {
      const cost = msg.total_cost_usd
      const duration = msg.duration_ms
      const label = msg.is_error
        ? `Error: ${String(msg.error ?? '').slice(0, 40)}`
        : `Done${cost ? ` — $${(cost as number).toFixed(2)}` : ''}${duration ? `, ${Math.round((duration as number) / 1000)}s` : ''}`
      classified.push({
        activityType: 'result',
        toolName: 'result',
        summary: label,
        messageIndex: i,
      })
    }
  }

  if (classified.length === 0) return { nodes: [], edges: [] }

  // Pass 2: Group consecutive same-type
  type RawGroup = { type: ActivityType; blocks: ClassifiedBlock[] }
  const groups: RawGroup[] = []
  let currentGroup: RawGroup = { type: classified[0].activityType, blocks: [classified[0]] }

  for (let i = 1; i < classified.length; i++) {
    const block = classified[i]
    if (block.activityType === currentGroup.type && block.activityType !== 'subagent' && block.activityType !== 'result') {
      currentGroup.blocks.push(block)
    } else {
      groups.push(currentGroup)
      currentGroup = { type: block.activityType, blocks: [block] }
    }
  }
  groups.push(currentGroup)

  // Pass 3: Detect error→fix patterns
  const mergedGroups: RawGroup[] = []
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i]
    const hasError = group.blocks.some((b) => b.isError)
    const nextGroup = groups[i + 1]
    if (hasError && nextGroup && nextGroup.type === group.type) {
      mergedGroups.push({
        type: 'error-fix',
        blocks: [...group.blocks, ...nextGroup.blocks],
      })
      i++
    } else {
      mergedGroups.push(group)
    }
  }

  // Convert groups to FlowNodes
  let nodeId = 0
  const nodes: FlowNode[] = []

  // Detect parallel subagent groups
  const subagentParallelGroups = new Map<number, string>()
  let parallelId = 0
  for (let i = 0; i < mergedGroups.length; i++) {
    const g = mergedGroups[i]
    if (g.type !== 'subagent') continue
    const startMsg = g.blocks[0].messageIndex
    let j = i + 1
    const batch = [i]
    while (j < mergedGroups.length && mergedGroups[j].type === 'subagent') {
      const nextMsg = mergedGroups[j].blocks[0].messageIndex
      if (Math.abs(nextMsg - startMsg) <= 1) {
        batch.push(j)
        j++
      } else break
    }
    if (batch.length > 1) {
      const pgId = `parallel-${parallelId++}`
      for (const idx of batch) {
        subagentParallelGroups.set(idx, pgId)
      }
    }
  }

  function makeLabel(type: ActivityType, count: number, blocks: ClassifiedBlock[]): string {
    switch (type) {
      case 'explore': return count === 1 ? `Searched ${blocks[0].summary}` : `Explored ${count} files`
      case 'think': return 'Analyzed approach'
      case 'edit': return count === 1 ? `Modified ${blocks[0].summary}` : `Modified ${count} files`
      case 'execute': return count === 1 ? blocks[0].summary || 'Ran command' : `Ran ${count} commands`
      case 'subagent': return `Agent: ${blocks[0].summary || 'task'}`
      case 'ask-user': return 'Asked user'
      case 'error-fix': return `Fixed ${Math.ceil(count / 2)} error${Math.ceil(count / 2) > 1 ? 's' : ''}`
      case 'result': return blocks[0].summary
      default: return `${count} operations`
    }
  }

  for (let i = 0; i < mergedGroups.length; i++) {
    const g = mergedGroups[i]
    const id = `node-${nodeId++}`
    const messageIndices = [...new Set(g.blocks.map((b) => b.messageIndex))]
    const details = g.blocks.map((b) => ({ toolName: b.toolName, summary: b.summary }))
    nodes.push({
      id,
      type: g.type,
      label: makeLabel(g.type, g.blocks.length, g.blocks),
      count: g.blocks.length,
      messageIndices,
      details,
      x: 0,
      y: 0,
      parallelGroupId: subagentParallelGroups.get(i),
      isActive: false,
    })
  }

  if (isStreaming && nodes.length > 0) {
    nodes[nodes.length - 1].isActive = true
  }

  // Pass 4: Mega-collapse
  const COLLAPSE_THRESHOLD = 25
  const KEEP_RECENT = 10
  if (nodes.length > COLLAPSE_THRESHOLD) {
    const collapseCount = nodes.length - KEEP_RECENT
    const toCollapse = nodes.splice(0, collapseCount)
    const summaryNodes: FlowNode[] = []
    for (let i = 0; i < toCollapse.length; i += 2) {
      const pair = toCollapse.slice(i, i + 2)
      summaryNodes.push({
        id: `summary-${i}`,
        type: pair[0].type,
        label: pair.length === 2 ? `${pair[0].label} → ${pair[1].label}` : pair[0].label,
        count: pair.reduce((sum, n) => sum + n.count, 0),
        messageIndices: pair.flatMap((n) => n.messageIndices),
        details: pair.flatMap((n) => n.details),
        x: 0,
        y: 0,
        isSummary: true,
        children: pair,
      })
    }
    nodes.unshift(...summaryNodes)
  }

  // Pass 5: Layout positions
  const parallelGroupNodes = new Map<string, FlowNode[]>()
  for (const node of nodes) {
    if (node.parallelGroupId) {
      const existing = parallelGroupNodes.get(node.parallelGroupId) ?? []
      existing.push(node)
      parallelGroupNodes.set(node.parallelGroupId, existing)
    }
  }

  let currentY = SVG_PADDING
  const centerX = SVG_PADDING + NODE_WIDTH / 2
  const processedParallelGroups = new Set<string>()
  const edges: FlowEdge[] = []
  let prevNodeId: string | null = null

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]

    if (node.parallelGroupId && !processedParallelGroups.has(node.parallelGroupId)) {
      processedParallelGroups.add(node.parallelGroupId)
      const siblings = parallelGroupNodes.get(node.parallelGroupId)!
      const totalWidth = siblings.length * NODE_WIDTH + (siblings.length - 1) * PARALLEL_GAP_X
      const startX = centerX - totalWidth / 2 + NODE_WIDTH / 2

      if (prevNodeId) {
        for (const sib of siblings) {
          edges.push({ id: `edge-fork-${sib.id}`, from: prevNodeId, to: sib.id, type: 'parallel-fork' })
        }
      }

      for (let s = 0; s < siblings.length; s++) {
        siblings[s].x = startX + s * (NODE_WIDTH + PARALLEL_GAP_X)
        siblings[s].y = currentY
      }
      currentY += NODE_HEIGHT + NODE_GAP_Y

      const nextNonParallel = nodes.find((n, idx) => idx > i && !n.parallelGroupId)
      if (nextNonParallel) {
        for (const sib of siblings) {
          edges.push({ id: `edge-join-${sib.id}`, from: sib.id, to: nextNonParallel.id, type: 'parallel-join' })
        }
      }
      prevNodeId = null
      continue
    }

    if (node.parallelGroupId) continue

    node.x = centerX
    node.y = currentY
    currentY += NODE_HEIGHT + NODE_GAP_Y

    if (prevNodeId) {
      edges.push({
        id: `edge-${prevNodeId}-${node.id}`,
        from: prevNodeId,
        to: node.id,
        type: node.type === 'error-fix' ? 'retry' : 'sequential',
      })
    }
    prevNodeId = node.id
  }

  return { nodes, edges }
}
