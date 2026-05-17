import { describe, expect, mock, test } from 'bun:test'
import type { AgentProvider } from '../providers'

const codexProvider = { id: 'codex' } as AgentProvider
const claudeProvider = { id: 'claude' } as AgentProvider

mock.module('../providers', () => ({
  getProviderForModel: (model: string) => {
    if (model === 'gpt-5.5') return codexProvider
    if (model === 'claude-opus-4-7') return claudeProvider
    return undefined
  },
}))

const { resolveFeatureAgent } = await import('../feature-agent-resolver')

describe('resolveFeatureAgent', () => {
  test('uses requested model when provider owns it', () => {
    const agent = resolveFeatureAgent({
      feature: 'testing',
      requestedModel: 'gpt-5.5',
      requestedEffort: 'xhigh',
    })
    expect(agent.model).toBe('gpt-5.5')
    expect(agent.provider.id).toBe('codex')
    expect(agent.label).toBe('Codex')
  })

  test('falls back to feature default for unknown model', () => {
    const agent = resolveFeatureAgent({
      feature: 'ast',
      requestedModel: 'missing',
      requestedEffort: 'bogus',
    })
    expect(agent.model).toBe('claude-opus-4-7')
    expect(agent.effort).toBe('high')
    expect(agent.provider.id).toBe('claude')
  })
})
