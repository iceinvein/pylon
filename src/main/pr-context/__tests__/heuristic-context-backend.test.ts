import { describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { HeuristicContextBackend } from '../heuristic-context-backend'

async function stageWorktree(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'pr-ctx-heur-'))
  for (const [relPath, content] of Object.entries(files)) {
    const full = join(dir, relPath)
    await mkdir(dirname(full), { recursive: true })
    await writeFile(full, content, 'utf8')
  }
  return dir
}

describe('HeuristicContextBackend', () => {
  test('detectAvailability always returns true', async () => {
    const backend = new HeuristicContextBackend()
    expect(await backend.detectAvailability()).toBe(true)
  })

  test('build produces a bundle with changed symbols and no references', async () => {
    const sourceAfter = `export function changed(x: number): number {\n  return x * 2\n}\n`
    const worktree = await stageWorktree({
      'src/foo.ts': sourceAfter,
      'src/foo.test.ts': `import { changed } from './foo'\ntest('x', () => expect(changed(2)).toBe(4))\n`,
    })
    try {
      const backend = new HeuristicContextBackend()
      const diff = [
        'diff --git a/src/foo.ts b/src/foo.ts',
        'index 0..1 100644',
        '--- a/src/foo.ts',
        '+++ b/src/foo.ts',
        '@@ -1,3 +1,3 @@',
        '-export function changed(x: number): number {',
        '-  return x + 1',
        '+export function changed(x: number): number {',
        '+  return x * 2',
        ' }',
        '',
      ].join('\n')

      const bundle = await backend.build({
        diff,
        worktreePath: worktree,
        pr: { number: 1, headBranch: 'f', baseBranch: 'm', title: 't' },
        signal: new AbortController().signal,
        perCallTimeoutMs: 5000,
      })

      expect(bundle.mode).toBe('heuristic')
      expect(bundle.files).toHaveLength(1)
      const file = bundle.files[0]
      expect(file.path).toBe('src/foo.ts')
      const sym = file.symbols.find((s) => s.name === 'changed')
      expect(sym).toBeDefined()
      expect(sym?.references).toEqual([])
      expect(sym?.referencesTotal).toBe(0)
      expect(sym?.referencesTruncated).toBe(false)
      expect(sym?.tests.map((t) => t.file)).toContain('src/foo.test.ts')
      expect(bundle.notes.some((n) => n.includes('heuristic mode'))).toBe(true)
    } finally {
      await rm(worktree, { recursive: true, force: true })
    }
  })

  test('skips file with unsupported extension but still includes entry', async () => {
    const worktree = await stageWorktree({ 'x.xyz': 'whatever' })
    try {
      const backend = new HeuristicContextBackend()
      const diff = [
        'diff --git a/x.xyz b/x.xyz',
        'index 0..1 100644',
        '--- a/x.xyz',
        '+++ b/x.xyz',
        '@@ -1,1 +1,1 @@',
        '-whatever',
        '+whatever2',
        '',
      ].join('\n')

      const bundle = await backend.build({
        diff,
        worktreePath: worktree,
        pr: { number: 1, headBranch: 'f', baseBranch: 'm', title: 't' },
        signal: new AbortController().signal,
        perCallTimeoutMs: 5000,
      })
      expect(bundle.files).toHaveLength(1)
      expect(bundle.files[0].symbols).toEqual([])
    } finally {
      await rm(worktree, { recursive: true, force: true })
    }
  })
})
