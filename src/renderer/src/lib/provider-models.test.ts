import { describe, expect, test } from 'bun:test'
import {
  clampEffortForModel,
  defaultModelForProvider,
  FALLBACK_PROVIDER_MODELS,
  normalizeProviderModels,
  providerForModelId,
  providerLabel,
  resolveFeatureAgentSelection,
} from './provider-models'

describe('provider model utilities', () => {
  test('labels known providers', () => {
    expect(providerLabel('claude')).toBe('Claude Code')
    expect(providerLabel('codex')).toBe('Codex')
  })

  test('resolves providers from model catalog entries without prefix heuristics', () => {
    expect(providerForModelId('gpt-5.5')).toBe('codex')
    expect(providerForModelId(' claude-opus-4-7 ')).toBe('claude')
    expect(
      providerForModelId('o4-mini', [
        {
          id: 'o4-mini',
          label: 'O4 Mini',
          provider: 'codex',
        },
      ]),
    ).toBe('codex')
    expect(providerForModelId('opus-local')).toBeUndefined()
  })

  test('returns provider defaults from available models', () => {
    expect(defaultModelForProvider('codex', FALLBACK_PROVIDER_MODELS)).toBe('gpt-5.5')
    expect(defaultModelForProvider('claude', FALLBACK_PROVIDER_MODELS)).toBe('claude-opus-4-7')
  })

  test('clamps effort to selected model support', () => {
    expect(clampEffortForModel('claude-sonnet-4-6', 'max', FALLBACK_PROVIDER_MODELS)).toBe('high')
    expect(clampEffortForModel('gpt-5.5', 'xhigh', FALLBACK_PROVIDER_MODELS)).toBe('xhigh')
  })

  test('resolves stale persisted model to app default', () => {
    expect(
      resolveFeatureAgentSelection({
        persistedModel: 'missing-codex-model',
        persistedEffort: 'max',
        appDefaultModel: 'claude-opus-4-7',
        appDefaultEffort: 'high',
        models: FALLBACK_PROVIDER_MODELS,
      }),
    ).toEqual({ provider: 'claude', model: 'claude-opus-4-7', effort: 'max' })
  })

  test('uses valid app default provider when persisted model is stale', () => {
    expect(
      resolveFeatureAgentSelection({
        persistedModel: 'missing-model',
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

  test('falls back to bundled models when normalized payload is null', () => {
    expect(normalizeProviderModels(null)).toBe(FALLBACK_PROVIDER_MODELS)
  })

  test('falls back to bundled models when normalized payload is an object', () => {
    expect(normalizeProviderModels({})).toBe(FALLBACK_PROVIDER_MODELS)
  })

  test('uses app default model when persisted model is stale', () => {
    expect(
      resolveFeatureAgentSelection({
        persistedModel: 'missing-model',
        persistedEffort: 'unknown',
        appDefaultModel: 'claude-haiku-4-5',
        appDefaultEffort: 'medium',
        models: FALLBACK_PROVIDER_MODELS,
      }),
    ).toEqual({ provider: 'claude', model: 'claude-haiku-4-5', effort: 'medium' })
  })
})
