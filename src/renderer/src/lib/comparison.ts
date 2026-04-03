// src/renderer/src/lib/comparison.ts
import type { TestFinding } from '../../../shared/types'

export type ComparisonResult = {
  new: TestFinding[]
  resolved: TestFinding[]
  unchanged: Array<{ baseline: TestFinding; target: TestFinding }>
}

export function diffFindings(baseline: TestFinding[], target: TestFinding[]): ComparisonResult {
  const baselineByTitle = new Map<string, TestFinding>()
  for (const f of baseline) {
    baselineByTitle.set(f.title.toLowerCase(), f)
  }

  const matched = new Set<string>()
  const result: ComparisonResult = { new: [], resolved: [], unchanged: [] }

  for (const t of target) {
    const key = t.title.toLowerCase()
    const b = baselineByTitle.get(key)
    if (b) {
      result.unchanged.push({ baseline: b, target: t })
      matched.add(key)
    } else {
      result.new.push(t)
    }
  }

  for (const b of baseline) {
    if (!matched.has(b.title.toLowerCase())) {
      result.resolved.push(b)
    }
  }

  return result
}
