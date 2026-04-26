import type { ReviewFinding } from '../shared/types'

const SEVERITY_RANK: Record<string, number> = {
  blocker: 0,
  high: 1,
  medium: 2,
  low: 3,
}

// Conservative title-token clustering: prefer keeping distinct findings over silently merging them.
const SIMILARITY_THRESHOLD = 0.5
const MIN_TOKEN_OVERLAP = 2

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'of',
  'on',
  'in',
  'to',
  'for',
  'with',
  'at',
  'by',
  'from',
  'into',
  'about',
  'as',
  'this',
  'that',
  'these',
  'those',
  'it',
  'its',
  'their',
  'there',
  'here',
  'and',
  'or',
  'but',
  'if',
  'then',
  'than',
  'so',
  'not',
  'no',
  'has',
  'have',
  'had',
  'do',
  'does',
  'did',
  'can',
  'could',
  'should',
  'would',
  'will',
  'may',
  'might',
  'when',
  'where',
  'what',
  'which',
  'who',
  'how',
  'why',
  'use',
  'used',
  'using',
  'make',
  'makes',
  'making',
])

export function tokenize(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
  return new Set(tokens)
}

export function diceCoefficient(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1
  if (a.size === 0 || b.size === 0) return 0
  let intersect = 0
  for (const t of a) if (b.has(t)) intersect++
  return (2 * intersect) / (a.size + b.size)
}

function intersectionSize(a: Set<string>, b: Set<string>): number {
  let n = 0
  for (const t of a) if (b.has(t)) n++
  return n
}

function clusterByTitleSimilarity(group: ReviewFinding[]): number[][] {
  const tokens = group.map((f) => tokenize(f.title))
  const clusters: number[][] = []
  const assigned = new Array<number>(group.length).fill(-1)

  for (let i = 0; i < group.length; i++) {
    if (assigned[i] !== -1) continue
    const idx = clusters.length
    const cluster = [i]
    assigned[i] = idx
    for (let j = i + 1; j < group.length; j++) {
      if (assigned[j] !== -1) continue
      if (
        diceCoefficient(tokens[i], tokens[j]) >= SIMILARITY_THRESHOLD &&
        intersectionSize(tokens[i], tokens[j]) >= MIN_TOKEN_OVERLAP
      ) {
        cluster.push(j)
        assigned[j] = idx
      }
    }
    clusters.push(cluster)
  }
  return clusters
}

function mergeCluster(group: ReviewFinding[], indices: number[]): ReviewFinding {
  if (indices.length === 1) return group[indices[0]]

  const sorted = [...indices].sort(
    (a, b) => (SEVERITY_RANK[group[a].severity] ?? 99) - (SEVERITY_RANK[group[b].severity] ?? 99),
  )
  const primary = group[sorted[0]]
  const others = sorted.slice(1).map((i) => group[i])

  const mergedFrom = others
    .filter((o) => o.domain !== primary.domain)
    .map((o) => ({ domain: o.domain ?? 'unknown', title: o.title }))

  return {
    ...primary,
    suggestion: primary.suggestion ?? others.find((o) => o.suggestion !== undefined)?.suggestion,
    description:
      primary.description +
      (mergedFrom.length > 0
        ? `\n\n_Also flagged by: ${mergedFrom.map((m) => m.domain).join(', ')}_`
        : ''),
    mergedFrom: mergedFrom.length > 0 ? mergedFrom : undefined,
  }
}

export function deduplicateFindings(findings: ReviewFinding[]): ReviewFinding[] {
  const groups = new Map<string, ReviewFinding[]>()
  for (const f of findings) {
    const key = `${f.file}:${f.line ?? 'null'}`
    const list = groups.get(key)
    if (list) list.push(f)
    else groups.set(key, [f])
  }

  const result: ReviewFinding[] = []
  for (const group of groups.values()) {
    if (group.length === 1) {
      result.push(group[0])
      continue
    }
    const clusters = clusterByTitleSimilarity(group)
    for (const indices of clusters) {
      result.push(mergeCluster(group, indices))
    }
  }
  return result
}
