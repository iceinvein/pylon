import { describe, expect, test } from 'bun:test'
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

describe('assignLanes', () => {
  test('assigns column 0 to a linear history', () => {
    const commits = [
      {
        hash: 'a',
        parents: ['b'],
        refs: [],
        message: '',
        author: '',
        date: '',
        shortHash: 'a',
        graphColumns: 0,
        graphLines: [],
      },
      {
        hash: 'b',
        parents: ['c'],
        refs: [],
        message: '',
        author: '',
        date: '',
        shortHash: 'b',
        graphColumns: 0,
        graphLines: [],
      },
      {
        hash: 'c',
        parents: [],
        refs: [],
        message: '',
        author: '',
        date: '',
        shortHash: 'c',
        graphColumns: 0,
        graphLines: [],
      },
    ]
    const result = assignLanes(commits)
    expect(result.every((c) => c.graphColumns === 0)).toBe(true)
  })
})
