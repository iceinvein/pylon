/**
 * Diff chunker module — parses unified diffs, classifies files by review priority,
 * and splits large diffs into token-budget-friendly chunks.
 */

export type FileTier = 'critical' | 'important' | 'low' | 'skip'

export const PROMPT_OVERHEAD_TOKENS = 7_000

export const MODEL_TOKEN_LIMITS: Record<string, number> = {
  'claude-sonnet-4-20250514': 200_000,
  'claude-opus-4-20250514': 200_000,
  'claude-haiku-3-20250307': 200_000,
  default: 180_000,
}

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
  /^package-lock\.json$/,
  /^yarn\.lock$/,
  /^bun\.lockb$/,
  /^pnpm-lock\.yaml$/,
  /\.min\./,
  /\.map$/,
  /\.snap$/,
  /(^|\/)generated\//,
  /^coverage\//,
  /^dist\//,
  /^node_modules\//,
]

const TEST_PATTERNS = [
  /\.test\./,
  /\.spec\./,
  /(^|\/)__tests__\//,
]

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.kt', '.kts',
  '.c', '.cpp', '.cc', '.h', '.hpp',
  '.cs', '.rb', '.swift', '.scala',
  '.vue', '.svelte', '.astro',
])

const IMPORTANT_EXTENSIONS = new Set([
  '.yaml', '.yml', '.toml', '.sql', '.sh', '.bash',
  '.json', '.jsonc',
])

const IMPORTANT_FILENAMES = new Set([
  'Dockerfile', 'Makefile', 'Procfile',
  'docker-compose.yml', 'docker-compose.yaml',
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

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

// ── Budget ───────────────────────────────────────────────────────────

export function getTokenBudget(model?: string): number {
  const limit = (model ? MODEL_TOKEN_LIMITS[model] : undefined) ?? MODEL_TOKEN_LIMITS.default
  return limit - PROMPT_OVERHEAD_TOKENS
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

  // Bin-pack into chunks
  const chunks: { files: string[]; diffs: string[] }[] = []
  let currentChunk: { files: string[]; diffs: string[]; tokens: number } = {
    files: [],
    diffs: [],
    tokens: 0,
  }

  for (const file of sorted) {
    const fileTokens = estimateTokens(file.diff)

    // If file alone exceeds budget, give it its own chunk
    if (fileTokens > tokenBudget) {
      if (currentChunk.files.length > 0) {
        chunks.push({ files: currentChunk.files, diffs: currentChunk.diffs })
      }
      chunks.push({ files: [file.path], diffs: [file.diff] })
      currentChunk = { files: [], diffs: [], tokens: 0 }
      continue
    }

    // If adding this file would exceed budget, finalize current chunk
    if (currentChunk.tokens + fileTokens > tokenBudget && currentChunk.files.length > 0) {
      chunks.push({ files: currentChunk.files, diffs: currentChunk.diffs })
      currentChunk = { files: [], diffs: [], tokens: 0 }
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
