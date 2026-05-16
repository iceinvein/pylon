import { describe, expect, test } from 'bun:test'
import {
  clampEffortForModel,
  defaultModelForProvider,
  FALLBACK_PROVIDER_MODELS,
  normalizeProviderModels,
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

  test('ignores invalid persisted provider and uses valid app default provider', () => {
    expect(
      resolveFeatureAgentSelection({
        persistedModel: 'missing-model',
        persistedProvider: 'stale-provider',
        persistedEffort: 'high',
        appDefaultModel: 'gpt-5.5',
        appDefaultEffort: 'medium',
        models: FALLBACK_PROVIDER_MODELS,
      }),
    ).toEqual({ provider: 'codex', model: 'gpt-5.5', effort: 'high' })
  })

  test('sanitizes malformed model payloads', () => {
    expect(
      normalizeProviderModels([
        {
          id: 'valid-codex',
          label: 'Valid Codex',
          provider: 'codex',
          supportsEffort: ['low', 'bogus', 'max'],
        },
        { id: 123, label: 'Bad ID', provider: 'codex', supportsEffort: ['high'] },
        { id: 'bad-label', label: null, provider: 'codex', supportsEffort: ['high'] },
        { id: 'bad-provider', label: 'Bad Provider', provider: 'legacy', supportsEffort: ['high'] },
      ]),
    ).toEqual([
      {
        id: 'valid-codex',
        label: 'Valid Codex',
        provider: 'codex',
        supportsEffort: ['low', 'max'],
      },
    ])
  })

  test('falls back to bundled models when normalized payload is empty', () => {
    expect(
      normalizeProviderModels([
        { id: 123, label: 'Bad ID', provider: 'codex' },
        { id: 'bad-provider', label: 'Bad Provider', provider: 'legacy' },
      ]),
    ).toBe(FALLBACK_PROVIDER_MODELS)
  })

  test('uses app default model when persisted model and provider are invalid', () => {
    expect(
      resolveFeatureAgentSelection({
        persistedModel: 'missing-model',
        persistedProvider: 'legacy-provider',
        persistedEffort: 'unknown',
        appDefaultModel: 'claude-haiku-4-5',
        appDefaultEffort: 'medium',
        models: FALLBACK_PROVIDER_MODELS,
      }),
    ).toEqual({ provider: 'claude', model: 'claude-haiku-4-5', effort: 'medium' })
  })
})
