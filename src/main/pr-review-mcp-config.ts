import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { McpServerConfig } from './providers/types'

export type McpStdioConfig = McpServerConfig

export function readMcpFromFile(path: string): McpStdioConfig | null {
  if (!existsSync(path)) return null

  const contents = readFileSync(path, 'utf8')
  const jsonConfig = readJsonMcp(contents)
  if (jsonConfig) return jsonConfig

  return readCodexTomlMcp(contents)
}

export function resolveCodeIntelligenceMcpConfig(
  dbOverride: McpStdioConfig | null,
  candidateCwds: Array<string | undefined>,
  homeDir = homedir(),
): McpStdioConfig | null {
  if (dbOverride) return dbOverride

  for (const cwd of candidateCwds) {
    if (!cwd) continue
    const fromProject = readMcpFromFile(join(cwd, '.mcp.json'))
    if (fromProject) return fromProject
  }

  const fromClaudeScope = readMcpFromFile(join(homeDir, '.claude.json'))
  if (fromClaudeScope) return fromClaudeScope

  return readMcpFromFile(join(homeDir, '.codex', 'config.toml'))
}

function readJsonMcp(contents: string): McpStdioConfig | null {
  try {
    const json = JSON.parse(contents) as {
      mcpServers?: Record<string, Partial<McpServerConfig>>
    }
    const entry = json.mcpServers?.['code-intelligence']
    return entry ? normalizeMcpConfig(entry) : null
  } catch {
    return null
  }
}

function readCodexTomlMcp(contents: string): McpStdioConfig | null {
  const section = extractTomlSection(contents, 'mcp_servers.code-intelligence')
  if (!section) return null

  const command = readTomlString(section, 'command')
  const url = readTomlString(section, 'url')
  if (!command && !url) return null

  if (url) {
    return normalizeMcpConfig({
      type: 'http',
      url,
      bearerTokenEnvVar: readTomlString(section, 'bearer_token_env_var'),
      headers: readTomlInlineStringTable(section, 'http_headers'),
      envHttpHeaders: readTomlInlineStringTable(section, 'env_http_headers'),
    })
  }

  return normalizeMcpConfig({
    command,
    args: readTomlStringArray(section, 'args'),
    env: readTomlInlineStringTable(section, 'env'),
  })
}

function extractTomlSection(contents: string, sectionName: string): string | null {
  const lines = contents.split(/\r?\n/)
  const header = `[${sectionName}]`
  const start = lines.findIndex((line) => line.trim() === header)
  if (start === -1) return null

  const sectionLines: string[] = []
  for (let i = start + 1; i < lines.length; i++) {
    const trimmed = lines[i]?.trim() ?? ''
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) break
    sectionLines.push(lines[i] ?? '')
  }
  return sectionLines.join('\n')
}

function readTomlString(section: string, key: string): string | undefined {
  const match = section.match(new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*"([^"]*)"\\s*$`, 'm'))
  return match?.[1]
}

function readTomlStringArray(section: string, key: string): string[] | undefined {
  const match = section.match(new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*\\[(.*)\\]\\s*$`, 'm'))
  if (!match?.[1]) return undefined
  const values = [...match[1].matchAll(/"([^"]*)"/g)].map((m) => m[1])
  return values.length > 0 ? values : undefined
}

function readTomlInlineStringTable(
  section: string,
  key: string,
): Record<string, string> | undefined {
  const match = section.match(new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*\\{(.*)\\}\\s*$`, 'm'))
  if (!match?.[1]) return undefined

  const env: Record<string, string> = {}
  for (const pair of match[1].split(',')) {
    const item = pair.trim()
    const pairMatch = item.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"([^"]*)"$/)
    if (pairMatch) env[pairMatch[1]] = pairMatch[2]
  }
  return Object.keys(env).length > 0 ? env : undefined
}

export function normalizeMcpConfig(config: Partial<McpServerConfig>): McpStdioConfig | null {
  if ('url' in config && typeof config.url === 'string' && config.url.length > 0) {
    return {
      type: config.type === 'sse' ? 'sse' : 'http',
      url: config.url,
      headers:
        config.headers && Object.keys(config.headers).length > 0 ? config.headers : undefined,
      bearerTokenEnvVar: config.bearerTokenEnvVar,
      envHttpHeaders:
        config.envHttpHeaders && Object.keys(config.envHttpHeaders).length > 0
          ? config.envHttpHeaders
          : undefined,
    }
  }
  if (!('command' in config) || !config.command) return null
  return {
    type: config.type === 'stdio' ? 'stdio' : undefined,
    command: config.command,
    args: Array.isArray(config.args) ? config.args : undefined,
    env: config.env && Object.keys(config.env).length > 0 ? config.env : undefined,
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
