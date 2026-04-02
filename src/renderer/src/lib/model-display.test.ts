import { describe, expect, test } from 'bun:test'
import { getAssistantDisplayName } from './model-display'

describe('getAssistantDisplayName', () => {
  test('returns Claude for Claude models', () => {
    expect(getAssistantDisplayName('claude-opus-4-6')).toBe('Claude')
    expect(getAssistantDisplayName('claude-sonnet-4-6')).toBe('Claude')
  })

  test('returns Codex for OpenAI and Codex models', () => {
    expect(getAssistantDisplayName('gpt-5.4')).toBe('Codex')
    expect(getAssistantDisplayName('gpt-5.4-mini')).toBe('Codex')
    expect(getAssistantDisplayName('gpt-5.3-codex')).toBe('Codex')
    expect(getAssistantDisplayName('o3')).toBe('Codex')
  })

  test('falls back to Claude when model is missing or unknown', () => {
    expect(getAssistantDisplayName(undefined)).toBe('Claude')
    expect(getAssistantDisplayName('')).toBe('Claude')
    expect(getAssistantDisplayName('custom-model')).toBe('Claude')
  })
})
