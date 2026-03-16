import type { GraphCommit, GraphLine } from '../../../shared/git-types'

export const GRAPH_CONSTANTS = {
  ROW_HEIGHT: 32,
  COLUMN_WIDTH: 16,
  NODE_RADIUS: 4,
  GRAPH_LEFT_PADDING: 12,
  TEXT_LEFT_PADDING: 8,
} as const

export const LANE_COLORS = [
  '#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
]

export function getNodeX(column: number): number {
  return GRAPH_CONSTANTS.GRAPH_LEFT_PADDING + column * GRAPH_CONSTANTS.COLUMN_WIDTH
}

export function getNodeY(rowIndex: number): number {
  return rowIndex * GRAPH_CONSTANTS.ROW_HEIGHT + GRAPH_CONSTANTS.ROW_HEIGHT / 2
}

export function getGraphWidth(commits: GraphCommit[]): number {
  let maxCol = 0
  for (const c of commits) {
    maxCol = Math.max(maxCol, c.graphColumns)
    for (const line of c.graphLines) {
      maxCol = Math.max(maxCol, line.fromColumn, line.toColumn)
    }
  }
  return GRAPH_CONSTANTS.GRAPH_LEFT_PADDING * 2 + (maxCol + 1) * GRAPH_CONSTANTS.COLUMN_WIDTH
}

export function drawGraph(
  ctx: CanvasRenderingContext2D,
  commits: GraphCommit[],
  width: number,
  height: number,
  devicePixelRatio: number,
): void {
  ctx.clearRect(0, 0, width * devicePixelRatio, height * devicePixelRatio)
  ctx.save()
  ctx.scale(devicePixelRatio, devicePixelRatio)

  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i]
    const y = getNodeY(i)

    for (const line of commit.graphLines) {
      const fromX = getNodeX(line.fromColumn)
      const toX = getNodeX(line.toColumn)
      const nextY = getNodeY(i + 1)

      ctx.beginPath()
      ctx.strokeStyle = line.color
      ctx.lineWidth = 2

      if (line.type === 'straight') {
        ctx.moveTo(fromX, y)
        ctx.lineTo(toX, nextY)
      } else {
        ctx.moveTo(fromX, y)
        ctx.bezierCurveTo(fromX, y + 16, toX, nextY - 16, toX, nextY)
      }

      ctx.stroke()
    }
  }

  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i]
    const x = getNodeX(commit.graphColumns)
    const y = getNodeY(i)
    const color = LANE_COLORS[commit.graphColumns % LANE_COLORS.length]

    ctx.beginPath()
    ctx.arc(x, y, GRAPH_CONSTANTS.NODE_RADIUS, 0, Math.PI * 2)
    ctx.fillStyle = commit.parents.length > 1 ? '#0a0a0f' : color
    ctx.fill()

    if (commit.parents.length > 1) {
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.stroke()
    }
  }

  ctx.restore()
}
