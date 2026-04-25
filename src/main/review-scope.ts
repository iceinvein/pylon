import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { GhPrDetail, ReviewMode, ReviewModePreference } from '../shared/types'
import { parseFilesFromDiff } from './gh-cli-parse'

const execFileAsync = promisify(execFile)

type ReviewScopeBaseline = {
  reviewId: string
  headSha: string | null
  baseSha: string | null
}

export type ReviewScopeResult = {
  reviewMode: ReviewMode
  diff: string
  files: GhPrDetail['files']
  comparedFromSha: string | null
  comparedToSha: string | null
  incrementalValid: boolean
  scopeLabel: string
  baselineReviewId: string | null
}

type ResolveReviewScopeArgs = {
  repoPath: string
  current: Pick<GhPrDetail, 'diff' | 'files' | 'headSha' | 'baseSha'>
  previous: ReviewScopeBaseline | null
  requestedMode: ReviewModePreference
}

function buildFullScope(
  current: ResolveReviewScopeArgs['current'],
  previous: ReviewScopeBaseline | null,
  incrementalValid: boolean,
): ReviewScopeResult {
  return {
    reviewMode: 'full',
    diff: current.diff,
    files: current.files,
    comparedFromSha: null,
    comparedToSha: current.headSha,
    incrementalValid,
    scopeLabel: 'full-pr',
    baselineReviewId: previous?.reviewId ?? null,
  }
}

export async function resolveReviewScope({
  repoPath,
  current,
  previous,
  requestedMode,
}: ResolveReviewScopeArgs): Promise<ReviewScopeResult> {
  if (requestedMode === 'full') {
    return buildFullScope(current, previous, true)
  }

  if (!previous?.headSha || !current.headSha) {
    return buildFullScope(current, previous, false)
  }

  if (previous.baseSha && current.baseSha && previous.baseSha !== current.baseSha) {
    return buildFullScope(current, previous, false)
  }

  try {
    await execFileAsync('git', ['merge-base', '--is-ancestor', previous.headSha, current.headSha], {
      cwd: repoPath,
      timeout: 10_000,
      maxBuffer: 1024 * 1024 * 10,
    })
  } catch {
    return buildFullScope(current, previous, false)
  }

  try {
    const { stdout } = await execFileAsync(
      'git',
      ['diff', `${previous.headSha}..${current.headSha}`],
      {
        cwd: repoPath,
        timeout: 30_000,
        maxBuffer: 1024 * 1024 * 10,
      },
    )
    return {
      reviewMode: 'incremental',
      diff: stdout,
      files: parseFilesFromDiff(stdout),
      comparedFromSha: previous.headSha,
      comparedToSha: current.headSha,
      incrementalValid: true,
      scopeLabel: 'incremental-head-range',
      baselineReviewId: previous.reviewId,
    }
  } catch {
    return buildFullScope(current, previous, false)
  }
}
