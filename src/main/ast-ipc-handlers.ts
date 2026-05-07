import * as path from 'node:path'
import { app, BrowserWindow, ipcMain } from 'electron'
import { IPC } from '../shared/ipc-channels'
import { log } from '../shared/logger'
import type { AstCachedAnalysis, ImpactIndex, RepoGraph } from '../shared/types'
import { getDb } from './db'

const logger = log.child('ast-ipc')

// ── Persistence helpers ──

function saveAnalysis(
  scope: string,
  repoGraph: unknown,
  archAnalysis: unknown | null,
  fileCount: number,
  impactIndex: ImpactIndex | null,
  snapshotHash: string | null,
): void {
  const db = getDb()
  db.prepare(
    `INSERT OR REPLACE INTO ast_analyses
      (scope, repo_graph, arch_analysis, file_count, impact_index, snapshot_hash, analyzed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    scope,
    JSON.stringify(repoGraph),
    archAnalysis ? JSON.stringify(archAnalysis) : null,
    fileCount,
    impactIndex ? JSON.stringify(impactIndex) : null,
    snapshotHash,
    Date.now(),
  )
}

function loadCachedAnalysis(scope: string): AstCachedAnalysis | null {
  const db = getDb()
  const row = db
    .prepare(
      'SELECT repo_graph, arch_analysis, impact_index, snapshot_hash, analyzed_at FROM ast_analyses WHERE scope = ?',
    )
    .get(scope) as
    | {
        repo_graph: string
        arch_analysis: string | null
        impact_index: string | null
        snapshot_hash: string | null
        analyzed_at: number
      }
    | undefined
  if (!row) return null

  const repoGraph = JSON.parse(row.repo_graph) as RepoGraph
  let currentSnapshotHash = row.snapshot_hash ?? ''
  try {
    const { computeSnapshotHash } = require('./ast-impact') as typeof import('./ast-impact')
    currentSnapshotHash = computeSnapshotHash(repoGraph)
  } catch {
    currentSnapshotHash = row.snapshot_hash ?? ''
  }

  return {
    repoGraph,
    archAnalysis: row.arch_analysis ? JSON.parse(row.arch_analysis) : null,
    impactIndex: row.impact_index ? (JSON.parse(row.impact_index) as ImpactIndex) : null,
    freshness: {
      analyzedAt: row.analyzed_at,
      snapshotHash: row.snapshot_hash ?? '',
      currentSnapshotHash,
      stale: row.snapshot_hash !== currentSnapshotHash,
    },
    analyzedAt: row.analyzed_at,
  }
}

// ── IPC Handlers ──

export function registerAstIpcHandlers(): void {
  // Set the resource directory for bundled tree-sitter grammars.
  const grammarsDir = app.isPackaged
    ? path.join(process.resourcesPath, 'resources', 'grammars')
    : path.join(app.getAppPath(), 'resources', 'grammars')

  import('./ast-parsers/grammar-manager').then(({ setResourceDir }) => {
    setResourceDir(grammarsDir)
    logger.info(`grammar resource dir set to: ${grammarsDir}`)
  })

  // Return cached analysis for a scope (if available)
  ipcMain.handle(IPC.AST_GET_CACHED, async (_e, args: { scope: string }) => {
    return loadCachedAnalysis(args.scope)
  })

  ipcMain.handle(IPC.AST_GET_IMPACT_INDEX, async (_e, args: { scope: string }) => {
    const cached = loadCachedAnalysis(args.scope)
    if (cached?.impactIndex) return cached.impactIndex
    return null
  })

  ipcMain.handle(
    IPC.AST_GET_IMPACT,
    async (_e, args: { scope: string; entity: import('../shared/types').CodeEntity }) => {
      const cached = loadCachedAnalysis(args.scope)
      if (!cached?.impactIndex) return null
      const { getImpactSummary } = await import('./ast-impact')
      return getImpactSummary(
        cached.impactIndex,
        args.entity,
        cached.freshness.currentSnapshotHash ?? cached.impactIndex.snapshotHash,
      )
    },
  )

  ipcMain.handle(IPC.AST_SEARCH_ENTITIES, async (_e, args: { scope: string; query: string }) => {
    const cached = loadCachedAnalysis(args.scope)
    if (!cached?.impactIndex) return []
    const { searchImpactEntities } = await import('./ast-impact')
    return searchImpactEntities(cached.impactIndex, args.query)
  })

  ipcMain.handle(IPC.AST_ANALYZE_SCOPE, async (_e, args: { scope: string }) => {
    const { analyzeScope } = await import('./ast-analyzer')
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return
    win.webContents.send(IPC.AST_ANALYSIS_PROGRESS, {
      status: 'parsing',
      message: 'Parsing files...',
    })
    const graph = await analyzeScope(args.scope)
    const { buildImpactIndex } = await import('./ast-impact')
    const impactIndex = buildImpactIndex(graph)
    win.webContents.send(IPC.AST_REPO_GRAPH, graph)

    // Persist Stage 1 immediately so it's available on reload
    saveAnalysis(args.scope, graph, null, graph.files.length, impactIndex, impactIndex.snapshotHash)

    win.webContents.send(IPC.AST_ANALYSIS_PROGRESS, {
      status: 'analyzing',
      message: `Parsed ${graph.files.length} files. Analyzing with Claude Code...`,
    })

    // Stage 2: Claude architecture analysis
    const { analyzeRepoWithClaude, resolveClaudePath, createCliQueryFn } = await import(
      './ast-claude'
    )
    const claudePath = resolveClaudePath()
    let analysis: unknown = null
    if (claudePath) {
      const queryFn = createCliQueryFn(claudePath)
      analysis = await analyzeRepoWithClaude(graph, queryFn)
      if (analysis) {
        win.webContents.send(IPC.AST_ARCH_ANALYSIS, analysis)
        // Persist Stage 2 result
        saveAnalysis(
          args.scope,
          graph,
          analysis,
          graph.files.length,
          impactIndex,
          impactIndex.snapshotHash,
        )
      }
    } else {
      logger.warn('Claude CLI not found — skipping architecture analysis')
    }

    win.webContents.send(IPC.AST_ANALYSIS_PROGRESS, {
      status: 'ready',
      message: 'Analysis complete',
    })
  })

  ipcMain.handle(IPC.AST_FILE_AST, async (_e, args: { filePath: string }) => {
    const { parseFileAstMulti } = await import('./ast-analyzer')
    return parseFileAstMulti(args.filePath)
  })

  ipcMain.handle(
    IPC.AST_EXPLAIN,
    async (_e, args: { nodeId: string; filePath: string; context: string }) => {
      const win = BrowserWindow.getFocusedWindow()
      const { explainNode, resolveClaudePath, createCliQueryFn } = await import('./ast-claude')
      const claudePath = resolveClaudePath()
      if (!claudePath) {
        const result = {
          text: 'Claude Code CLI not found. Install Claude Code to use this feature.',
          done: true,
        }
        if (win) win.webContents.send(IPC.AST_EXPLAIN_RESULT, result)
        return result
      }
      const queryFn = createCliQueryFn(claudePath)
      const nodeName = args.nodeId.replace(
        /^(function|class|type|variable)-\d+$/,
        args.context || args.nodeId,
      )
      const text = await explainNode(args.filePath, nodeName, args.context, queryFn)
      const result = { text, done: true }
      if (win) win.webContents.send(IPC.AST_EXPLAIN_RESULT, result)
      return result
    },
  )

  ipcMain.handle(IPC.AST_CHAT, async (_e, args: { message: string; scope: string }) => {
    const win = BrowserWindow.getFocusedWindow()
    const { chatAboutCode, resolveClaudePath, createCliQueryFn } = await import('./ast-claude')
    const claudePath = resolveClaudePath()
    if (!claudePath) {
      const result = {
        text: 'Claude Code CLI not found. Install Claude Code to use this feature.',
        done: true,
      }
      if (win) win.webContents.send(IPC.AST_CHAT_RESULT, result)
      return result
    }
    const queryFn = createCliQueryFn(claudePath)

    // Use cached graph summary if available
    let graphSummary = `Scope: ${args.scope}`
    const cached = loadCachedAnalysis(args.scope)
    if (cached) {
      const graph = cached.repoGraph as {
        files: Array<{ filePath: string; declarations: Array<{ type: string; name: string }> }>
        edges: unknown[]
      }
      const lines: string[] = [`Files: ${graph.files.length}`, '']
      for (const file of graph.files.slice(0, 50)) {
        const decls = file.declarations.map((d) => `${d.type}:${d.name}`).join(', ')
        const shortPath = file.filePath.replace(/^.*?\/src\//, 'src/')
        lines.push(`${shortPath} — ${decls || 'no declarations'}`)
      }
      graphSummary = lines.join('\n')
    } else {
      // Fallback: re-analyze (slower)
      try {
        const { analyzeScope } = await import('./ast-analyzer')
        const graph = await analyzeScope(args.scope)
        const lines: string[] = [`Files: ${graph.files.length}`, `Edges: ${graph.edges.length}`, '']
        for (const file of graph.files.slice(0, 50)) {
          const decls = file.declarations.map((d) => `${d.type}:${d.name}`).join(', ')
          const shortPath = file.filePath.replace(/^.*?\/src\//, 'src/')
          lines.push(`${shortPath} — ${decls || 'no declarations'}`)
        }
        graphSummary = lines.join('\n')
      } catch {
        // Use minimal summary on error
      }
    }

    const { text, highlights } = await chatAboutCode(args.message, graphSummary, queryFn)
    const result = { text, highlights, done: true }
    if (win) win.webContents.send(IPC.AST_CHAT_RESULT, result)
    return result
  })
}
