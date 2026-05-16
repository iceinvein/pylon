import { beforeEach, describe, expect, test } from 'bun:test'
import { useTestStore } from './test-store'

describe('test-store agent settings', () => {
  beforeEach(() => {
    useTestStore.setState({
      agentModel: 'gpt-5.5',
      agentEffort: 'xhigh',
      launchLoading: false,
      launchError: null,
    })
  })

  test('passes selected agent model and effort into batch starts', async () => {
    const calls: unknown[] = []
    globalThis.window = {
      api: {
        startBatch: async (args: unknown) => {
          calls.push(args)
          return []
        },
      },
    } as unknown as Window & typeof globalThis

    await useTestStore.getState().startBatch('/repo', {
      goals: ['Login'],
      agentCount: 1,
      mode: 'manual',
      e2eOutputPath: 'e2e',
      autoStartServer: true,
    })

    expect(calls[0]).toMatchObject({
      agentModel: 'gpt-5.5',
      agentEffort: 'xhigh',
    })
  })

  test('passes selected agent model and effort into goal suggestions', async () => {
    const calls: unknown[] = []
    globalThis.window = {
      api: {
        suggestGoals: async (...args: unknown[]) => {
          calls.push(args)
        },
      },
    } as unknown as Window & typeof globalThis

    await useTestStore.getState().suggestGoals('/repo')

    expect(calls[0]).toEqual(['/repo', 'gpt-5.5', 'xhigh'])
  })

  test('passes selected agent model and effort into exploration starts', async () => {
    const calls: unknown[] = []
    globalThis.window = {
      api: {
        startExploration: async (args: unknown) => {
          calls.push(args)
          return { id: 'exp-1' }
        },
      },
    } as unknown as Window & typeof globalThis

    await useTestStore.getState().startExploration('/repo', {
      url: 'http://localhost:3000',
      goal: 'Login',
      mode: 'manual',
      e2eOutputPath: 'e2e',
    })

    expect(calls[0]).toMatchObject({
      agentModel: 'gpt-5.5',
      agentEffort: 'xhigh',
    })
  })
})
