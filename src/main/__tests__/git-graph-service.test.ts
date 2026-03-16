import { describe, expect, test } from 'bun:test'
import type { GraphCommit } from '../../shared/git-types'
import { assignLanes, parseGitLogLine } from '../git-graph-service'

describe('parseGitLogLine', () => {
  test('parses a simple commit', () => {
    const line = 'abc1234|def5678|HEAD -> main, origin/main|fix: typo|Alice|2026-03-16T10:00:00Z'
    const commit = parseGitLogLine(line)
    expect(commit.hash).toBe('abc1234')
    expect(commit.shortHash).toBe('abc1234')
    expect(commit.parents).toEqual(['def5678'])
    expect(commit.message).toBe('fix: typo')
    expect(commit.author).toBe('Alice')
    expect(commit.refs).toHaveLength(3)
    expect(commit.refs[0]).toEqual({ name: 'main', type: 'local-branch', isCurrent: true })
    expect(commit.refs[1]).toEqual({ name: 'origin/main', type: 'remote-branch', isCurrent: false })
  })

  test('parses merge commit with two parents', () => {
    const line = 'aaa|bbb ccc||Merge branch feature|Bob|2026-03-15T09:00:00Z'
    const commit = parseGitLogLine(line)
    expect(commit.parents).toEqual(['bbb', 'ccc'])
  })

  test('parses commit with no refs', () => {
    const line = 'abc|def||some message|Eve|2026-03-14T08:00:00Z'
    const commit = parseGitLogLine(line)
    expect(commit.refs).toEqual([])
  })

  test('parses tag ref', () => {
    const line = 'abc|def|tag: v1.0.0|release|Eve|2026-03-14T08:00:00Z'
    const commit = parseGitLogLine(line)
    expect(commit.refs[0]).toEqual({ name: 'v1.0.0', type: 'tag', isCurrent: false })
  })
})

function makeCommit(hash: string, parents: string[]): GraphCommit {
  return {
    hash,
    shortHash: hash.slice(0, 7),
    parents,
    message: '',
    author: '',
    date: '',
    refs: [],
    graphColumns: 0,
    graphLines: [],
  }
}

describe('assignLanes', () => {
  test('assigns column 0 to a linear history', () => {
    const commits = [makeCommit('a', ['b']), makeCommit('b', ['c']), makeCommit('c', [])]
    const result = assignLanes(commits)
    expect(result.every((c) => c.graphColumns === 0)).toBe(true)
  })

  test('fork creates second lane, feature merges back', () => {
    // A is a merge commit (parents: B main, E feature)
    // E is a feature commit (parent: D)
    // B is a main commit (parent: D)
    // D is the merge base
    const commits = [
      makeCommit('A', ['B', 'E']),
      makeCommit('E', ['D']),
      makeCommit('B', ['D']),
      makeCommit('D', []),
    ]
    const result = assignLanes(commits)

    // A should be in lane 0, E in lane 1 (forked)
    expect(result[0].graphColumns).toBe(0)
    expect(result[1].graphColumns).toBe(1)

    // B should stay in lane 0 (main line continues), not jump to lane 1
    expect(result[2].graphColumns).toBe(0)
  })

  test('pass-through lines are generated for active lanes', () => {
    // A forks to B (lane 0) and E (lane 1)
    // E is in lane 1. Lane 0 still has B pending — it should get a continuation line.
    const commits = [
      makeCommit('A', ['B', 'E']),
      makeCommit('E', ['D']),
      makeCommit('B', ['D']),
      makeCommit('D', []),
    ]
    const result = assignLanes(commits)

    // At row 1 (E), lane 0 holds 'B' but E is in lane 1.
    // There should be a pass-through line for lane 0.
    const eLines = result[1].graphLines
    const passThrough = eLines.find(
      (l) => l.fromColumn === 0 && l.toColumn === 0 && l.type === 'straight',
    )
    expect(passThrough).toBeDefined()
  })

  test('no lane leak after branch merges back', () => {
    const commits = [
      makeCommit('A', ['B', 'E']),
      makeCommit('E', ['B']),
      makeCommit('B', ['C']),
      makeCommit('C', []),
    ]
    const result = assignLanes(commits)

    // E's parent B is already in lane 0 — E should merge into lane 0
    const eLines = result[1].graphLines
    const mergeLine = eLines.find((l) => l.type === 'merge-in' && l.toColumn === 0)
    expect(mergeLine).toBeDefined()

    // B should be in lane 0 (not shifted)
    expect(result[2].graphColumns).toBe(0)
  })

  test('merge-in target lane still gets continuation line', () => {
    // B (lane 0) merges first parent into lane 1 (where D lives).
    // Lane 1 should still get a vertical continuation — the merge-in
    // goes FROM lane 0 TO lane 1, it doesn't replace lane 1's backbone.
    const commits = [
      makeCommit('A', ['B', 'E']),
      makeCommit('E', ['D']),
      makeCommit('B', ['D']), // B's parent D is already in lane 1
      makeCommit('D', []),
    ]
    const result = assignLanes(commits)

    // At B's row, there should be a continuation line for lane 1
    const bLines = result[2].graphLines
    const continuation = bLines.find(
      (l) => l.fromColumn === 1 && l.toColumn === 1 && l.type === 'straight',
    )
    expect(continuation).toBeDefined()
  })

  test('fork row does not create orphan continuation for new lane', () => {
    // When A forks to create lane 1, lane 1 should NOT get a continuation
    // at A's row — the fork-out line already handles the visual connection.
    const commits = [
      makeCommit('A', ['B', 'E']),
      makeCommit('E', ['D']),
      makeCommit('B', ['D']),
      makeCommit('D', []),
    ]
    const result = assignLanes(commits)

    // At A's row (row 0), lane 1 was just created. No continuation should exist.
    const aLines = result[0].graphLines
    const orphan = aLines.find(
      (l) => l.fromColumn === 1 && l.toColumn === 1 && l.type === 'straight',
    )
    expect(orphan).toBeUndefined()
  })
})
