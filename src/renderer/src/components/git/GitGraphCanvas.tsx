import { useEffect, useRef } from 'react'
import type { GraphCommit } from '../../../../shared/git-types'
import { drawGraph, GRAPH_CONSTANTS, getGraphWidth } from '../../lib/git-graph-layout'

type GitGraphCanvasProps = {
  commits: GraphCommit[]
}

export function GitGraphCanvas({ commits }: GitGraphCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // When commits are cleared (e.g. tab switch), reset canvas so old drawing doesn't linger
    if (commits.length === 0) {
      canvas.width = 0
      canvas.height = 0
      return
    }

    const dpr = window.devicePixelRatio || 1
    const width = getGraphWidth(commits)
    const height = commits.length * GRAPH_CONSTANTS.ROW_HEIGHT

    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    drawGraph(ctx, commits, width, height, dpr)
  }, [commits])

  return <canvas ref={canvasRef} className="pointer-events-none" />
}
