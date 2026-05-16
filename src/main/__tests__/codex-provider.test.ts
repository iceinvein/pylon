import { describe, expect, test } from 'bun:test'
import { buildCodexConfigOverrides } from '../providers/codex-provider'

describe('Codex provider config overrides', () => {
  test('maps Pylon MCP servers into Codex CLI config shape', () => {
    expect(
      buildCodexConfigOverrides({
        'code-intelligence': {
          command: 'npx',
          args: ['-y', '@iceinvein/code-intelligence-mcp'],
          env: { TEST_ENV: '1' },
        },
      }),
    ).toEqual({
      mcp_servers: {
        'code-intelligence': {
          command: 'npx',
          args: ['-y', '@iceinvein/code-intelligence-mcp'],
          env: { TEST_ENV: '1' },
        },
      },
    })
  })

  test('maps URL MCP servers into Codex CLI daemon config shape', () => {
    expect(
      buildCodexConfigOverrides({
        'code-intelligence': {
          type: 'http',
          url: 'http://127.0.0.1:17800/mcp',
          bearerTokenEnvVar: 'CODE_INTELLIGENCE_TOKEN',
        },
      }),
    ).toEqual({
      mcp_servers: {
        'code-intelligence': {
          url: 'http://127.0.0.1:17800/mcp',
          bearer_token_env_var: 'CODE_INTELLIGENCE_TOKEN',
        },
      },
    })
  })
})
