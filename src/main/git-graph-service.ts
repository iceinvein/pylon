import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { BranchInfo, GraphCommit, GraphLine, GraphRef } from '../shared/git-types'
import { log } from '../shared/logger'

const execFileAsync = promisify(execFile)
const logger = log.child('git-graph-service')

const LANE_COLORS = [
  '#f59e0b',
  '#3b82f6',
  '#10b981',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#6366f1',
  '#84cc16',
]

export function parseGitLogLine(line: string): GraphCommit {
  const parts = line.split('|')
  const hash = parts[0] ?? ''
  const parentStr = parts[1] ?? ''
  const refStr = parts[2] ?? ''
  const message = parts[3] ?? ''
  const author = parts[4] ?? ''
  const date = parts[5] ?? ''

  const parents = parentStr.trim() ? parentStr.trim().split(' ') : []

  const refs: GraphRef[] = []
  let hasHead = false
  if (refStr.trim()) {
    for (const raw of refStr.split(',').map((s) => s.trim())) {
      if (raw.startsWith('HEAD -> ')) {
        hasHead = true
        refs.push({ name: raw.slice(8), type: 'local-branch', isCurrent: true })
      } else if (raw === 'HEAD') {
        hasHead = true
      } else if (raw.startsWith('tag: ')) {
        refs.push({ name: raw.slice(5), type: 'tag', isCurrent: false })
      } else if (raw.includes('/')) {
        refs.push({ name: raw, type: 'remote-branch', isCurrent: false })
      } else {
        refs.push({ name: raw, type: 'local-branch', isCurrent: false })
      }
    }
    if (hasHead) {
      refs.push({ name: 'HEAD', type: 'head', isCurrent: true })
    }
  }

  return {
    hash,
    shortHash: hash.slice(0, 7),
    parents,
    message,
    author,
    date,
    refs,
    graphColumns: 0,
    graphLines: [],
  }
}

export function assignLanes(commits: GraphCommit[]): GraphCommit[] {
  const lanes: (string | null)[] = []
  const hashToLane = new Map<string, number>()

  for (const commit of commits) {
    let col = hashToLane.get(commit.hash)
    if (col === undefined) {
      col = lanes.indexOf(null)
      if (col === -1) {
        col = lanes.length
        lanes.push(null)
      }
    }
    lanes[col] = null
    commit.graphColumns = col

    const lines: GraphLine[] = []

    if (commit.parents[0]) {
      lanes[col] = commit.parents[0]
      hashToLane.set(commit.parents[0], col)
      lines.push({
        fromColumn: col,
        toColumn: col,
        type: 'straight',
        color: LANE_COLORS[col % LANE_COLORS.length],
      })
    }

    for (let i = 1; i < commit.parents.length; i++) {
      const parent = commit.parents[i]
      const existingLane = hashToLane.get(parent)
      if (existingLane !== undefined) {
        lines.push({
          fromColumn: col,
          toColumn: existingLane,
          type: 'merge-in',
          color: LANE_COLORS[existingLane % LANE_COLORS.length],
        })
      } else {
        let newLane = lanes.indexOf(null)
        if (newLane === -1) {
          newLane = lanes.length
          lanes.push(null)
        }
        lanes[newLane] = parent
        hashToLane.set(parent, newLane)
        lines.push({
          fromColumn: col,
          toColumn: newLane,
          type: 'fork-out',
          color: LANE_COLORS[newLane % LANE_COLORS.length],
        })
      }
    }

    commit.graphLines = lines
  }

  return commits
}

export async function getGraphLog(
  cwd: string,
  afterHash?: string,
  limit = 100,
): Promise<GraphCommit[]> {
  const args = ['log', '--all', '--format=%H|%P|%D|%s|%an|%aI', '--topo-order', `-${limit}`]

  if (afterHash) {
    args.push(`${afterHash}~1`)
  }

  try {
    const { stdout } = await execFileAsync('git', args, { cwd, timeout: 10000 })
    const lines = stdout.trim().split('\n').filter(Boolean)
    const commits = lines.map(parseGitLogLine)
    return assignLanes(commits)
  } catch (err) {
    logger.error('Failed to get graph log:', err)
    return []
  }
}

export async function getGitBranches(cwd: string): Promise<BranchInfo[]> {
  const branches: BranchInfo[] = []

  try {
    const { stdout: localOut } = await execFileAsync(
      'git',
      [
        'for-each-ref',
        '--format=%(refname:short)|%(objectname:short)|%(upstream:short)|%(HEAD)',
        'refs/heads/',
      ],
      { cwd, timeout: 5000 },
    )
    for (const line of localOut.trim().split('\n').filter(Boolean)) {
      const [name, headHash, upstream, headMarker] = line.split('|')
      if (!name) continue

      let ahead = 0
      let behind = 0
      if (upstream) {
        try {
          const { stdout: counts } = await execFileAsync(
            'git',
            ['rev-list', '--left-right', '--count', `${name}...${upstream}`],
            { cwd, timeout: 3000 },
          )
          const parts = counts.trim().split('\t')
          ahead = Number(parts[0]) || 0
          behind = Number(parts[1]) || 0
        } catch {
          // No upstream tracking
        }
      }

      branches.push({
        name: name ?? '',
        type: 'local',
        isCurrent: headMarker?.trim() === '*',
        upstream: upstream || null,
        ahead,
        behind,
        headHash: headHash ?? '',
      })
    }

    const { stdout: remoteOut } = await execFileAsync(
      'git',
      ['for-each-ref', '--format=%(refname:short)|%(objectname:short)', 'refs/remotes/'],
      { cwd, timeout: 5000 },
    )
    for (const line of remoteOut.trim().split('\n').filter(Boolean)) {
      const [name, headHash] = line.split('|')
      if (!name || name.endsWith('/HEAD')) continue
      branches.push({
        name: name ?? '',
        type: 'remote',
        isCurrent: false,
        upstream: null,
        ahead: 0,
        behind: 0,
        headHash: headHash ?? '',
      })
    }
  } catch (err) {
    logger.error('Failed to get branches:', err)
  }

  return branches
}

export async function checkoutBranch(
  cwd: string,
  branch: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await execFileAsync('git', ['checkout', branch], { cwd, timeout: 10000 })
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error('Checkout failed:', message)
    return { success: false, error: message }
  }
}
