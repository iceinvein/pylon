import { describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HeuristicContextBackend } from '../pr-context/heuristic-context-backend'
import { PrContextBuilder } from '../pr-context/pr-context-builder'

describe('pr-review-manager context integration', () => {
  test('PrContextBuilder writes pr-context.json into worktree path', async () => {
    const worktreePath = await mkdtemp(join(tmpdir(), 'pr-review-wire-'))
    try {
      const heuristic = new HeuristicContextBackend()
      const builder = new PrContextBuilder({ mcp: heuristic, heuristic })
      const res = await builder.build({
        diff: '',
        worktreePath,
        pr: { number: 1, headBranch: 'f', baseBranch: 'm', title: 't' },
        totalTimeoutMs: 20_000,
        perCallTimeoutMs: 8_000,
        signal: new AbortController().signal,
      })
      const contents = await readFile(res.filePath, 'utf8')
      expect(JSON.parse(contents).pr.number).toBe(1)
    } finally {
      await rm(worktreePath, { recursive: true, force: true })
    }
  })
})
