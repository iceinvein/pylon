import { useMemo } from 'react'
import { groupAgentMessages } from '../lib/group-agent-messages'

export type { AgentInfo } from '../lib/group-agent-messages'

/**
 * Groups messages into main thread vs subagent messages.
 *
 * The SDK only provides two messages per subagent:
 * 1. A user message with parent_tool_use_id = Agent's tool_use_id (the prompt)
 * 2. A tool_result on the main thread when the agent completes
 *
 * Internal subagent conversation is NOT streamed to the parent.
 */
export function useAgentGrouping(sessionMessages: unknown[]) {
  return useMemo(() => groupAgentMessages(sessionMessages), [sessionMessages])
}
