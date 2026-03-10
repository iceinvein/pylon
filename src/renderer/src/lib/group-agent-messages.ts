/**
 * Pure function extracted from use-agent-grouping hook.
 * Groups SDK messages into main thread vs subagent messages.
 */

type SdkMessage = {
  type: string
  content?: unknown
  subtype?: string
  session_id?: string
  parent_tool_use_id?: string | null
  message?: {
    content?: ContentBlock[]
    [key: string]: unknown
  }
  [key: string]: unknown
}

type ContentBlock = {
  type: string
  text?: string
  name?: string
  id?: string
  input?: Record<string, unknown>
  tool_use_id?: string
  is_error?: boolean
  content?: string | Array<{ type: string; text?: string }>
}

export type AgentInfo = {
  toolUseId: string
  agentType: string
  description: string
  prompt: string
  result: string
  done: boolean
  isError: boolean
}

export type GroupedMessages = {
  agentMap: Map<string, AgentInfo>
  mainThreadMessages: unknown[]
}

export function groupAgentMessages(sessionMessages: unknown[]): GroupedMessages {
  const msgs = sessionMessages as SdkMessage[]
  const agentMap = new Map<string, AgentInfo>()
  const agentToolUseIds = new Set<string>()
  const subagentMsgIndices = new Set<number>()

  // Pass 1: Find all Agent tool_use blocks
  for (const msg of msgs) {
    if (msg.type !== 'assistant') continue
    const content = (msg.message?.content ?? msg.content ?? []) as ContentBlock[]
    for (const block of content) {
      if (block.type === 'tool_use' && block.name === 'Agent' && block.id) {
        const input = block.input ?? {}
        agentToolUseIds.add(block.id)
        agentMap.set(block.id, {
          toolUseId: block.id,
          agentType: String(input.subagent_type ?? input.type ?? 'agent'),
          description: String(input.description ?? '').slice(0, 80),
          prompt: String(input.prompt ?? ''),
          result: '',
          done: false,
          isError: false,
        })
      }
    }
  }

  // Pass 2: Find subagent prompts (parent_tool_use_id set) and tool_results
  for (let i = 0; i < msgs.length; i++) {
    const msg = msgs[i]

    // Subagent prompt message — hide from main thread
    const parentId = msg.parent_tool_use_id
    if (parentId && agentToolUseIds.has(parentId)) {
      subagentMsgIndices.add(i)
      continue
    }

    // tool_result blocks that close agents
    if (msg.type === 'user') {
      const content = (msg.message?.content ?? msg.content ?? []) as ContentBlock[]
      for (const block of content) {
        if (
          block.type === 'tool_result' &&
          block.tool_use_id &&
          agentToolUseIds.has(block.tool_use_id)
        ) {
          const agent = agentMap.get(block.tool_use_id)
          if (agent) {
            agent.done = true
            if (block.is_error) agent.isError = true
            // Extract text result
            const resultContent = block.content
            if (typeof resultContent === 'string') {
              agent.result = resultContent
            } else if (Array.isArray(resultContent)) {
              agent.result = resultContent
                .filter((b) => b.type === 'text' && b.text)
                .map((b) => b.text ?? '')
                .join('\n')
            }
          }
        }
      }
    }
  }

  // Build main thread messages (exclude subagent prompts)
  const mainThreadMessages: unknown[] = []
  for (let i = 0; i < msgs.length; i++) {
    if (!subagentMsgIndices.has(i)) {
      mainThreadMessages.push(msgs[i])
    }
  }

  // If session has a final result, mark all agents as done
  const hasSessionResult = msgs.some((m) => m.type === 'result' && m.total_cost_usd !== undefined)
  if (hasSessionResult) {
    for (const agent of agentMap.values()) {
      agent.done = true
    }
  }

  return { agentMap, mainThreadMessages }
}
