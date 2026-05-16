/**
 * Provider-neutral AI prompt helpers for the AST visualizer.
 *
 * Callers provide a text query function; this module owns only prompts,
 * response cleanup, and fallback behavior.
 */
import { readFileSync } from 'node:fs'
import { log } from '../shared/logger'
import type { ArchAnalysis, RepoGraph } from '../shared/types'

const logger = log.child('ast-ai')

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
    lines.push(`${shortPath} (${file.size}B) - ${decls || 'no declarations'}`)
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

function parseJsonFromProviderText<T>(raw: string): T {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (fenced) return JSON.parse(fenced[1]) as T

  try {
    return JSON.parse(trimmed) as T
  } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start === -1 || end <= start) throw new Error('No JSON object found in provider response')
    return JSON.parse(trimmed.slice(start, end + 1)) as T
  }
}

// ── 1. Analyze repo with AI ──

export async function analyzeRepoWithAi(
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
    return parseJsonFromProviderText<ArchAnalysis>(raw)
  } catch (err) {
    logger.error('Failed to parse AI architecture analysis:', err)
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

  // Truncate large files to first 500 lines to stay within limits.
  const lines = source.split('\n')
  const truncated =
    lines.length > 500 ? `${lines.slice(0, 500).join('\n')}\n... (truncated)` : source

  const system = `You are a code explainer. Given a source file and a symbol name, explain what the symbol does in under 200 words. Be concise and technical. Do not use markdown headers.`

  const prompt = `File: ${filePath}\nSymbol: ${nodeName}\nContext: ${context}\n\nSource:\n${truncated}`

  try {
    return await queryFn(system, prompt)
  } catch (err) {
    logger.error('Failed to get AI explanation:', err)
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

    // Parse out highlights.
    const highlightMatch = raw.match(/<!--\s*highlights:\s*(\[.*?\])\s*-->/)
    let highlights: Array<{ filePath: string; symbolName: string }> = []
    let text = raw

    if (highlightMatch) {
      try {
        highlights = JSON.parse(highlightMatch[1])
      } catch {
        // Ignore malformed highlights.
      }
      text = raw.replace(/<!--\s*highlights:\s*\[.*?\]\s*-->/, '').trim()
    }

    return { text, highlights }
  } catch (err) {
    logger.error('Failed to get AI chat response:', err)
    return { text: 'Unable to generate a response at this time.', highlights: [] }
  }
}
