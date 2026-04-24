import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { PrContextBundle } from '../../shared/types'
import type { BuildInput, PrContextBackend } from './pr-context-backend'

export type BuilderInput = {
  diff: string
  worktreePath: string
  pr: { number: number; headBranch: string; baseBranch: string; title: string }
  totalTimeoutMs: number
  perCallTimeoutMs: number
  signal: AbortSignal
}

export type BuilderResult = {
  bundle: PrContextBundle
  filePath: string
}

export type BuilderBackends = {
  mcp: PrContextBackend
  heuristic: PrContextBackend
  maxBytes?: number
}

const DEFAULT_MAX_BYTES = 50_000

export class PrContextBuilder {
  private readonly mcp: PrContextBackend
  private readonly heuristic: PrContextBackend
  private readonly maxBytes: number

  constructor(backends: BuilderBackends) {
    this.mcp = backends.mcp
    this.heuristic = backends.heuristic
    this.maxBytes = backends.maxBytes ?? DEFAULT_MAX_BYTES
  }

  async build(input: BuilderInput): Promise<BuilderResult> {
    const mcpOk = await this.mcp.detectAvailability().catch(() => false)
    const backend = mcpOk ? this.mcp : this.heuristic

    const ac = new AbortController()
    const onParentAbort = () => ac.abort()
    if (input.signal.aborted) {
      ac.abort()
    } else {
      input.signal.addEventListener('abort', onParentAbort)
    }
    const timer = setTimeout(() => ac.abort(), input.totalTimeoutMs)

    const backendInput: BuildInput = {
      diff: input.diff,
      worktreePath: input.worktreePath,
      pr: input.pr,
      signal: ac.signal,
      perCallTimeoutMs: input.perCallTimeoutMs,
    }

    let bundle: PrContextBundle
    try {
      if (ac.signal.aborted) throw ac.signal.reason ?? new Error('aborted')
      bundle = await backend.build(backendInput)
    } catch (err) {
      const timedOut = ac.signal.aborted
      const note = timedOut
        ? `context build timed out after ${input.totalTimeoutMs}ms`
        : `context build failed: ${err instanceof Error ? err.message : String(err)}`
      bundle = {
        version: 1,
        generatedAt: Date.now(),
        mode: 'degraded',
        pr: input.pr,
        files: [],
        notes: [note],
      }
    } finally {
      clearTimeout(timer)
      input.signal.removeEventListener('abort', onParentAbort)
    }

    bundle = trimToBudget(bundle, this.maxBytes)

    const filePath = join(input.worktreePath, '.pylon', 'pr-context.json')
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, JSON.stringify(bundle, null, 2), 'utf8')

    return { bundle, filePath }
  }
}

function trimToBudget(bundle: PrContextBundle, maxBytes: number): PrContextBundle {
  let current = bundle
  while (Buffer.byteLength(JSON.stringify(current)) > maxBytes) {
    const ranked: Array<{ fileIdx: number; symIdx: number; score: number }> = []
    current.files.forEach((file, fileIdx) => {
      file.symbols.forEach((sym, symIdx) => {
        ranked.push({ fileIdx, symIdx, score: sym.referencesTotal })
      })
    })
    if (ranked.length === 0) break
    ranked.sort((a, b) => a.score - b.score)
    const lowest = ranked[0]
    const newFiles = current.files
      .map((file, fi) =>
        fi === lowest.fileIdx
          ? { ...file, symbols: file.symbols.filter((_, si) => si !== lowest.symIdx) }
          : file,
      )
      .filter((file) => file.symbols.length > 0)
    const notes = current.notes.includes('bundle trimmed to fit budget')
      ? current.notes
      : [...current.notes, 'bundle trimmed to fit budget']
    current = { ...current, files: newFiles, notes }
  }
  return current
}
