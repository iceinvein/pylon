import { describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { PrContextBundle } from '../../../shared/types'
import type { BuildInput, PrContextBackend } from '../pr-context-backend'
import { PrContextBuilder } from '../pr-context-builder'

class StubBackend implements PrContextBackend {
  readonly mode: 'mcp' | 'heuristic'
  constructor(
    private readonly available: boolean,
    mode: 'mcp' | 'heuristic',
    private readonly bundle: PrContextBundle,
  ) {
    this.mode = mode
  }
  async detectAvailability(): Promise<boolean> {
    return this.available
  }
  async build(_input: BuildInput): Promise<PrContextBundle> {
    return this.bundle
  }
}

async function stageWorktree(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'pr-ctx-builder-'))
  await mkdir(join(dir, '.pylon'), { recursive: true })
  return dir
}

const makeBundle = (): PrContextBundle => ({
  version: 1,
  generatedAt: Date.now(),
  mode: 'heuristic',
  pr: { number: 1, headBranch: 'f', baseBranch: 'm', title: 't' },
  files: [],
  notes: [],
})

describe('PrContextBuilder', () => {
  test('picks MCP backend when available', async () => {
    const mcp = new StubBackend(true, 'mcp', { ...makeBundle(), mode: 'mcp' })
    const heur = new StubBackend(true, 'heuristic', makeBundle())
    const builder = new PrContextBuilder({ mcp, heuristic: heur })
    const worktreePath = await stageWorktree()
    try {
      const result = await builder.build({
        diff: '',
        worktreePath,
        pr: { number: 1, headBranch: 'f', baseBranch: 'm', title: 't' },
        totalTimeoutMs: 20_000,
        perCallTimeoutMs: 8_000,
        signal: new AbortController().signal,
      })
      expect(result.bundle.mode).toBe('mcp')
      const written = JSON.parse(
        await readFile(join(worktreePath, '.pylon/pr-context.json'), 'utf8'),
      )
      expect(written.mode).toBe('mcp')
    } finally {
      await rm(worktreePath, { recursive: true, force: true })
    }
  })

  test('falls back to heuristic when MCP unavailable', async () => {
    const mcp = new StubBackend(false, 'mcp', { ...makeBundle(), mode: 'mcp' })
    const heur = new StubBackend(true, 'heuristic', makeBundle())
    const builder = new PrContextBuilder({ mcp, heuristic: heur })
    const worktreePath = await stageWorktree()
    try {
      const result = await builder.build({
        diff: '',
        worktreePath,
        pr: { number: 1, headBranch: 'f', baseBranch: 'm', title: 't' },
        totalTimeoutMs: 20_000,
        perCallTimeoutMs: 8_000,
        signal: new AbortController().signal,
      })
      expect(result.bundle.mode).toBe('heuristic')
    } finally {
      await rm(worktreePath, { recursive: true, force: true })
    }
  })

  test('aborts when total timeout is exceeded and writes degraded bundle', async () => {
    const slow: PrContextBackend = {
      mode: 'heuristic',
      async detectAvailability() {
        return true
      },
      build(input) {
        return new Promise<PrContextBundle>((resolve, reject) => {
          const t = setTimeout(() => resolve(makeBundle()), 5_000)
          input.signal.addEventListener('abort', () => {
            clearTimeout(t)
            reject(new Error('aborted'))
          })
        })
      },
    }
    const mcp = new StubBackend(false, 'mcp', makeBundle())
    const builder = new PrContextBuilder({ mcp, heuristic: slow })
    const worktreePath = await stageWorktree()
    try {
      const result = await builder.build({
        diff: '',
        worktreePath,
        pr: { number: 1, headBranch: 'f', baseBranch: 'm', title: 't' },
        totalTimeoutMs: 50,
        perCallTimeoutMs: 10,
        signal: new AbortController().signal,
      })
      expect(result.bundle.mode).toBe('degraded')
      expect(result.bundle.notes.some((n) => n.includes('timed out'))).toBe(true)
    } finally {
      await rm(worktreePath, { recursive: true, force: true })
    }
  })

  test('trims bundle to budget when JSON exceeds max size', async () => {
    const fat = makeBundle()
    const bigSnippet = 'x'.repeat(30_000)
    fat.files = [
      {
        path: 'a.ts',
        symbols: [
          {
            name: 'a',
            kind: 'function',
            range: { start: 1, end: 2 },
            definition: bigSnippet,
            references: [],
            referencesTotal: 100,
            referencesTruncated: false,
            tests: [],
          },
          {
            name: 'b',
            kind: 'function',
            range: { start: 10, end: 20 },
            definition: bigSnippet,
            references: [],
            referencesTotal: 1,
            referencesTruncated: false,
            tests: [],
          },
        ],
      },
    ]
    const backend = new StubBackend(true, 'heuristic', fat)
    const builder = new PrContextBuilder({
      mcp: new StubBackend(false, 'mcp', fat),
      heuristic: backend,
      maxBytes: 40_000,
    })
    const worktreePath = await stageWorktree()
    try {
      const result = await builder.build({
        diff: '',
        worktreePath,
        pr: { number: 1, headBranch: 'f', baseBranch: 'm', title: 't' },
        totalTimeoutMs: 20_000,
        perCallTimeoutMs: 8_000,
        signal: new AbortController().signal,
      })
      const sizeBytes = Buffer.byteLength(JSON.stringify(result.bundle))
      expect(sizeBytes).toBeLessThanOrEqual(40_000)
      expect(result.bundle.notes.some((n) => n.includes('trimmed'))).toBe(true)
      const remainingNames = result.bundle.files.flatMap((f) => f.symbols.map((s) => s.name))
      expect(remainingNames).toContain('a')
      expect(remainingNames).not.toContain('b')
    } finally {
      await rm(worktreePath, { recursive: true, force: true })
    }
  })
})
