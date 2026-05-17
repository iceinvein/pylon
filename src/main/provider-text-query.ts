import type { EffortLevel } from '../shared/types'
import { getProviderForModel } from './providers/registry'
import type { AgentProvider } from './providers/types'

type ProviderTextQueryOptions = {
  cwd: string
  model: string
  effort: EffortLevel
  systemPrompt: string
  prompt: string
  abortController?: AbortController
  provider?: AgentProvider
}

export async function runProviderTextQuery(options: ProviderTextQueryOptions): Promise<string> {
  const provider = options.provider ?? getProviderForModel(options.model)
  if (!provider) throw new Error(`No provider found for model: ${options.model}`)

  const textSession = provider.createSession({
    cwd: options.cwd,
    model: options.model,
    effort: options.effort,
    permissionMode: 'never',
    abortController: options.abortController ?? new AbortController(),
    onPermissionRequest: async () => ({
      behavior: 'deny' as const,
      message: 'Tool use is disabled for text-only provider queries.',
    }),
    onQuestionRequest: async () => ({}),
  })

  let responseText = ''
  try {
    for await (const event of textSession.sendTextOnly({
      system: options.systemPrompt,
      prompt: options.prompt,
    })) {
      if (event.type === 'error') throw new Error(event.message)
      if (event.type === 'message_complete' && event.role === 'assistant') {
        responseText += event.content
          .filter((b) => b.type === 'text')
          .map((b) => b.text)
          .join('')
      }
    }
    return responseText
  } finally {
    textSession.stop()
  }
}
