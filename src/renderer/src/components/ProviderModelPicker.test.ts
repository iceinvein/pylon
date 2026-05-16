import { describe, expect, test } from 'bun:test'
import type { EffortLevel } from '../../../shared/types'
import type { ProviderModelEntry } from '../lib/provider-models'
import { resolveProviderModelPickerState } from './ProviderModelPicker'

describe('resolveProviderModelPickerState', () => {
  test('disables model selection and keeps valid efforts for an empty model list', () => {
    const state = resolveProviderModelPickerState({
      models: [],
      provider: 'claude',
      model: 'claude-opus-4-7',
      effort: 'high',
      disabled: false,
    })

    expect(state.providerModels).toEqual([])
    expect(state.selectedModel).toBe('')
    expect(state.modelSelectDisabled).toBe(true)
    expect(state.effortSelectDisabled).toBe(true)
    expect(state.effortOptions).toEqual(['low', 'medium', 'high'])
    expect(state.selectedEffort).toBe('high')
  })

  test('does not invent a model for providers with no available models', () => {
    const models: ProviderModelEntry[] = [
      {
        id: 'claude-sonnet-4-6',
        label: 'Sonnet 4.6',
        provider: 'claude',
        supportsEffort: ['low', 'medium'],
      },
    ]

    const state = resolveProviderModelPickerState({
      models,
      provider: 'codex',
      model: 'gpt-5.5',
      effort: 'max',
      disabled: false,
    })

    expect(state.providerModels).toEqual([])
    expect(state.selectedModel).toBe('')
    expect(state.modelSelectDisabled).toBe(true)
    expect(state.effortSelectDisabled).toBe(true)
    expect(state.effortOptions).toEqual(['low', 'medium', 'high'])
    expect(state.selectedEffort satisfies EffortLevel).toBe('high')
  })

  test('falls back to default efforts when a model declares none', () => {
    const models: ProviderModelEntry[] = [
      {
        id: 'gpt-custom',
        label: 'GPT Custom',
        provider: 'codex',
        supportsEffort: [],
      },
    ]

    const state = resolveProviderModelPickerState({
      models,
      provider: 'codex',
      model: 'gpt-custom',
      effort: 'max',
      disabled: false,
    })

    expect(state.selectedModel).toBe('gpt-custom')
    expect(state.effortOptions).toEqual(['low', 'medium', 'high'])
    expect(state.selectedEffort).toBe('high')
  })
})
