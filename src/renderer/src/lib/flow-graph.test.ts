import { describe, expect, test } from 'bun:test'
import { buildFlowGraph } from './flow-graph'

// Helper to create an assistant message with tool_use blocks
function assistantMsg(
  toolUses: Array<{ name: string; id?: string; input?: Record<string, unknown> }>,
  parentToolUseId?: string,
) {
  return {
    type: 'assistant',
    parent_tool_use_id: parentToolUseId ?? null,
    message: {
      content: toolUses.map((t) => ({
        type: 'tool_use',
        name: t.name,
        id: t.id ?? `id-${t.name}`,
        input: t.input ?? {},
      })),
    },
  }
}

// Helper for a user message with tool_result blocks
function userMsg(results: Array<{ tool_use_id: string; is_error?: boolean }>) {
  return {
    type: 'user',
    content: results.map((r) => ({
      type: 'tool_result',
      tool_use_id: r.tool_use_id,
      is_error: r.is_error ?? false,
    })),
  }
}

// Helper for an assistant thinking message
function thinkingMsg(text: string) {
  return {
    type: 'assistant',
    parent_tool_use_id: null,
    message: {
      content: [{ type: 'thinking', thinking: text }],
    },
  }
}

describe('buildFlowGraph', () => {
  test('returns empty elements for empty messages', () => {
    const graph = buildFlowGraph([], false)
    expect(graph.elements).toEqual([])
  })

  test('creates a single node for a single tool use', () => {
    const messages = [assistantMsg([{ name: 'Read', input: { file_path: '/src/main/index.ts' } }])]
    const graph = buildFlowGraph(messages, false)
    expect(graph.elements).toHaveLength(1)
    expect(graph.elements[0]).toMatchObject({ kind: 'node' })
    const node = (graph.elements[0] as { kind: 'node'; node: { type: string } }).node
    expect(node.type).toBe('explore')
  })

  test('groups consecutive same-type tool uses', () => {
    const messages = [
      assistantMsg([
        { name: 'Read', input: { file_path: '/a.ts' } },
        { name: 'Glob', input: { pattern: '*.ts' } },
      ]),
    ]
    const graph = buildFlowGraph(messages, false)
    // Both are 'explore' type, should be grouped into one node
    expect(graph.elements).toHaveLength(1)
    const node = (graph.elements[0] as { kind: 'node'; node: { count: number } }).node
    expect(node.count).toBe(2)
  })

  test('creates separate nodes for different activity types', () => {
    const messages = [
      assistantMsg([{ name: 'Read', input: { file_path: '/a.ts' } }]),
      assistantMsg([{ name: 'Bash', input: { command: 'bun test' } }]),
    ]
    const graph = buildFlowGraph(messages, false)
    // node + edge + node = 3 elements
    expect(graph.elements).toHaveLength(3)
    expect(graph.elements[0]).toMatchObject({ kind: 'node' })
    expect(graph.elements[1]).toMatchObject({ kind: 'edge', type: 'sequential' })
    expect(graph.elements[2]).toMatchObject({ kind: 'node' })
  })

  test('marks last node as active when streaming', () => {
    const messages = [assistantMsg([{ name: 'Read', input: { file_path: '/a.ts' } }])]
    const graph = buildFlowGraph(messages, true)
    const node = (graph.elements[0] as { kind: 'node'; node: { isActive: boolean } }).node
    expect(node.isActive).toBe(true)
  })

  test('does not mark last node as active when not streaming', () => {
    const messages = [assistantMsg([{ name: 'Read', input: { file_path: '/a.ts' } }])]
    const graph = buildFlowGraph(messages, false)
    const node = (graph.elements[0] as { kind: 'node'; node: { isActive: boolean } }).node
    expect(node.isActive).toBe(false)
  })

  test('groups consecutive subagent nodes into parallel element', () => {
    const messages = [
      assistantMsg([{ name: 'Agent', input: { description: 'task 1' } }]),
      assistantMsg([{ name: 'Agent', input: { description: 'task 2' } }]),
    ]
    const graph = buildFlowGraph(messages, false)
    expect(graph.elements).toHaveLength(1)
    expect(graph.elements[0]).toMatchObject({ kind: 'parallel' })
    const parallel = graph.elements[0] as { kind: 'parallel'; nodes: unknown[] }
    expect(parallel.nodes).toHaveLength(2)
  })

  test('single subagent is a regular node, not parallel', () => {
    const messages = [assistantMsg([{ name: 'Agent', input: { description: 'solo task' } }])]
    const graph = buildFlowGraph(messages, false)
    expect(graph.elements).toHaveLength(1)
    expect(graph.elements[0]).toMatchObject({ kind: 'node' })
  })

  test('skips subagent messages (parent_tool_use_id set)', () => {
    const messages = [assistantMsg([{ name: 'Read', input: { file_path: '/a.ts' } }], 'parent-123')]
    const graph = buildFlowGraph(messages, false)
    expect(graph.elements).toEqual([])
  })

  test('detects error-fix pattern with retry edge', () => {
    // Subagent blocks are never merged in Pass 2, so two consecutive subagent
    // groups where the first has an error triggers error-fix in Pass 3
    const messages = [
      assistantMsg([{ name: 'Agent', id: 'agent-1', input: { description: 'failing task' } }]),
      userMsg([{ tool_use_id: 'agent-1', is_error: true }]),
      assistantMsg([{ name: 'Agent', id: 'agent-2', input: { description: 'retry task' } }]),
    ]
    const graph = buildFlowGraph(messages, false)
    const errorFixNodes = graph.elements.filter(
      (e) => e.kind === 'node' && (e as { node: { type: string } }).node.type === 'error-fix',
    )
    expect(errorFixNodes.length).toBeGreaterThan(0)
  })

  test('thinking blocks with >50 chars create think nodes', () => {
    const longThinking = 'A'.repeat(60)
    const messages = [thinkingMsg(longThinking)]
    const graph = buildFlowGraph(messages, false)
    expect(graph.elements).toHaveLength(1)
    const node = (graph.elements[0] as { kind: 'node'; node: { type: string } }).node
    expect(node.type).toBe('think')
  })

  test('thinking blocks with <=50 chars are skipped', () => {
    const shortThinking = 'A'.repeat(50)
    const messages = [thinkingMsg(shortThinking)]
    const graph = buildFlowGraph(messages, false)
    expect(graph.elements).toEqual([])
  })

  test('classifies tool types correctly', () => {
    const toolTests: Array<{ name: string; expectedType: string }> = [
      { name: 'Read', expectedType: 'explore' },
      { name: 'Glob', expectedType: 'explore' },
      { name: 'Grep', expectedType: 'explore' },
      { name: 'WebSearch', expectedType: 'explore' },
      { name: 'Edit', expectedType: 'edit' },
      { name: 'Write', expectedType: 'edit' },
      { name: 'Bash', expectedType: 'execute' },
      { name: 'Agent', expectedType: 'subagent' },
      { name: 'TodoWrite', expectedType: 'task-list' },
      { name: 'AskUserQuestion', expectedType: 'ask-user' },
      { name: 'Skill', expectedType: 'ask-user' },
    ]

    for (const { name, expectedType } of toolTests) {
      const messages = [assistantMsg([{ name, input: {} }])]
      const graph = buildFlowGraph(messages, false)
      const node = (graph.elements[0] as { kind: 'node'; node: { type: string } }).node
      expect(node.type).toBe(expectedType)
    }
  })

  test('generates labels with file context for explore/edit', () => {
    const messages = [
      assistantMsg([{ name: 'Read', input: { file_path: '/project/src/index.ts' } }]),
    ]
    const graph = buildFlowGraph(messages, false)
    const node = (graph.elements[0] as { kind: 'node'; node: { label: string } }).node
    expect(node.label).toContain('src/index.ts')
  })

  test('mega-collapses when nodes exceed threshold', () => {
    // Create 30 alternating tool types to produce >25 nodes
    const messages: unknown[] = []
    for (let i = 0; i < 30; i++) {
      const name = i % 2 === 0 ? 'Read' : 'Bash'
      const input = i % 2 === 0 ? { file_path: `/file${i}.ts` } : { command: `cmd${i}` }
      messages.push(assistantMsg([{ name, id: `tool-${i}`, input }]))
    }
    const graph = buildFlowGraph(messages, false)
    // Should have summary nodes (isSummary: true)
    const summaryNodes = graph.elements.filter(
      (e) => e.kind === 'node' && (e as { node: { isSummary?: boolean } }).node.isSummary,
    )
    expect(summaryNodes.length).toBeGreaterThan(0)
  })
})
