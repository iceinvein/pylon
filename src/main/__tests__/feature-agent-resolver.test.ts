import { describe, expect, mock, test } from 'bun:test'
import type { AgentProvider } from '../providers/types'

const codexProvider = { id: 'codex' } as AgentProvider
const claudeProvider = { id: 'claude' } as AgentProvider
const providerRegistry = await import('../providers/registry')
const getActualProviderForModel = providerRegistry.getProviderForModel

mock.module('../providers/registry', () => ({
  ...providerRegistry,
  getProviderForModel: (model: string) => {
    if (model === 'gpt-5.5') return codexProvider
    if (model === 'claude-opus-4-7') return claudeProvider
    return getActualProviderForModel(model)
  },
}))

const { resolveFeatureAgent } = await import('../feature-agent-resolver')

describe('resolveFeatureAgent', () => {
  test('uses requested model when provider owns it', () => {
    const agent = resolveFeatureAgent({
      requestedModel: 'gpt-5.5',
      requestedEffort: 'xhigh',
      featureName: 'testing',
    })
    expect(agent.model).toBe('gpt-5.5')
    expect(agent.provider.id).toBe('codex')
    expect(agent.label).toBe('Codex')
    expect(agent.fellBack).toBe(false)
  })

  test('falls back to default for unknown model', () => {
    const agent = resolveFeatureAgent({
      requestedModel: 'missing',
      requestedEffort: 'bogus',
      featureName: 'testing',
    })
    expect(agent.model).toBe('claude-opus-4-7')
    expect(agent.effort).toBe('high')
    expect(agent.provider.id).toBe('claude')
    expect(agent.fellBack).toBe(true)
  })

  test('can preserve unknown model for graceful caller errors', () => {
    const agent = resolveFeatureAgent({
      requestedModel: 'missing',
      requestedEffort: 'high',
      fallbackUnknownModel: false,
      requireProvider: false,
      featureName: 'AST',
    })
    expect(agent.model).toBe('missing')
    expect(agent.effort).toBe('high')
    expect(agent.provider).toBeUndefined()
    expect(agent.label).toBe('model missing')
  })
})
