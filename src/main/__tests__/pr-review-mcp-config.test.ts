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
})
