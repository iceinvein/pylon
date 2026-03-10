import type { ActivityType, FlowNode, FlowElement, FlowGraph } from './flow-types'

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

/**
 * Build a FlowGraph from raw session messages.
 *
 * Pass 1: Classify each content block into an activity type
 * Pass 2: Group consecutive same-type activities
 * Pass 3: Detect error→fix patterns
 * Pass 4: Mega-collapse if too many nodes
 * Pass 5: Build layout elements (nodes, parallel groups, edge connectors)
 */
export function buildFlowGraph(messages: unknown[], isStreaming: boolean): FlowGraph {
  const msgs = messages as SdkMessage[]
  if (msgs.length === 0) return { elements: [] }

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

  // ── Pass 1: Classify ──
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

    // Skip result messages — they clutter the flow chart
  }

  if (classified.length === 0) return { elements: [] }

  // ── Pass 2: Group consecutive same-type ──
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

  // ── Pass 3: Detect error→fix patterns ──
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

  // ── Convert groups to FlowNodes ──
  let nodeId = 0

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

  function groupToNode(g: RawGroup): FlowNode {
    const id = `node-${nodeId++}`
    return {
      id,
      type: g.type,
      label: makeLabel(g.type, g.blocks.length, g.blocks),
      count: g.blocks.length,
      messageIndices: [...new Set(g.blocks.map((b) => b.messageIndex))],
      details: g.blocks.map((b) => ({ toolName: b.toolName, summary: b.summary })),
      isActive: false,
    }
  }

  const nodes = mergedGroups.map(groupToNode)

  if (isStreaming && nodes.length > 0) {
    nodes[nodes.length - 1].isActive = true
  }

  // ── Pass 4: Mega-collapse ──
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
        isSummary: true,
        children: pair,
      })
    }
    nodes.unshift(...summaryNodes)
  }

  // ── Pass 5: Build layout elements ──
  // Consecutive subagent nodes are treated as parallel groups
  const elements: FlowElement[] = []
  let i = 0
  while (i < nodes.length) {
    const node = nodes[i]

    // Collect consecutive subagent runs into a parallel group
    if (node.type === 'subagent') {
      const parallelBatch: FlowNode[] = [node]
      while (i + 1 < nodes.length && nodes[i + 1].type === 'subagent') {
        i++
        parallelBatch.push(nodes[i])
      }

      if (parallelBatch.length > 1) {
        // Add edge before parallel group
        if (elements.length > 0) {
          elements.push({ kind: 'edge', type: 'sequential' })
        }
        elements.push({ kind: 'parallel', nodes: parallelBatch })
      } else {
        // Single subagent — render as normal node
        if (elements.length > 0) {
          elements.push({ kind: 'edge', type: 'sequential' })
        }
        elements.push({ kind: 'node', node })
      }
    } else {
      if (elements.length > 0) {
        elements.push({ kind: 'edge', type: node.type === 'error-fix' ? 'retry' : 'sequential' })
      }
      elements.push({ kind: 'node', node })
    }
    i++
  }

  return { elements }
}
