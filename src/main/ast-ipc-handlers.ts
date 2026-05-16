import * as path from 'node:path'
import { app, BrowserWindow, ipcMain } from 'electron'
import { IPC } from '../shared/ipc-channels'
import { log } from '../shared/logger'
import { isEffortLevel, type EffortLevel } from '../shared/types'
import { getDb } from './db'
import { runProviderTextQuery } from './provider-text-query'
import { getProviderForModel } from './providers/registry'
import type { AgentProvider } from './providers/types'

const logger = log.child('ast-ipc')
const DEFAULT_AST_AGENT_MODEL = 'claude-opus-4-7'
const DEFAULT_AST_AGENT_EFFORT: EffortLevel = 'high'

type AstAgentArgs = {
  agentModel?: string
  agentEffort?: EffortLevel
}

function validAgentEffort(effort: unknown): EffortLevel {
  return isEffortLevel(effort) ? effort : DEFAULT_AST_AGENT_EFFORT
}

function providerLabel(provider: AgentProvider): string {
  return provider.id === 'codex' ? 'Codex' : 'Claude Code'
}

function resolveAstAgent(args: AstAgentArgs): {
  model: string
  effort: EffortLevel
  provider: AgentProvider | undefined
  label: string
} {
  const model = args.agentModel || DEFAULT_AST_AGENT_MODEL
  const effort = validAgentEffort(args.agentEffort)
  const provider = getProviderForModel(model)
  return {
    model,
    effort,
    provider,
    label: provider ? providerLabel(provider) : `model ${model}`,
  }
}

function createProviderQueryFn(
  cwd: string,
  agent: { model: string; effort: EffortLevel; provider: AgentProvider },
) {
  return (system: string, prompt: string) =>
    runProviderTextQuery({
      cwd,
      model: agent.model,
      effort: agent.effort,
      systemPrompt: system,
      prompt,
      provider: agent.provider,
    })
}

// ── Persistence helpers ──

function saveAnalysis(
  scope: string,
  repoGraph: unknown,
  archAnalysis: unknown | null,
  fileCount: number,
): void {
  const db = getDb()
  db.prepare(
    `INSERT OR REPLACE INTO ast_analyses (scope, repo_graph, arch_analysis, file_count, analyzed_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    scope,
    JSON.stringify(repoGraph),
    archAnalysis ? JSON.stringify(archAnalysis) : null,
    fileCount,
    Date.now(),
  )
}

function loadCachedAnalysis(
  scope: string,
): { repoGraph: unknown; archAnalysis: unknown | null; analyzedAt: number } | null {
  const db = getDb()
  const row = db
    .prepare('SELECT repo_graph, arch_analysis, analyzed_at FROM ast_analyses WHERE scope = ?')
    .get(scope) as
    | { repo_graph: string; arch_analysis: string | null; analyzed_at: number }
    | undefined
  if (!row) return null
  return {
    repoGraph: JSON.parse(row.repo_graph),
    archAnalysis: row.arch_analysis ? JSON.parse(row.arch_analysis) : null,
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

  ipcMain.handle(IPC.AST_ANALYZE_SCOPE, async (_e, args: { scope: string } & AstAgentArgs) => {
    const { analyzeScope } = await import('./ast-analyzer')
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return
    win.webContents.send(IPC.AST_ANALYSIS_PROGRESS, {
      status: 'parsing',
      message: 'Parsing files...',
    })
    const graph = await analyzeScope(args.scope)
    win.webContents.send(IPC.AST_REPO_GRAPH, graph)

    // Persist Stage 1 immediately so it's available on reload
    saveAnalysis(args.scope, graph, null, graph.files.length)

    win.webContents.send(IPC.AST_ANALYSIS_PROGRESS, {
      status: 'analyzing',
      message: `Parsed ${graph.files.length} files. Preparing AI analysis...`,
    })

    // Stage 2: provider-backed architecture analysis
    const { analyzeRepoWithAi } = await import('./ast-ai')
    const agent = resolveAstAgent(args)
    let analysis: unknown = null
    if (agent.provider) {
      win.webContents.send(IPC.AST_ANALYSIS_PROGRESS, {
        status: 'analyzing',
        message: `Parsed ${graph.files.length} files. Analyzing with ${agent.label}...`,
      })
      const queryFn = createProviderQueryFn(args.scope, {
        model: agent.model,
        effort: agent.effort,
        provider: agent.provider,
      })
      analysis = await analyzeRepoWithAi(graph, queryFn)
      if (analysis) {
        win.webContents.send(IPC.AST_ARCH_ANALYSIS, analysis)
        // Persist Stage 2 result
        saveAnalysis(args.scope, graph, analysis, graph.files.length)
      }
    } else {
      const message = `No AI provider found for AST model "${agent.model}". Choose a supported AST model.`
      logger.warn(message)
      win.webContents.send(IPC.AST_ANALYSIS_PROGRESS, {
        status: 'error',
        message,
      })
      return
    }

    if (!analysis) {
      win.webContents.send(IPC.AST_ANALYSIS_PROGRESS, {
        status: 'error',
        message: 'AI architecture analysis failed. Try again or choose another AST model.',
      })
      return
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
    async (
      _e,
      args: { nodeId: string; filePath: string; context: string; scope?: string } & AstAgentArgs,
    ) => {
      const win = BrowserWindow.getFocusedWindow()
      const { explainNode } = await import('./ast-ai')
      const agent = resolveAstAgent(args)
      if (!agent.provider) {
        const result = {
          text: `No provider found for model "${agent.model}". Choose another AST model in settings.`,
          done: true,
        }
        if (win) win.webContents.send(IPC.AST_EXPLAIN_RESULT, result)
        return result
      }
      const cwd = args.scope || path.dirname(args.filePath)
      const queryFn = createProviderQueryFn(cwd, {
        model: agent.model,
        effort: agent.effort,
        provider: agent.provider,
      })
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

  ipcMain.handle(
    IPC.AST_CHAT,
    async (_e, args: { message: string; scope: string } & AstAgentArgs) => {
      const win = BrowserWindow.getFocusedWindow()
      const { chatAboutCode } = await import('./ast-ai')
      const agent = resolveAstAgent(args)
      if (!agent.provider) {
        const result = {
          text: `No provider found for model "${agent.model}". Choose another AST model in settings.`,
          highlights: [],
          done: true,
        }
        if (win) win.webContents.send(IPC.AST_CHAT_RESULT, result)
        return result
      }
      const queryFn = createProviderQueryFn(args.scope, {
        model: agent.model,
        effort: agent.effort,
        provider: agent.provider,
      })

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
          const lines: string[] = [
            `Files: ${graph.files.length}`,
            `Edges: ${graph.edges.length}`,
            '',
          ]
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
    },
  )
}
