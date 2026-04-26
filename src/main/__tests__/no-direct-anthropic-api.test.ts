import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

// All Claude calls in this app must go through the Agent SDK provider
// (src/main/providers/claude-provider.ts), which inherits the user's existing
// auth (Claude Code subscription / Claude Pro / Max). Direct REST calls and
// raw API key reads are forbidden — they bypass the SDK and break for users
// who never set ANTHROPIC_API_KEY.
//
// For one-shot LLM calls outside an active session, use
// sessionManager.sendGitAiQuery(sessionId, prompt, systemPrompt).

const FORBIDDEN_TOKENS = [
  'ANTHROPIC_API_KEY',
  'api.anthropic.com',
  'anthropic-version',
  'x-api-key',
  '@anthropic-ai/sdk',
] as const

const SRC_ROOT = join(import.meta.dir, '..', '..')
const SELF_PATH = import.meta.path

describe('no direct Anthropic API access in src/', () => {
  test('forbidden tokens do not appear in source files', async () => {
    const glob = new Bun.Glob('**/*.{ts,tsx}')
    const violations: { file: string; line: number; token: string; text: string }[] = []

    for await (const filePath of glob.scan({ cwd: SRC_ROOT, absolute: true })) {
      if (filePath === SELF_PATH) continue

      const contents = await readFile(filePath, 'utf8')
      const lines = contents.split('\n')
      for (let i = 0; i < lines.length; i++) {
        for (const token of FORBIDDEN_TOKENS) {
          if (lines[i].includes(token)) {
            violations.push({
              file: relative(SRC_ROOT, filePath),
              line: i + 1,
              token,
              text: lines[i].trim().slice(0, 120),
            })
          }
        }
      }
    }

    if (violations.length > 0) {
      const formatted = violations
        .map((v) => `  ${v.file}:${v.line}  [${v.token}]  ${v.text}`)
        .join('\n')
      throw new Error(
        `Found direct Anthropic API access in src/ (${violations.length} violation${
          violations.length === 1 ? '' : 's'
        }):\n${formatted}\n\n` +
          `All Claude calls must go through the Agent SDK via ` +
          `src/main/providers/claude-provider.ts, which uses the user's existing auth. ` +
          `For one-shot LLM calls, use ` +
          `sessionManager.sendGitAiQuery(sessionId, prompt, systemPrompt).`,
      )
    }
    expect(violations.length).toBe(0)
  })
})
