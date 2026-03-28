import { BrowserWindow, ipcMain } from 'electron'
import { IPC } from '../shared/ipc-channels'
import { log } from '../shared/logger'

const logger = log.child('ast-ipc')

export function registerAstIpcHandlers(): void {
  ipcMain.handle(IPC.AST_ANALYZE_SCOPE, async (_e, args: { scope: string }) => {
    const { analyzeScope } = await import('./ast-analyzer')
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return
    win.webContents.send(IPC.AST_ANALYSIS_PROGRESS, {
      status: 'parsing',
      message: 'Parsing files...',
    })
    const graph = analyzeScope(args.scope)
    win.webContents.send(IPC.AST_REPO_GRAPH, graph)
    win.webContents.send(IPC.AST_ANALYSIS_PROGRESS, {
      status: 'analyzing',
      message: `Parsed ${graph.files.length} files. Analyzing with Claude...`,
    })

    // Stage 2: Claude architecture analysis
    const { analyzeRepoWithClaude, resolveClaudePath, createCliQueryFn } = await import(
      './ast-claude'
    )
    const claudePath = resolveClaudePath()
    if (claudePath) {
      const queryFn = createCliQueryFn(claudePath)
      const analysis = await analyzeRepoWithClaude(graph, queryFn)
      if (analysis) {
        win.webContents.send(IPC.AST_ARCH_ANALYSIS, analysis)
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
    const { parseFileAst } = await import('./ast-analyzer')
    return parseFileAst(args.filePath)
  })

  ipcMain.handle(
    IPC.AST_EXPLAIN,
    async (_e, args: { nodeId: string; filePath: string; context: string }) => {
      const win = BrowserWindow.getFocusedWindow()
      const { explainNode, resolveClaudePath, createCliQueryFn } = await import('./ast-claude')
      const claudePath = resolveClaudePath()
      if (!claudePath) {
        const result = {
          text: 'Claude CLI not found. Install Claude Code to use this feature.',
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
        text: 'Claude CLI not found. Install Claude Code to use this feature.',
        done: true,
      }
      if (win) win.webContents.send(IPC.AST_CHAT_RESULT, result)
      return result
    }
    const queryFn = createCliQueryFn(claudePath)

    const { analyzeScope } = await import('./ast-analyzer')
    let graphSummary = `Scope: ${args.scope}`
    try {
      const graph = analyzeScope(args.scope)
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

    const { text, highlights } = await chatAboutCode(args.message, graphSummary, queryFn)
    const result = { text, highlights, done: true }
    if (win) win.webContents.send(IPC.AST_CHAT_RESULT, result)
    return result
  })
}
