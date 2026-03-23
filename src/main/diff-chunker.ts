/**
 * Diff chunker module — parses unified diffs, classifies files by review priority,
 * and splits large diffs into token-budget-friendly chunks.
 */
import { KNOWN_CONTEXT_WINDOWS, resolveContextWindow } from '../shared/model-context'

export type FileTier = 'critical' | 'important' | 'low' | 'skip'

/**
 * Token overhead breakdown:
 * - SDK system prompt + tool definitions: ~35-45k tokens
 * - CLAUDE.md / project instructions: ~2-5k tokens
 * - Our review prompt template (specialist instructions + PR metadata + output format): ~8-12k tokens
 *   (specialist prompts are 60-80 lines each, plus PR info, file list, and output format)
 * - Response budget (agent's output): ~8-10k tokens
 * Total conservative estimate: ~80k tokens of non-diff overhead
 *
 * Being aggressive here is safer — a too-small budget just means more chunks,
 * while a too-large budget causes prompt-too-long crashes.
 */
export const PROMPT_OVERHEAD_TOKENS = 80_000

/** @deprecated Use KNOWN_CONTEXT_WINDOWS from shared/model-context instead */
export const MODEL_TOKEN_LIMITS: Record<string, number> = {
  ...KNOWN_CONTEXT_WINDOWS,
  default: 200_000,
}

/**
 * In multi-chunk reviews, each subsequent chunk adds to the conversation history:
 * the prior chunk's prompt + response accumulate (~15-25k tokens per chunk).
 * This constant estimates how much budget is lost per additional chunk.
 */
export const PER_CHUNK_CONVERSATION_OVERHEAD = 20_000

type FileSegment = { path: string; diff: string }

type Chunk = {
  files: string[]
  diff: string
  index: number
  total: number
}

export type ChunkResult = {
  chunks: Chunk[]
  skippedFiles: string[]
}

// ── Parsing ──────────────────────────────────────────────────────────

const DIFF_HEADER_RE = /^diff --git a\/(.+?) b\/(.+)$/

export function parseDiffIntoFiles(diff: string): FileSegment[] {
  if (!diff.trim()) return []

  const lines = diff.split('\n')
  const segments: FileSegment[] = []
  let current: { path: string; startIdx: number } | null = null

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(DIFF_HEADER_RE)
    if (match) {
      if (current) {
        segments.push({
          path: current.path,
          diff: lines.slice(current.startIdx, i).join('\n'),
        })
      }
      current = { path: match[2], startIdx: i }
    }
  }

  if (current) {
    segments.push({
      path: current.path,
      diff: lines.slice(current.startIdx).join('\n'),
    })
  }

  return segments
}

// ── Classification ───────────────────────────────────────────────────

