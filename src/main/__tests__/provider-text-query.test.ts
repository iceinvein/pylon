import { describe, expect, test } from 'bun:test'
import type { AgentProvider, AgentSession, NormalizedEvent } from '../providers'
import { runProviderTextQuery } from '../provider-text-query'

function fakeProvider(events: NormalizedEvent[]): AgentProvider {
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
    stop() {},
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
      expect(config.permissionMode).toBe('auto-approve')
      if (config.mcpServers) expect(config.mcpServers.playwright?.command).toBe('bunx')
      sessionConfigAssertions = Promise.all([
        expect(config.onPermissionRequest('tool', {}, [])).resolves.toEqual({ behavior: 'allow' }),
        expect(config.onQuestionRequest({})).resolves.toEqual({}),
      ]).then(() => undefined)
      return session
    },
  }
}

describe('runProviderTextQuery', () => {
  test('returns assistant text from a provider text-only session', async () => {
    const text = await runProviderTextQuery({
      cwd: '/repo',
      model: 'gpt-5.5',
      effort: 'high',
      systemPrompt: 'System text',
      prompt: 'User text',
      mcpServers: { playwright: { command: 'bunx', args: ['@playwright/mcp@latest'] } },
      provider: fakeProvider([
        {
          type: 'message_complete',
          role: 'assistant',
          content: [{ type: 'text', text: 'final answer' }],
          raw: {},
        },
      ]),
    })

    expect(text).toBe('final answer')
  })

  test('throws normalized provider errors', async () => {
    await expect(
      runProviderTextQuery({
        cwd: '/repo',
        model: 'gpt-5.5',
        effort: 'high',
        systemPrompt: 'System text',
        prompt: 'User text',
        provider: fakeProvider([{ type: 'error', message: 'Codex auth failed' }]),
      }),
    ).rejects.toThrow('Codex auth failed')
  })
})
