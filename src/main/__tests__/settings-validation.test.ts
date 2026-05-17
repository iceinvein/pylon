import { describe, expect, test } from 'bun:test'
import { isValidSettingValue } from '../settings-validation'

const providerModels = [
  {
    id: 'claude-opus-4-7',
    label: 'Opus 4.7',
    provider: 'claude' as const,
    contextWindow: 1_000_000,
    supportsEffort: ['high' as const],
  },
  {
    id: 'gpt-5.5',
    label: 'GPT-5.5',
    provider: 'codex' as const,
    contextWindow: 1_000_000,
    supportsEffort: ['high' as const],
  },
]

describe('settings validation', () => {
  test('accepts known model settings', () => {
    expect(isValidSettingValue('defaultModel', 'claude-opus-4-7', providerModels)).toBe(true)
    expect(isValidSettingValue('testingAgentModel', 'gpt-5.5', providerModels)).toBe(true)
    expect(isValidSettingValue('astAgentModel', 'claude-opus-4-7', providerModels)).toBe(true)
  })

  test('accepts non-empty model settings for discovered or custom models', () => {
    expect(isValidSettingValue('defaultModel', 'missing-model', providerModels)).toBe(true)
    expect(isValidSettingValue('testingAgentModel', 'unknown-model', providerModels)).toBe(true)
    expect(isValidSettingValue('astAgentModel', '', providerModels)).toBe(false)
  })

  test('validates effort settings and leaves unrelated settings alone', () => {
    expect(isValidSettingValue('defaultEffort', 'bogus', providerModels)).toBe(false)
    expect(isValidSettingValue('testingAgentEffort', 'high', providerModels)).toBe(true)
    expect(isValidSettingValue('theme', 'dark', providerModels)).toBe(true)
  })
})