const SKIP_PATTERNS = [
  // ── Lockfiles (every major ecosystem) ──
  /(^|\/)package-lock\.json$/,
  /(^|\/)yarn\.lock$/,
  /(^|\/)bun\.lockb$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)Cargo\.lock$/,
  /(^|\/)Gemfile\.lock$/,
  /(^|\/)poetry\.lock$/,
  /(^|\/)Pipfile\.lock$/,
  /(^|\/)composer\.lock$/,
  /(^|\/)go\.sum$/,
  /(^|\/)flake\.lock$/,
  /(^|\/)pubspec\.lock$/,
  /(^|\/)Podfile\.lock$/,
  /(^|\/)mix\.lock$/,
  /(^|\/)packages\.lock\.json$/,
  /(^|\/)paket\.lock$/,
  /(^|\/)shrinkwrap\.yaml$/,
  // ── Minified / bundled / sourcemaps ──
  /\.min\./,
  /\.map$/,
  /\.bundle\.\w+$/,
  // ── ORM migrations / snapshots ──
  /(^|\/)drizzle\/meta\//, // Drizzle ORM snapshot metadata
  /(^|\/)drizzle\/.*\.sql$/, // Drizzle SQL migration files
  /\.snapshot\.json$/, // Drizzle snapshot JSON files
  /(^|\/)migrations?\//, // Generic migration directories
  /(^|\/)prisma\/migrations\//, // Prisma migration files
  // ── Test snapshots ──
  /\.snap$/,
  /\.snapshot$/,
  // ── Generated / build output ──
  /(^|\/)generated\//,
  /(^|\/)__generated__\//,
  /(^|\/)\.next\//,
  /(^|\/)\.nuxt\//,
  /(^|\/)coverage\//,
  /(^|\/)dist\//,
  /(^|\/)build\//,
  /(^|\/)out\//,
  /(^|\/)target\//,
  /(^|\/)node_modules\//,
  // ── Documentation / prose ──
  /\.md$/,
  /\.mdx$/,
  /\.txt$/,
  /\.rst$/,
  /\.adoc$/,
  /(^|\/)LICENSE(\..*)?$/,
  /(^|\/)LICENCE(\..*)?$/,
  /(^|\/)COPYING(\..*)?$/,
  /(^|\/)CHANGELOG(\..*)?$/,
  /(^|\/)CHANGES(\..*)?$/,
  // ── Database snapshots ──
  /\.sqlite3?$/,
  /\.db$/,
  /\.db-(journal|wal|shm)$/,
  /\.lmdb$/,
  /\.mdb$/,
  // ── Data / log files ──
  /\.csv$/,
  /\.tsv$/,
  /\.log$/,
  /\.ndjson$/,
  // ── Binary / asset files ──
  /\.woff2?$/,
  /\.ttf$/,
  /\.eot$/,
  /\.ico$/,
  /\.png$/,
  /\.jpe?g$/,
  /\.gif$/,
  /\.webp$/,
  /\.svg$/,
  /\.pdf$/,
  /\.zip$/,
  /\.tar/,
  /\.wasm$/,
  /\.mp[34]$/,
  /\.webm$/,
  /\.ogg$/,
  /\.mov$/,
  /\.avi$/,
]

const TEST_PATTERNS = [/\.test\./, /\.spec\./, /(^|\/)__tests__\//]

const SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.kts',
  '.c',
  '.cpp',
  '.cc',
  '.h',
  '.hpp',
  '.cs',
  '.rb',
  '.swift',
  '.scala',
  '.vue',
  '.svelte',
  '.astro',
])

const IMPORTANT_EXTENSIONS = new Set([
  '.yaml',
  '.yml',
  '.toml',
  '.sql',
  '.sh',
  '.bash',
  '.json',
  '.jsonc',
])

const IMPORTANT_FILENAMES = new Set([
  'Dockerfile',
  'Makefile',
  'Procfile',
  'docker-compose.yml',
  'docker-compose.yaml',
])

export function classifyFile(path: string): FileTier {
  // Skip check first
  for (const pattern of SKIP_PATTERNS) {
    if (pattern.test(path)) return 'skip'
  }

  // Test files → low (check before source so .test.ts doesn't become critical)
  for (const pattern of TEST_PATTERNS) {
    if (pattern.test(path)) return 'low'
  }

  const basename = path.split('/').pop() ?? path
  const ext = getExtension(basename)

  // Source code → critical
  if (SOURCE_EXTENSIONS.has(ext)) return 'critical'

  // Config files → important
  if (IMPORTANT_FILENAMES.has(basename)) return 'important'
  if (IMPORTANT_EXTENSIONS.has(ext)) return 'important'
  if (basename.startsWith('.env.')) return 'important'

  // Everything else → low
  return 'low'
}

function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  if (lastDot <= 0) return ''
  return filename.slice(lastDot)
}

// ── Token estimation ─────────────────────────────────────────────────

/**
 * Conservative token estimation.
 * Standard English text averages ~4 chars/token, but diffs contain many
 * short tokens (symbols like +, -, @, paths, punctuation) that tokenize
 * less efficiently. Using 3.3 chars/token provides a safety margin.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.3)
}

// ── Budget ───────────────────────────────────────────────────────────

/**
 * Returns available token budget for diff content.
 * @param model - Model name for context limit lookup
 * @param chunkIndex - 0-indexed chunk number; later chunks have smaller budgets
 *                     because the conversation history grows with each chunk
 * @param contextWindowOverride - SDK-reported context window size; combined with
 *                                known limits via resolveContextWindow()
 */
export function getTokenBudget(
  model?: string,
  chunkIndex = 0,
  contextWindowOverride?: number,
): number {
  const limit = model
    ? resolveContextWindow(model, contextWindowOverride ?? undefined)
    : (contextWindowOverride ?? MODEL_TOKEN_LIMITS.default)
  const conversationGrowth = chunkIndex * PER_CHUNK_CONVERSATION_OVERHEAD
  return Math.max(10_000, limit - PROMPT_OVERHEAD_TOKENS - conversationGrowth)
}

