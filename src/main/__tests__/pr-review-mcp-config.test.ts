import { describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readMcpFromFile } from '../pr-review-mcp-config'

describe('PR review MCP config resolution', () => {
  test('reads Claude-style mcpServers JSON files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pr-mcp-json-'))
    try {
      const file = join(dir, '.mcp.json')
      await writeFile(
        file,
        JSON.stringify({
          mcpServers: {
            'code-intelligence': {
              command: 'npx',
              args: ['-y', '@iceinvein/code-intelligence-mcp'],
              env: { TEST_ENV: '1' },
            },
          },
        }),
      )

      expect(readMcpFromFile(file)).toEqual({
        command: 'npx',
        args: ['-y', '@iceinvein/code-intelligence-mcp'],
        env: { TEST_ENV: '1' },
      })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('reads Claude-style URL MCP server JSON files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pr-mcp-json-url-'))
    try {
      const file = join(dir, '.claude.json')
      await writeFile(
        file,
        JSON.stringify({
          mcpServers: {
            'code-intelligence': {
              type: 'streamable-http',
              url: 'http://127.0.0.1:17800/mcp',
            },
          },
        }),
      )

      expect(readMcpFromFile(file)).toEqual({
        type: 'http',
        url: 'http://127.0.0.1:17800/mcp',
      })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('reads Codex config.toml mcp_servers entries', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pr-mcp-toml-'))
    try {
      const file = join(dir, 'config.toml')
      await writeFile(
        file,
        [
          'model = "gpt-5.5"',
          '',
          '[mcp_servers.code-intelligence]',
          'command = "npx"',
          'args = ["-y", "@iceinvein/code-intelligence-mcp"]',
          '',
          '[mcp_servers.other]',
          'command = "other"',
        ].join('\n'),
      )

      expect(readMcpFromFile(file)).toEqual({
        command: 'npx',
        args: ['-y', '@iceinvein/code-intelligence-mcp'],
      })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('reads Codex config.toml URL mcp_servers entries', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pr-mcp-toml-url-'))
    try {
      const file = join(dir, 'config.toml')
      await writeFile(
        file,
        [
          'model = "gpt-5.5"',
          '',
          '[mcp_servers.code-intelligence]',
          'url = "http://127.0.0.1:17800/mcp"',
          'bearer_token_env_var = "CODE_INTELLIGENCE_TOKEN"',
          '',
          '[mcp_servers.other]',
          'command = "other"',
        ].join('\n'),
      )

      expect(readMcpFromFile(file)).toEqual({
        type: 'http',
        url: 'http://127.0.0.1:17800/mcp',
        bearerTokenEnvVar: 'CODE_INTELLIGENCE_TOKEN',
      })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
