import { describe, expect, test } from 'bun:test'
import { resolveFeatureAgentSelection } from '../../../shared/provider-models'

describe('feature agent selection behavior', () => {
  test('prefers persisted model over app default when valid', () => {
    expect(
      resolveFeatureAgentSelection({
        persistedModel: 'gpt-5.5',
        persistedEffort: 'xhigh',
        appDefaultModel: 'claude-opus-4-7',
        appDefaultEffort: 'high',
        models: [
          {
            id: 'claude-opus-4-7',
            label: 'Opus',
            provider: 'claude',
            supportsEffort: ['high'],
          },
          {
            id: 'gpt-5.5',
            label: 'GPT-5.5',
            provider: 'codex',
            supportsEffort: ['high', 'xhigh'],
          },
        ],
      }),
    ).toEqual({ provider: 'codex', model: 'gpt-5.5', effort: 'xhigh' })
  })
})
