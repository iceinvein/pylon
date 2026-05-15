import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { log } from '../shared/logger'

const logger = log.child('claude-code-executable')

let loggedMissingPath = false
let cachedResolvedPath: string | null | undefined

function isCmuxClaudeWrapper(path: string): boolean {
  return path.includes('/cmux.app/') && path.endsWith('/claude')
}

/**
 * Probe a candidate `claude` executable to confirm the SDK will accept it.
 * The native installer rejects stale npm/JS wrappers at session creation time
 * with `ReferenceError: Claude Code native binary not found at <path>`, so we
 * filter those out at resolve time instead. A short `--version` invocation is
 * enough: the native binary and supported wrappers respond, broken installs do
 * not.
 */
function isUsableClaudeExecutable(path: string): boolean {
  try {
    const output = execFileSync(path, ['--version'], {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return /\d+\.\d+/.test(output)
  } catch (err) {
    logger.warn(`Claude candidate at ${path} failed --version probe: ${String(err)}`)
    return false
  }
}

function logResolvedPath(path: string, source: string): string {
  logger.info(`Using installed Claude Code CLI (${source}): ${path}`)
  return path
}

function resolveClaudeCodeExecutablePathUncached(): string | null {
  // Order matters: native installer locations first, then PATH lookup. The
  // legacy `~/.local/bin/claude` slot is kept for users on the official native
  // installer, but it sits below Homebrew/Applications because stale wrappers
  // from older install flows commonly linger there.
  const candidates = [
    '/Applications/Claude.app/Contents/Resources/app/bin/claude',
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
    `${homedir()}/.local/bin/claude`,
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate) && isUsableClaudeExecutable(candidate)) {
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

    const ordered = [
      ...results.filter((path) => !isCmuxClaudeWrapper(path)),
      ...results.filter((path) => isCmuxClaudeWrapper(path)),
    ]

    for (const candidate of ordered) {
      if (isUsableClaudeExecutable(candidate)) {
        const source = isCmuxClaudeWrapper(candidate) ? 'PATH (cmux wrapper)' : 'PATH'
        return logResolvedPath(candidate, source)
      }
    }
  } catch {
    // not found on PATH
  }

  return null
}

export function resolveClaudeCodeExecutablePath(): string | null {
  if (cachedResolvedPath !== undefined) return cachedResolvedPath
  const resolved = resolveClaudeCodeExecutablePathUncached()
  cachedResolvedPath = resolved
  if (!resolved && !loggedMissingPath) {
    logger.warn('Claude Code CLI not found on this machine')
    loggedMissingPath = true
  }
  return resolved
}

/**
 * Reset the cached resolution. Intended for tests and for callers that need to
 * re-probe after an installation change. Not exposed via IPC; the resolver is
 * effectively static per session.
 */
export function resetClaudeCodeExecutablePathCache(): void {
  cachedResolvedPath = undefined
  loggedMissingPath = false
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
