import type { ProviderSessionConfig } from './types'

type McpServerMap = NonNullable<ProviderSessionConfig['mcpServers']>

export function buildClaudeMcpServerConfigs(mcpServers: McpServerMap): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(mcpServers).map(([name, server]) => {
      if ('url' in server) {
        const type = server.type === 'sse' ? 'sse' : 'http'
        const config: Record<string, unknown> = {
          type,
          url: server.url,
          alwaysLoad: true,
        }
        if (server.headers) config.headers = server.headers
        return [name, config]
      }

      return [
        name,
        {
          type: 'stdio' as const,
          ...server,
          alwaysLoad: true,
        },
      ]
    }),
  )
}
