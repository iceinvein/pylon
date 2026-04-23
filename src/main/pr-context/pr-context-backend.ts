import type { PrContextBundle } from '../../shared/types'

export type BuildInput = {
  diff: string
  worktreePath: string
  pr: { number: number; headBranch: string; baseBranch: string; title: string }
  signal: AbortSignal
  perCallTimeoutMs: number
}

export interface PrContextBackend {
  readonly mode: 'mcp' | 'heuristic'
  detectAvailability(): Promise<boolean>
  build(input: BuildInput): Promise<PrContextBundle>
}
