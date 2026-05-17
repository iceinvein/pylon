import { describe, expect, test } from 'bun:test'
import { runProviderTextQuery } from '../provider-text-query'
import type {
  AgentProvider,
  AgentSession,
  NormalizedEvent,
  ProviderSessionConfig,
} from '../providers'

function fakeProvider(
  events: NormalizedEvent[],
  onConfig?: (config: ProviderSessionConfig) => void,
  onStop?: () => void,
): AgentProvider {
  let sessionConfigAssertions: Promise<void> | null = null

  const session: AgentSession = {
    nativeSessionId: null,
    async *send() {},
    async *sendTextOnly(prompt: string) {
      await sessionConfigAssertions
      expect(prompt).toContain('System text')
      expect(prompt).toContain('User text')
      for (const event of events) yield event
    },
    stop() {
      onStop?.()
    },
  }

  return {
    id: 'codex',
    models: [
      {
        id: 'gpt-5.5',
        label: 'GPT-5.5',
        provider: 'codex',
        contextWindow: 1_000_000,
        supportsEffort: ['low', 'medium', 'high', 'xhigh', 'max'],
      },
    ],
    capabilities: {
      interactivePermissions: false,
      askUserQuestion: false,
      reportsCostUsd: false,
      subagents: false,
      sessionResume: true,
      midSessionModelSwitch: false,
      fileCheckpointing: false,
      planMode: false,
    },
    createSession(config) {
      expect(config.cwd).toBe('/repo')
      expect(config.model).toBe('gpt-5.5')
      expect(config.effort).toBe('high')
      expect(config.permissionMode).toBe('never')
      expect(config.mcpServers).toBeUndefined()
      onConfig?.(config)
      sessionConfigAssertions = Promise.all([
        expect(config.onPermissionRequest('tool', {}, [])).resolves.toMatchObject({
          behavior: 'deny',
        }),
        expect(config.onQuestionRequest({})).resolves.toEqual({}),
      ]).then(() => undefined)
      return session
    },
  }
}

describe('runProviderTextQuery', () => {
  test('returns assistant text from a provider text-only session', async () => {
    let stopped = false
    const text = await runProviderTextQuery({
      cwd: '/repo',
      model: 'gpt-5.5',
      effort: 'high',
      systemPrompt: 'System text',
      prompt: 'User text',
      provider: fakeProvider(
        [
          {
            type: 'message_complete',
            role: 'assistant',
            content: [{ type: 'text', text: 'final answer' }],
            raw: {},
          },
        ],
        undefined,
        () => {
          stopped = true
        },
      ),
    })

    expect(text).toBe('final answer')
    expect(stopped).toBe(true)
  })

  test('concatenates assistant text blocks across provider events', async () => {
    const text = await runProviderTextQuery({
      cwd: '/repo',
      model: 'gpt-5.5',
      effort: 'high',
      systemPrompt: 'System text',
      prompt: 'User text',
      provider: fakeProvider([
        {
          type: 'message_complete',
          role: 'assistant',
          content: [
            { type: 'text', text: 'first ' },
            { type: 'text', text: 'answer' },
          ],
          raw: {},
        },
        {
          type: 'message_complete',
          role: 'assistant',
          content: [{ type: 'text', text: ' plus follow-up' }],
          raw: {},
        },
      ]),
    })

    expect(text).toBe('first answer plus follow-up')
  })

  test('throws normalized provider errors', async () => {
    let stopped = false
    await expect(
      runProviderTextQuery({
        cwd: '/repo',
        model: 'gpt-5.5',
        effort: 'high',
        systemPrompt: 'System text',
        prompt: 'User text',
        provider: fakeProvider([{ type: 'error', message: 'Codex auth failed' }], undefined, () => {
          stopped = true
        }),
      }),
    ).rejects.toThrow('Codex auth failed')
    expect(stopped).toBe(true)
  })
})
