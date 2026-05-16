import * as path from 'node:path'
import { type EffortLevel, isEffortLevel } from '../shared/types'
import { runProviderTextQuery } from './provider-text-query'
import { getProviderForModel } from './providers/registry'
import type { AgentProvider } from './providers/types'

export const DEFAULT_AST_AGENT_MODEL = 'claude-opus-4-7'
export const DEFAULT_AST_AGENT_EFFORT: EffortLevel = 'high'

export type AstAgentArgs = {
  agentModel?: string
  agentEffort?: EffortLevel
}

export type CachedAstAnalysisRow = {
  repo_graph: string
  arch_analysis: string | null
  analyzed_at: number
}

export function normalizeCachedAnalysisRow(
  row: CachedAstAnalysisRow | undefined,
): { repoGraph: unknown; archAnalysis: unknown | null; analyzedAt: number } | null {
  if (!row?.arch_analysis) return null
  return {
    repoGraph: JSON.parse(row.repo_graph),
    archAnalysis: JSON.parse(row.arch_analysis),
    analyzedAt: row.analyzed_at,
  }
}

export function resolveAstExplainCwd(args: { scope?: string; filePath: string }): string {
  return args.scope || path.dirname(args.filePath)
}

function validAgentEffort(effort: unknown): EffortLevel {
  return isEffortLevel(effort) ? effort : DEFAULT_AST_AGENT_EFFORT
}

function providerLabel(provider: AgentProvider): string {
  return provider.id === 'codex' ? 'Codex' : 'Claude Code'
}

export function resolveAstAgent(args: AstAgentArgs): {
  model: string
  effort: EffortLevel
  provider: AgentProvider | undefined
  label: string
} {
  const model = args.agentModel || DEFAULT_AST_AGENT_MODEL
  const effort = validAgentEffort(args.agentEffort)
  const provider = getProviderForModel(model)
  return {
    model,
    effort,
    provider,
    label: provider ? providerLabel(provider) : `model ${model}`,
  }
}

export function createProviderQueryFn(
  cwd: string,
  agent: { model: string; effort: EffortLevel; provider: AgentProvider },
) {
  return (system: string, prompt: string) =>
    runProviderTextQuery({
      cwd,
      model: agent.model,
      effort: agent.effort,
      systemPrompt: system,
      prompt,
      provider: agent.provider,
    })
}
