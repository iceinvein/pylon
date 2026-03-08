import { test, expect, describe } from 'bun:test'
import { groupAgentMessages } from './group-agent-messages'

function agentToolUse(id: string, opts: { subagent_type?: string; description?: string; prompt?: string } = {}) {
  return {
    type: 'assistant',
    message: {
      content: [
        {
          type: 'tool_use',
          name: 'Agent',
          id,
          input: {
            subagent_type: opts.subagent_type ?? 'general-purpose',
            description: opts.description ?? 'test agent',
            prompt: opts.prompt ?? 'do something',
          },
        },
      ],
    },
  }
}

function toolResult(toolUseId: string, content: string | unknown[], isError = false) {
  return {
    type: 'user',
    content: [
      {
        type: 'tool_result',
        tool_use_id: toolUseId,
        content,
        is_error: isError,
      },
    ],
  }
}

function subagentPrompt(parentToolUseId: string) {
  return {
    type: 'user',
    parent_tool_use_id: parentToolUseId,
    content: [{ type: 'text', text: 'subagent prompt' }],
  }
}

describe('groupAgentMessages', () => {
  test('returns empty structures for empty messages', () => {
    const result = groupAgentMessages([])
    expect(result.agentMap.size).toBe(0)
    expect(result.mainThreadMessages).toEqual([])
  })

  test('passes through non-agent messages unchanged', () => {
    const msgs = [
      { type: 'user', content: 'hello' },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'hi' }] } },
    ]
    const result = groupAgentMessages(msgs)
    expect(result.agentMap.size).toBe(0)
    expect(result.mainThreadMessages).toHaveLength(2)
  })

  test('detects Agent tool_use blocks', () => {
    const msgs = [agentToolUse('agent-1', { subagent_type: 'Explore', description: 'find files' })]
    const result = groupAgentMessages(msgs)
    expect(result.agentMap.size).toBe(1)

    const agent = result.agentMap.get('agent-1')!
    expect(agent.toolUseId).toBe('agent-1')
    expect(agent.agentType).toBe('Explore')
    expect(agent.description).toBe('find files')
    expect(agent.done).toBe(false)
    expect(agent.result).toBe('')
  })

  test('filters subagent prompt messages from main thread', () => {
    const msgs = [
      agentToolUse('agent-1'),
      subagentPrompt('agent-1'),
      { type: 'assistant', message: { content: [{ type: 'text', text: 'main reply' }] } },
    ]
    const result = groupAgentMessages(msgs)
    expect(result.mainThreadMessages).toHaveLength(2) // agent tool_use + main reply, no subagent prompt
  })

  test('does not filter messages with unknown parent_tool_use_id', () => {
    const msgs = [
      { type: 'user', parent_tool_use_id: 'unknown-id', content: 'orphan' },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'reply' }] } },
    ]
    const result = groupAgentMessages(msgs)
    expect(result.mainThreadMessages).toHaveLength(2)
  })

  test('marks agent done when tool_result arrives with string content', () => {
    const msgs = [
      agentToolUse('agent-1'),
      toolResult('agent-1', 'Here is the result'),
    ]
    const result = groupAgentMessages(msgs)
    const agent = result.agentMap.get('agent-1')!
    expect(agent.done).toBe(true)
    expect(agent.result).toBe('Here is the result')
    expect(agent.isError).toBe(false)
  })

  test('marks agent done when tool_result arrives with array content', () => {
    const msgs = [
      agentToolUse('agent-1'),
      toolResult('agent-1', [
        { type: 'text', text: 'line 1' },
        { type: 'text', text: 'line 2' },
      ]),
    ]
    const result = groupAgentMessages(msgs)
    const agent = result.agentMap.get('agent-1')!
    expect(agent.done).toBe(true)
    expect(agent.result).toBe('line 1\nline 2')
  })

  test('marks agent as error when tool_result has is_error', () => {
    const msgs = [
      agentToolUse('agent-1'),
      toolResult('agent-1', 'something failed', true),
    ]
    const result = groupAgentMessages(msgs)
    const agent = result.agentMap.get('agent-1')!
    expect(agent.done).toBe(true)
    expect(agent.isError).toBe(true)
  })

  test('marks all agents done when session result message present', () => {
    const msgs = [
      agentToolUse('agent-1'),
      agentToolUse('agent-2'),
      { type: 'result', total_cost_usd: 0.05 },
    ]
    const result = groupAgentMessages(msgs)
    expect(result.agentMap.get('agent-1')!.done).toBe(true)
    expect(result.agentMap.get('agent-2')!.done).toBe(true)
  })

  test('handles multiple agents independently', () => {
    const msgs = [
      agentToolUse('agent-1', { description: 'first' }),
      agentToolUse('agent-2', { description: 'second' }),
      subagentPrompt('agent-1'),
      toolResult('agent-1', 'result 1'),
    ]
    const result = groupAgentMessages(msgs)
    expect(result.agentMap.size).toBe(2)
    expect(result.agentMap.get('agent-1')!.done).toBe(true)
    expect(result.agentMap.get('agent-2')!.done).toBe(false)
    // Subagent prompt filtered, rest remain
    expect(result.mainThreadMessages).toHaveLength(3)
  })

  test('truncates description to 80 chars', () => {
    const longDesc = 'A'.repeat(100)
    const msgs = [agentToolUse('agent-1', { description: longDesc })]
    const result = groupAgentMessages(msgs)
    expect(result.agentMap.get('agent-1')!.description).toHaveLength(80)
  })

  test('defaults agentType to "agent" when no type specified', () => {
    const msgs = [
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_use', name: 'Agent', id: 'a1', input: {} },
          ],
        },
      },
    ]
    const result = groupAgentMessages(msgs)
    expect(result.agentMap.get('a1')!.agentType).toBe('agent')
  })

  test('handles content on message directly (not nested in message.content)', () => {
    const msgs = [
      {
        type: 'assistant',
        content: [
          { type: 'tool_use', name: 'Agent', id: 'a1', input: { prompt: 'test' } },
        ],
      },
    ]
    const result = groupAgentMessages(msgs)
    expect(result.agentMap.size).toBe(1)
  })
})
