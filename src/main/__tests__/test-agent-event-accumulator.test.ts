import { describe, expect, test } from 'bun:test'
import { TestAgentEventAccumulator } from '../test-agent-event-accumulator'

describe('TestAgentEventAccumulator', () => {
  test('deduplicates streamed text when complete message repeats it', () => {
    const acc = new TestAgentEventAccumulator()
    expect(acc.append({ type: 'text_delta', text: 'hello' })).toEqual([
      { type: 'text', text: 'hello' },
    ])
    expect(
      acc.append({
        type: 'message_complete',
        role: 'assistant',
        content: [{ type: 'text', text: 'hello' }],
        raw: {},
      }),
    ).toEqual([])
    expect(acc.streamingText()).toBe('hello')
  })

  test('keeps non-streamed complete text', () => {
    const acc = new TestAgentEventAccumulator()
    expect(
      acc.append({
        type: 'message_complete',
        role: 'assistant',
        content: [{ type: 'text', text: 'final' }],
        raw: {},
      }),
    ).toEqual([{ type: 'text', text: 'final' }])
    expect(acc.streamingText()).toBe('final\n')
  })

  test('deduplicates tool use and tool result ids', () => {
    const acc = new TestAgentEventAccumulator()
    const toolUse = {
      type: 'tool_use' as const,
      toolId: 't1',
      toolName: 'report_finding',
      input: { a: 1 },
    }
    const toolResult = {
      type: 'tool_result' as const,
      toolId: 't1',
      toolName: 'report_finding',
      output: 'ok',
    }
    expect(acc.append(toolUse)).toHaveLength(1)
    expect(acc.append(toolUse)).toEqual([])
    expect(acc.append(toolResult)).toHaveLength(1)
    expect(acc.append(toolResult)).toEqual([])
  })

  test('uses max totals when usage update and turn complete overlap', () => {
    const acc = new TestAgentEventAccumulator()
    acc.recordUsage({ type: 'usage_update', inputTokens: 10, outputTokens: 5 })
    acc.recordUsage({ type: 'turn_complete', inputTokens: 8, outputTokens: 7, costUsd: 0 })
    expect(acc.usage()).toEqual({ inputTokens: 10, outputTokens: 7 })
  })
})
