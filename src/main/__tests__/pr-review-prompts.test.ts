import { describe, expect, test } from 'bun:test'
import {
  buildPrReviewContinuationPrompt,
  buildPrReviewFirstChunkPrompt,
  countMcpToolUses,
} from '../pr-review-prompts'

const sampleDetail = {
  title: 'sample',
  author: 'someone',
  headBranch: 'feat/x',
  baseBranch: 'master',
  body: 'PR body',
  files: [{ path: 'src/foo.ts', additions: 3, deletions: 1 }],
} as const

const sampleChunk = {
  diff: 'diff --git a/src/foo.ts b/src/foo.ts\n+++ b/src/foo.ts\n@@\n+const x = 1',
  files: ['src/foo.ts'],
}

describe('buildPrReviewFirstChunkPrompt structure', () => {
  const prompt = buildPrReviewFirstChunkPrompt({
    focus: 'bugs',
    detail: sampleDetail,
    chunk: sampleChunk,
    chunkIndex: 0,
    totalChunks: 1,
    skippedFiles: [],
    specialistPrompt: 'Look for bugs.',
  })

  const lines = prompt.split('\n')

  test('places code-intelligence tools section before volume budget', () => {
    const toolsIdx = prompt.indexOf('## Tools: Code Intelligence')
    const budgetIdx = prompt.indexOf('## Volume Budget')
    expect(toolsIdx).toBeGreaterThan(0)
    expect(budgetIdx).toBeGreaterThan(0)
    expect(toolsIdx).toBeLessThan(budgetIdx)
  })

  test('places code-intelligence tools section before final quality gate', () => {
    const toolsIdx = prompt.indexOf('## Tools: Code Intelligence')
    const gateIdx = prompt.indexOf('## Final Quality Gate')
    expect(toolsIdx).toBeLessThan(gateIdx)
  })

  test('places code-intelligence tools section before output format', () => {
    const toolsIdx = prompt.indexOf('## Tools: Code Intelligence')
    const outIdx = prompt.indexOf('## Output Format')
    expect(toolsIdx).toBeLessThan(outIdx)
  })

  test('uses imperative trigger language, not "you may"', () => {
    const toolLines = lines.filter((l: string) =>
      l.match(/`(search_code|get_definition|find_references|get_call_hierarchy|trace_data_flow)`/),
    )
    expect(toolLines.length).toBeGreaterThanOrEqual(5)
    for (const line of toolLines) {
      expect(line.toLowerCase()).not.toContain('you may')
      expect(line.toLowerCase()).not.toContain('if needed')
    }
  })

  test('every documented MCP tool has a stated trigger', () => {
    const tools = [
      'search_code',
      'get_definition',
      'find_references',
      'get_call_hierarchy',
      'trace_data_flow',
    ]
    for (const tool of tools) {
      // Trigger pattern: "call <tool> when ..." OR "before <doing X>, call <tool>"
      const re = new RegExp(`\`${tool}\`[^\\n]*\\bwhen\\b`, 'i')
      expect(prompt).toMatch(re)
    }
  })

  test('tells reviewer to verify rather than drop low-confidence findings', () => {
    expect(prompt.toLowerCase()).toContain('verify')
    // The escape valve should be: call tools to resolve uncertainty.
    const verifySection = prompt.toLowerCase().match(/\bverify\b[\s\S]{0,400}/g) ?? []
    const hasToolEscape = verifySection.some((s: string) =>
      /search_code|get_definition|find_references|get_call_hierarchy|trace_data_flow/.test(s),
    )
    expect(hasToolEscape).toBe(true)
  })

  test('still references the pre-computed bundle as the first step', () => {
    const bundleIdx = prompt.indexOf('.pylon/pr-context.json')
    const toolsIdx = prompt.indexOf('## Tools: Code Intelligence')
    expect(bundleIdx).toBeGreaterThan(0)
    expect(bundleIdx).toBeLessThan(toolsIdx)
  })
})

describe('buildPrReviewContinuationPrompt', () => {
  test('keeps continuation chunks short', () => {
    const continuation = buildPrReviewContinuationPrompt({
      focus: 'bugs',
      chunk: sampleChunk,
      chunkIndex: 1,
      totalChunks: 3,
    })
    expect(continuation).toContain('chunk 2 of 3')
    expect(continuation).toContain('review-findings')
    expect(continuation.length).toBeLessThan(2000)
  })
})

describe('countMcpToolUses', () => {
  test('counts mcp__code-intelligence__* tool_use blocks across messages', () => {
    const messages: unknown[] = [
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'inspecting' },
            { type: 'tool_use', name: 'mcp__code-intelligence__find_references', input: {} },
            { type: 'tool_use', name: 'Read', input: {} },
            { type: 'tool_use', name: 'mcp__code-intelligence__search_code', input: {} },
          ],
        },
      },
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_use', name: 'mcp__code-intelligence__get_definition', input: {} },
          ],
        },
      },
    ]
    const tally = countMcpToolUses(messages)
    expect(tally.attempts).toBe(3)
    expect(tally.byTool.find_references).toBe(1)
    expect(tally.byTool.search_code).toBe(1)
    expect(tally.byTool.get_definition).toBe(1)
  })

  test('counts MCP tool errors via tool_result.is_error blocks', () => {
    const messages: unknown[] = [
      {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'a',
              name: 'mcp__code-intelligence__find_references',
              input: {},
            },
          ],
        },
      },
      {
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'a',
              is_error: true,
              content: 'connection refused',
            },
          ],
        },
      },
    ]
    const tally = countMcpToolUses(messages)
    expect(tally.attempts).toBe(1)
    expect(tally.errors).toBe(1)
  })

  test('returns zeros when no MCP tool uses are present', () => {
    const messages: unknown[] = [
      {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'hello' }] },
      },
    ]
    const tally = countMcpToolUses(messages)
    expect(tally.attempts).toBe(0)
    expect(tally.errors).toBe(0)
  })

  test('ignores non-MCP tool uses', () => {
    const messages: unknown[] = [
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_use', name: 'Read', input: {} },
            { type: 'tool_use', name: 'Bash', input: {} },
          ],
        },
      },
    ]
    expect(countMcpToolUses(messages).attempts).toBe(0)
  })
})

describe('heuristic backend wording', () => {
  test('heuristic-mode note is imperative, not hedged', async () => {
    const { HeuristicContextBackend } = await import('../pr-context/heuristic-context-backend')
    const backend = new HeuristicContextBackend()
    const { mkdtemp, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = await mkdtemp(join(tmpdir(), 'heuristic-wording-'))
    try {
      const bundle = await backend.build({
        diff: '',
        worktreePath: dir,
        pr: { number: 1, headBranch: 'f', baseBranch: 'm', title: 't' },
        signal: new AbortController().signal,
        perCallTimeoutMs: 5000,
      })
      const note = bundle.notes.join(' ').toLowerCase()
      expect(note).not.toContain('if needed')
      expect(note).toContain('call find_references')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
