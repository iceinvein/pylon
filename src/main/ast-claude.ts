/**
 * Claude integration for AST Visualizer.
 *
 * Uses the `claude` CLI with `--print` for one-shot queries rather than
 * managing full Agent SDK sessions. Each function accepts a generic `queryFn`
 * so callers can swap in a different backend if needed.
 */
import { readFileSync } from 'node:fs'
import { log } from '../shared/logger'
import type { ArchAnalysis, RepoGraph } from '../shared/types'
import { resolveClaudeCodeExecutablePath } from './claude-code-executable'

const logger = log.child('ast-claude')

export type QueryFn = (system: string, prompt: string) => Promise<string>

// ── Graph summary builder ──

function buildGraphSummary(graph: RepoGraph): string {
  const lines: string[] = []
  lines.push(`Files: ${graph.files.length}`)
  lines.push(`Edges: ${graph.edges.length}`)
  lines.push('')

  for (const file of graph.files.slice(0, 80)) {
    const decls = file.declarations.map((d) => `${d.type}:${d.name}`).join(', ')
    const shortPath = file.filePath.replace(/^.*?\/src\//, 'src/')
    lines.push(`${shortPath} (${file.size}B) — ${decls || 'no declarations'}`)
  }

  if (graph.files.length > 80) {
    lines.push(`... and ${graph.files.length - 80} more files`)
  }

  lines.push('')
  lines.push('Import edges:')
  for (const edge of graph.edges.slice(0, 100)) {
    const src = edge.source.replace(/^.*?\/src\//, 'src/')
    const tgt = edge.target.replace(/^.*?\/src\//, 'src/')
    lines.push(`  ${src} -> ${tgt} [${edge.specifiers.join(', ')}]`)
  }

  if (graph.edges.length > 100) {
    lines.push(`  ... and ${graph.edges.length - 100} more edges`)
  }

  return lines.join('\n')
}

// ── 1. Analyze repo with Claude ──

export async function analyzeRepoWithClaude(
  graph: RepoGraph,
  queryFn: QueryFn,
): Promise<ArchAnalysis | null> {
  const summary = buildGraphSummary(graph)

  const system = `You are a software architecture analyzer. Given a codebase summary (file paths, sizes, declarations, import edges), produce a JSON object describing the architecture.

The JSON must conform to this TypeScript type:

type ArchAnalysis = {
  layers: Array<{ id: string; name: string; color: string; pattern: string }>
  clusters: Array<{ id: string; name: string; description: string; files: string[]; layerId: string }>
  annotations: Record<string, string>
  callEdges: Array<{ caller: { filePath: string; symbolName: string }; callee: { filePath: string; symbolName: string } }>
  dataFlows: Array<{ id: string; name: string; description: string; steps: Array<{ filePath: string; symbolName: string; direction: 'in' | 'out' | 'transform' }> }>
}

Rules:
- layers: Identify 2-5 architectural layers (e.g., "UI", "State", "Data", "Shared"). Use hex colors.
- clusters: Group related files into logical modules. Each cluster belongs to a layer.
- annotations: Brief description for key files (filePath -> description).
- callEdges: Notable cross-module call relationships (keep under 20).
- dataFlows: 1-3 major data flows through the system.
- Use the FULL file paths from the summary (starting with src/).
- Return ONLY valid JSON, no markdown fences, no explanation.`

  const prompt = `Analyze this codebase:\n\n${summary}`

  try {
    const raw = await queryFn(system, prompt)
    // Strip markdown fences if present
    const cleaned = raw.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '')
    const parsed = JSON.parse(cleaned) as ArchAnalysis
    return parsed
  } catch (err) {
    logger.error('Failed to parse Claude arch analysis:', err)
    return null
  }
}

// ── 2. Explain a node ──

export async function explainNode(
  filePath: string,
  nodeName: string,
  context: string,
  queryFn: QueryFn,
): Promise<string> {
  let source = ''
  try {
    source = readFileSync(filePath, 'utf-8')
  } catch {
    source = '(file not readable)'
  }

  // Truncate large files to first 500 lines to stay within limits
  const lines = source.split('\n')
  const truncated =
    lines.length > 500 ? `${lines.slice(0, 500).join('\n')}\n... (truncated)` : source

  const system = `You are a code explainer. Given a source file and a symbol name, explain what the symbol does in under 200 words. Be concise and technical. Do not use markdown headers.`

  const prompt = `File: ${filePath}\nSymbol: ${nodeName}\nContext: ${context}\n\nSource:\n${truncated}`

  try {
    return await queryFn(system, prompt)
  } catch (err) {
    logger.error('Failed to get Claude explanation:', err)
    return 'Unable to generate explanation at this time.'
  }
}

// ── 3. Chat about code ──

export async function chatAboutCode(
  message: string,
  graphSummary: string,
  queryFn: QueryFn,
): Promise<{ text: string; highlights: Array<{ filePath: string; symbolName: string }> }> {
  const system = `You are a codebase expert assistant. Answer questions about the codebase based on the provided summary.

At the end of your response, if there are specific files or symbols relevant to your answer, include a comment line like:
<!-- highlights: [{"filePath":"src/foo.ts","symbolName":"bar"}] -->

Rules:
- Be concise but thorough
- Reference specific files and symbols when relevant
- The highlights comment must be valid JSON array on a single line
- If no specific highlights, omit the comment entirely`

  const prompt = `Codebase summary:\n${graphSummary}\n\nQuestion: ${message}`

  try {
    const raw = await queryFn(system, prompt)

    // Parse out highlights
    const highlightMatch = raw.match(/<!--\s*highlights:\s*(\[.*?\])\s*-->/)
    let highlights: Array<{ filePath: string; symbolName: string }> = []
    let text = raw

    if (highlightMatch) {
      try {
        highlights = JSON.parse(highlightMatch[1])
      } catch {
        // ignore malformed highlights
      }
      text = raw.replace(/<!--\s*highlights:\s*\[.*?\]\s*-->/, '').trim()
    }

    return { text, highlights }
  } catch (err) {
    logger.error('Failed to get Claude chat response:', err)
    return { text: 'Unable to generate a response at this time.', highlights: [] }
  }
}

// ── Query function factory ──

/**
 * Creates a queryFn that shells out to the `claude` CLI with `--print`.
 * This avoids the complexity of managing Agent SDK sessions for one-shot queries.
 */
export function createCliQueryFn(claudePath: string): QueryFn {
  const { execFile } = require('node:child_process')
  const { promisify } = require('node:util')
  const execFileAsync = promisify(execFile)

  return async (system: string, prompt: string): Promise<string> => {
    try {
      const { stdout } = await execFileAsync(
        claudePath,
        ['--print', '--output-format', 'text', '-p', prompt],
        {
          timeout: 120_000,
          maxBuffer: 1024 * 1024 * 5,
          env: {
            ...process.env,
            CLAUDE_SYSTEM_PROMPT: system,
          },
        },
      )
      return (stdout as string).trim()
    } catch (err) {
      logger.error('Claude CLI query failed:', err)
      throw err
    }
  }
}

/**
 * Resolves the path to the `claude` CLI binary.
 * Checks common locations and the system PATH.
 */
export function resolveClaudePath(): string | null {
  return resolveClaudeCodeExecutablePath()
}