// ── Sorting ──────────────────────────────────────────────────────────

const TIER_ORDER: Record<FileTier, number> = {
  critical: 0,
  important: 1,
  low: 2,
  skip: 3,
}

function getDirectory(path: string): string {
  const lastSlash = path.lastIndexOf('/')
  return lastSlash >= 0 ? path.slice(0, lastSlash) : ''
}

function sortFiles(files: FileSegment[]): FileSegment[] {
  return [...files].sort((a, b) => {
    const tierA = TIER_ORDER[classifyFile(a.path)]
    const tierB = TIER_ORDER[classifyFile(b.path)]
    if (tierA !== tierB) return tierA - tierB

    const dirA = getDirectory(a.path)
    const dirB = getDirectory(b.path)
    if (dirA !== dirB) return dirA.localeCompare(dirB)

    return a.path.localeCompare(b.path)
  })
}

// ── Chunking ─────────────────────────────────────────────────────────

export function chunkDiff(diff: string, options: { tokenBudget: number }): ChunkResult {
  const { tokenBudget } = options
  const allFiles = parseDiffIntoFiles(diff)

  const skippedFiles: string[] = []
  const reviewFiles: FileSegment[] = []

  for (const file of allFiles) {
    if (classifyFile(file.path) === 'skip') {
      skippedFiles.push(file.path)
    } else {
      reviewFiles.push(file)
    }
  }

  if (reviewFiles.length === 0) {
    return { chunks: [], skippedFiles }
  }

  const sorted = sortFiles(reviewFiles)

  // Fast path: everything fits in one chunk
  const totalDiff = sorted.map((f) => f.diff).join('\n')
  if (estimateTokens(totalDiff) <= tokenBudget) {
    return {
      chunks: [
        {
          files: sorted.map((f) => f.path),
          diff: totalDiff,
          index: 0,
          total: 1,
        },
      ],
      skippedFiles,
    }
  }

  // Bin-pack into chunks with progressive budget reduction.
  // Each subsequent chunk gets a smaller budget because conversation history
  // from prior chunks accumulates in the same session.
  const chunks: { files: string[]; diffs: string[] }[] = []
  let currentChunk: { files: string[]; diffs: string[]; tokens: number } = {
    files: [],
    diffs: [],
    tokens: 0,
  }

  /** Budget for the current chunk, shrinks as more chunks are created */
  let currentBudget = tokenBudget

  for (const file of sorted) {
    const fileTokens = estimateTokens(file.diff)

    // If file alone exceeds budget, give it its own chunk
    if (fileTokens > currentBudget) {
      if (currentChunk.files.length > 0) {
        chunks.push({ files: currentChunk.files, diffs: currentChunk.diffs })
        currentBudget = Math.max(
          10_000,
          tokenBudget - chunks.length * PER_CHUNK_CONVERSATION_OVERHEAD,
        )
      }
      chunks.push({ files: [file.path], diffs: [file.diff] })
      currentChunk = { files: [], diffs: [], tokens: 0 }
      currentBudget = Math.max(
        10_000,
        tokenBudget - chunks.length * PER_CHUNK_CONVERSATION_OVERHEAD,
      )
      continue
    }

    // If adding this file would exceed budget, finalize current chunk
    if (currentChunk.tokens + fileTokens > currentBudget && currentChunk.files.length > 0) {
      chunks.push({ files: currentChunk.files, diffs: currentChunk.diffs })
      currentChunk = { files: [], diffs: [], tokens: 0 }
      // Reduce budget for the next chunk
      currentBudget = Math.max(
        10_000,
        tokenBudget - chunks.length * PER_CHUNK_CONVERSATION_OVERHEAD,
      )
    }

    currentChunk.files.push(file.path)
    currentChunk.diffs.push(file.diff)
    currentChunk.tokens += fileTokens
  }

  if (currentChunk.files.length > 0) {
    chunks.push({ files: currentChunk.files, diffs: currentChunk.diffs })
  }

  const total = chunks.length
  return {
    chunks: chunks.map((c, i) => ({
      files: c.files,
      diff: c.diffs.join('\n'),
      index: i,
      total,
    })),
    skippedFiles,
  }
}
