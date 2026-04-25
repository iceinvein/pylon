import { describe, expect, test } from 'bun:test'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { parseFilesFromDiff } from '../gh-cli-parse'
import { resolveReviewScope } from '../review-scope'

const execFileAsync = promisify(execFile)

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, timeout: 10_000 })
  return stdout.trim()
}

describe('resolveReviewScope', () => {
  test('uses full scope when there is no previous review baseline', async () => {
    const repoPath = await mkdtemp(join(tmpdir(), 'review-scope-'))
    try {
      await git(repoPath, 'init', '-b', 'main')
      await git(repoPath, 'config', 'user.name', 'Pylon Test')
      await git(repoPath, 'config', 'user.email', 'test@example.com')
      await git(repoPath, 'config', 'commit.gpgsign', 'false')

      const file = join(repoPath, 'app.ts')
      await writeFile(file, "export const value = 'a'\n")
      await git(repoPath, 'add', 'app.ts')
      await git(repoPath, 'commit', '-m', 'base')
      const baseSha = await git(repoPath, 'rev-parse', 'HEAD')

      await writeFile(file, "export const value = 'b'\n")
      await git(repoPath, 'commit', '-am', 'change')
      const headSha = await git(repoPath, 'rev-parse', 'HEAD')
      const diff = await git(repoPath, 'diff', `${baseSha}..${headSha}`)

      const scope = await resolveReviewScope({
        repoPath,
        current: {
          diff,
          files: parseFilesFromDiff(diff),
          headSha,
          baseSha,
        },
        previous: null,
        requestedMode: 'auto',
      })

      expect(scope.reviewMode).toBe('full')
      expect(scope.diff.trim()).toBe(diff.trim())
      expect(scope.comparedFromSha).toBeNull()
      expect(scope.comparedToSha).toBe(headSha)
      expect(scope.incrementalValid).toBe(false)
    } finally {
      await rm(repoPath, { recursive: true, force: true })
    }
  })

  test('uses incremental scope when previous head is an ancestor on the same base', async () => {
    const repoPath = await mkdtemp(join(tmpdir(), 'review-scope-'))
    try {
      await git(repoPath, 'init', '-b', 'main')
      await git(repoPath, 'config', 'user.name', 'Pylon Test')
      await git(repoPath, 'config', 'user.email', 'test@example.com')
      await git(repoPath, 'config', 'commit.gpgsign', 'false')

      const file = join(repoPath, 'app.ts')
      await writeFile(file, "export const value = 'a'\n")
      await git(repoPath, 'add', 'app.ts')
      await git(repoPath, 'commit', '-m', 'base')
      const baseSha = await git(repoPath, 'rev-parse', 'HEAD')

      await writeFile(file, "export const value = 'b'\n")
      await git(repoPath, 'commit', '-am', 'reviewed')
      const reviewedHeadSha = await git(repoPath, 'rev-parse', 'HEAD')

      await writeFile(file, "export const value = 'c'\n")
      await git(repoPath, 'commit', '-am', 'follow-up')
      const currentHeadSha = await git(repoPath, 'rev-parse', 'HEAD')

      const fullDiff = await git(repoPath, 'diff', `${baseSha}..${currentHeadSha}`)
      const incrementalDiff = await git(repoPath, 'diff', `${reviewedHeadSha}..${currentHeadSha}`)

      const scope = await resolveReviewScope({
        repoPath,
        current: {
          diff: fullDiff,
          files: parseFilesFromDiff(fullDiff),
          headSha: currentHeadSha,
          baseSha,
        },
        previous: {
          reviewId: 'review-1',
          headSha: reviewedHeadSha,
          baseSha,
        },
        requestedMode: 'auto',
      })

      expect(scope.reviewMode).toBe('incremental')
      expect(scope.diff.trim()).toBe(incrementalDiff.trim())
      expect(scope.files).toEqual(parseFilesFromDiff(incrementalDiff))
      expect(scope.comparedFromSha).toBe(reviewedHeadSha)
      expect(scope.comparedToSha).toBe(currentHeadSha)
      expect(scope.incrementalValid).toBe(true)
      expect(scope.baselineReviewId).toBe('review-1')
    } finally {
      await rm(repoPath, { recursive: true, force: true })
    }
  })

  test('falls back to full scope when the base sha changed', async () => {
    const scope = await resolveReviewScope({
      repoPath: process.cwd(),
      current: {
        diff: 'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-old\n+new\n',
        files: [{ path: 'a.ts', additions: 1, deletions: 1 }],
        headSha: 'new-head',
        baseSha: 'new-base',
      },
      previous: {
        reviewId: 'review-1',
        headSha: 'old-head',
        baseSha: 'old-base',
      },
      requestedMode: 'incremental',
    })

    expect(scope.reviewMode).toBe('full')
    expect(scope.incrementalValid).toBe(false)
    expect(scope.comparedFromSha).toBeNull()
    expect(scope.comparedToSha).toBe('new-head')
  })
})
