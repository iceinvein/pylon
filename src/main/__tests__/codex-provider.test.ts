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
})
