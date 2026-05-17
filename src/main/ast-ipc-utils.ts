import * as path from 'node:path'
import type { EffortLevel } from '../shared/types'
import { resolveFeatureAgent } from './feature-agent-resolver'
import { runProviderTextQuery } from './provider-text-query'
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
  if (!row) return null
  return {
    repoGraph: JSON.parse(row.repo_graph),
    archAnalysis: row.arch_analysis ? JSON.parse(row.arch_analysis) : null,
    analyzedAt: row.analyzed_at,
  }
}

export function resolveAstExplainCwd(args: { scope?: string; filePath: string }): string {
  return args.scope || path.dirname(args.filePath)
}

export function resolveAstAgent(args: AstAgentArgs): {
  model: string
  effort: EffortLevel
  provider?: AgentProvider
  label: string
} {
  return resolveFeatureAgent({
    requestedModel: args.agentModel,
    requestedEffort: args.agentEffort,
    fallbackUnknownModel: false,
    requireProvider: false,
    featureName: 'AST',
  })
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
