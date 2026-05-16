import { describe, expect, test } from 'bun:test'
import { buildClaudeMcpServerConfigs } from '../providers/mcp-config'

describe('Claude provider MCP config mapping', () => {
  test('maps stdio MCP servers and forces tools to load up front', () => {
    expect(
      buildClaudeMcpServerConfigs({
        'code-intelligence': {
          command: 'npx',
          args: ['-y', '@iceinvein/code-intelligence-mcp'],
          env: { TEST_ENV: '1' },
        },
      }),
    ).toEqual({
      'code-intelligence': {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@iceinvein/code-intelligence-mcp'],
        env: { TEST_ENV: '1' },
        alwaysLoad: true,
      },
    })
  })

  test('maps URL MCP servers and forces tools to load up front', () => {
    expect(
      buildClaudeMcpServerConfigs({
        'code-intelligence': {
          type: 'http',
          url: 'http://127.0.0.1:17800/mcp',
        },
      }),
    ).toEqual({
      'code-intelligence': {
        type: 'http',
        url: 'http://127.0.0.1:17800/mcp',
        alwaysLoad: true,
      },
    })
  })
})
