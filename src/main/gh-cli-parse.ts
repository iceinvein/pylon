/**
 * Pure parsing utilities for GitHub diff output.
 *
 * Extracted from gh-cli.ts so they can be tested without loading Electron
 * or better-sqlite3 (gh-cli.ts has a transitive dependency on both via db.ts).
 */

/**
 * Parse a unified diff to extract file paths and per-file addition/deletion counts.
 * Used as a fallback when the REST API file list is unavailable.
 */
export function parseFilesFromDiff(
  diff: string,
): Array<{ path: string; additions: number; deletions: number }> {
  const files: Array<{ path: string; additions: number; deletions: number }> = []
  const chunks = diff.split(/^(?=diff --git )/m)
  for (const chunk of chunks) {
    if (!chunk.startsWith('diff --git ')) continue
    const headerMatch = chunk.match(/^diff --git a\/(.+?) b\/(.+)/)
    if (!headerMatch) continue
    const filePath = headerMatch[2]
    let additions = 0
    let deletions = 0
    for (const line of chunk.split('\n')) {
      if (line.startsWith('+') && !line.startsWith('+++')) additions++
      else if (line.startsWith('-') && !line.startsWith('---')) deletions++
    }
    files.push({ path: filePath, additions, deletions })
  }
  return files
}

/**
 * Assemble a unified diff string from per-file REST API patches.
 * Each entry from the /pulls/:number/files endpoint has a `patch` field
 * containing the diff hunks for that file. We prefix each with a
 * `diff --git` header so downstream consumers (splitDiffByFile, chunkDiff)
 * can parse it identically to the output of `gh pr diff`.
 *
 * Files without a `patch` (e.g. binary files, renames with no content change)
 * are skipped since there's no textual diff to show.
 */
export function assembleDiffFromPatches(filesRaw: Array<Record<string, unknown>>): string {
  const parts: string[] = []
  for (const f of filesRaw) {
    const patch = f.patch as string | undefined
    if (!patch) continue
    const filename = (f.filename as string) ?? ''
    const prevFilename = (f.previous_filename as string) ?? filename
    parts.push(
      `diff --git a/${prevFilename} b/${filename}\n--- a/${prevFilename}\n+++ b/${filename}\n${patch}`,
    )
  }
  return parts.join('\n')
}
