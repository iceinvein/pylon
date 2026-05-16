import type { EffortLevel } from '../shared/types'
import { getProviderForModel } from './providers/registry'
import type { AgentProvider, McpServerStdioConfig } from './providers/types'

type ProviderTextQueryOptions = {
  cwd: string
  model: string
  effort: EffortLevel
  systemPrompt: string
  prompt: string
  mcpServers?: Record<string, McpServerStdioConfig>
  provider?: AgentProvider
}

export async function runProviderTextQuery(options: ProviderTextQueryOptions): Promise<string> {
  const provider = options.provider ?? getProviderForModel(options.model)
  if (!provider) throw new Error(`No provider found for model: ${options.model}`)

  const textSession = provider.createSession({
    cwd: options.cwd,
    model: options.model,
    effort: options.effort,
    permissionMode: 'auto-approve',
    abortController: new AbortController(),
    onPermissionRequest: async () => ({ behavior: 'allow' as const }),
    onQuestionRequest: async () => ({}),
    mcpServers: options.mcpServers,
  })

  const combinedPrompt = `${options.systemPrompt}\n\n${options.prompt}`
  let responseText = ''
  for await (const event of textSession.sendTextOnly(combinedPrompt)) {
    if (event.type === 'error') throw new Error(event.message)
    if (event.type === 'message_complete' && event.role === 'assistant') {
      const textBlock = event.content.find((b) => b.type === 'text')
      if (textBlock?.type === 'text') responseText = textBlock.text
    }
  }
  return responseText
}
