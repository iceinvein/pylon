import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { log } from '../shared/logger'

const logger = log.child('claude-code-executable')

let loggedResolvedPath = false
let loggedMissingPath = false

function isCmuxClaudeWrapper(path: string): boolean {
  return path.includes('/cmux.app/') && path.endsWith('/claude')
}

function logResolvedPath(path: string, source: string): string {
  if (!loggedResolvedPath) {
    logger.info(`Using installed Claude Code CLI (${source}): ${path}`)
    loggedResolvedPath = true
  }
  return path
}

export function resolveClaudeCodeExecutablePath(): string | null {
  const candidates = [
    '/Applications/Claude.app/Contents/Resources/app/bin/claude',
    `${homedir()}/.local/bin/claude`,
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return logResolvedPath(candidate, 'candidate')
    }
  }

  try {
    const results = execFileSync('which', ['-a', 'claude'], {
      encoding: 'utf-8',
      timeout: 5000,
    })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    const preferred = results.find((path) => !isCmuxClaudeWrapper(path))
    if (preferred) {
      return logResolvedPath(preferred, 'PATH')
    }

    const fallback = results[0]
    if (fallback) {
      if (!loggedResolvedPath) {
        logger.info(`Using Claude Code CLI wrapper from PATH: ${fallback}`)
        loggedResolvedPath = true
      }
      return fallback
    }
  } catch {
    // not found on PATH
  }

  if (!loggedMissingPath) {
    logger.warn('Claude Code CLI not found on this machine')
    loggedMissingPath = true
  }

  return null
}

export function getClaudeCodeSdkRuntimeOptions(): Record<string, unknown> {
  const pathToClaudeCodeExecutable = resolveClaudeCodeExecutablePath()
  if (!pathToClaudeCodeExecutable) {
    throw new Error(
      'Claude Code CLI not found. Install Claude Code and ensure the `claude` command is available on your PATH.',
    )
  }

  return {
    pathToClaudeCodeExecutable,
  }
}
