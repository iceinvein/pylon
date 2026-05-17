import { describe, expect, test } from 'bun:test'
import {
  clampEffortForModel,
  FALLBACK_PROVIDER_MODELS,
  isProviderId,
  normalizeProviderModels,
  providerForModelId,
  providerLabel,
  resolveFeatureAgentSelection,
} from './provider-models'

describe('shared provider model utilities', () => {
  test('recognizes supported providers and labels them', () => {
    expect(isProviderId('claude')).toBe(true)
    expect(isProviderId('codex')).toBe(true)
    expect(isProviderId('legacy')).toBe(false)
    expect(providerLabel('claude')).toBe('Claude Code')
    expect(providerLabel('codex')).toBe('Codex')
  })

  test('resolves provider by catalog entry, not id prefix', () => {
    expect(providerForModelId('gpt-5.5')).toBe('codex')
    expect(providerForModelId(' claude-opus-4-7 ')).toBe('claude')
    expect(
      providerForModelId('o4-mini', [{ id: 'o4-mini', label: 'O4 Mini', provider: 'codex' }]),
    ).toBe('codex')
    expect(providerForModelId('opus-local')).toBeUndefined()
  })

  test('normalizes provider models and effort levels', () => {
    expect(
      normalizeProviderModels([
        { id: 'valid', label: 'Valid', provider: 'codex', supportsEffort: ['low', 'bogus'] },
        { id: 123, label: 'Bad', provider: 'codex' },
      ]),
    ).toEqual([{ id: 'valid', label: 'Valid', provider: 'codex', supportsEffort: ['low'] }])
    expect(normalizeProviderModels(null)).toBe(FALLBACK_PROVIDER_MODELS)
  })

  test('resolves stale persisted model to provider default', () => {
    expect(
      resolveFeatureAgentSelection({
        persistedModel: 'missing-model',
        persistedProvider: 'codex',
        persistedEffort: 'max',
        appDefaultModel: 'claude-opus-4-7',
        appDefaultEffort: 'high',
        models: FALLBACK_PROVIDER_MODELS,
      }),
    ).toEqual({ provider: 'codex', model: 'gpt-5.5', effort: 'max' })
  })

  test('clamps unsupported effort to the strongest supported level', () => {
    expect(clampEffortForModel('claude-sonnet-4-6', 'max', FALLBACK_PROVIDER_MODELS)).toBe('high')
  })
})
