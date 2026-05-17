import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('test manager provider boundary', () => {
  test('does not use the Claude Agent SDK directly', () => {
    const source = readFileSync(join(import.meta.dir, '..', 'test-manager.ts'), 'utf8')

    expect(source).not.toContain('@anthropic-ai/claude-agent-sdk')
    expect(source).not.toContain('createSdkMcpServer')
    expect(source).not.toContain('query({')
  })
})
