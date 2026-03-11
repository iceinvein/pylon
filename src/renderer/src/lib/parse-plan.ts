import type { PlanSection } from '../../../shared/types'

/**
 * Check if a file path matches plan/design patterns.
 * Patterns: docs/plans/*.md, docs/superpowers/plans/*.md,
 * docs/superpowers/specs/*.md, *-plan.md, *-design.md
 */
export function isPlanPath(filePath: string): boolean {
  const p = filePath.toLowerCase()
  const isInPlansDir = p.includes('/plans/') || p.includes('/specs/')
  const hasPlanSuffix = p.endsWith('-plan.md') || p.endsWith('-design.md')
  return (isInPlansDir || hasPlanSuffix) && p.endsWith('.md')
}

/**
 * Extract a display-friendly relative path from an absolute file path.
 * Tries to find the project-relative portion (from docs/ or src/ onward).
 */
export function toRelativePath(filePath: string): string {
  const docsIdx = filePath.indexOf('docs/')
  if (docsIdx !== -1) return filePath.slice(docsIdx)
  // Fallback: last two path segments
  return filePath.split('/').slice(-2).join('/')
}

/**
 * Parse a plan markdown file into reviewable sections.
 *
 * Rules:
 * 1. H2 (##) headings become top-level sections
 * 2. H3 (###) or "Task N"/"Step N" headings become children
 * 3. Content between headings is the section body
 * 4. Skip frontmatter and the first H1 (document title)
 * 5. If no H3s exist under an H2, the H2 is a leaf section
 */
export function parsePlanSections(markdown: string): PlanSection[] {
  const lines = markdown.split('\n')
  const sections: PlanSection[] = []
  let current: PlanSection | null = null
  let currentChild: PlanSection | null = null
  let bodyLines: string[] = []
  let skipH1 = true
  let inFrontmatter = false
  let seenFrontmatterStart = false
  // Track whether we've seen any non-blank content. YAML frontmatter
  // only appears at the very start of a file — a `---` after real content
  // is just a markdown horizontal rule, not a frontmatter delimiter.
  let seenContent = false

  function flushBody() {
    const text = bodyLines.join('\n').trim()
    if (currentChild) {
      currentChild.body = text
    } else if (current) {
      current.body = text
    }
    bodyLines = []
  }

  for (const line of lines) {
    // Track YAML frontmatter block (delimited by two --- lines at file start)
    if (line.startsWith('---') && !seenContent) {
      if (!seenFrontmatterStart) {
        seenFrontmatterStart = true
        inFrontmatter = true
        continue
      } else if (inFrontmatter) {
        inFrontmatter = false
        continue
      }
    }
    if (inFrontmatter) continue

    // Any non-blank line after frontmatter means subsequent --- are horizontal rules
    if (line.trim() !== '') seenContent = true

    // H1 — skip the document title (first H1 only)
    if (line.startsWith('# ') && !line.startsWith('## ')) {
      if (skipH1) {
        skipH1 = false
        continue
      }
      // Subsequent H1s are unusual — treat as content
      bodyLines.push(line)
      continue
    }

    // H2 — new top-level section
    if (line.startsWith('## ')) {
      flushBody()
      if (currentChild && current) {
        if (!current.children) current.children = []
        current.children.push(currentChild)
        currentChild = null
      }
      if (current) sections.push(current)
      current = { level: 2, title: line.replace(/^##\s+/, ''), body: '', children: undefined }
      bodyLines = []
      continue
    }

    // H3 — child section under current H2
    if (line.startsWith('### ')) {
      flushBody()
      if (currentChild && current) {
        if (!current.children) current.children = []
        current.children.push(currentChild)
      }
      currentChild = { level: 3, title: line.replace(/^###\s+/, ''), body: '' }
      bodyLines = []
      continue
    }

    bodyLines.push(line)
  }

  // Flush remaining
  flushBody()
  if (currentChild && current) {
    if (!current.children) current.children = []
    current.children.push(currentChild)
  }
  if (current) sections.push(current)

  return sections
}
