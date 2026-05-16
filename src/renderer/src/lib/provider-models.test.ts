import { describe, expect, test } from 'bun:test'
import {
  clampEffortForModel,
  defaultModelForProvider,
  FALLBACK_PROVIDER_MODELS,
  providerLabel,
  resolveFeatureAgentSelection,
} from './provider-models'

describe('provider model utilities', () => {
  test('labels known providers', () => {
    expect(providerLabel('claude')).toBe('Claude Code')
    expect(providerLabel('codex')).toBe('Codex')
  })

  test('returns provider defaults from available models', () => {
    expect(defaultModelForProvider('codex', FALLBACK_PROVIDER_MODELS)).toBe('gpt-5.5')
    expect(defaultModelForProvider('claude', FALLBACK_PROVIDER_MODELS)).toBe('claude-opus-4-7')
  })

  test('clamps effort to selected model support', () => {
    expect(clampEffortForModel('claude-sonnet-4-6', 'max', FALLBACK_PROVIDER_MODELS)).toBe('high')
    expect(clampEffortForModel('gpt-5.5', 'xhigh', FALLBACK_PROVIDER_MODELS)).toBe('xhigh')
  })

  test('resolves stale persisted model to same provider default', () => {
    expect(
      resolveFeatureAgentSelection({
        persistedModel: 'missing-codex-model',
        persistedProvider: 'codex',
        persistedEffort: 'max',
        appDefaultModel: 'claude-opus-4-7',
        appDefaultEffort: 'high',
        models: FALLBACK_PROVIDER_MODELS,
      }),
    ).toEqual({ provider: 'codex', model: 'gpt-5.5', effort: 'max' })
  })
})
