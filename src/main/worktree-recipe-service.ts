import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { cp, mkdir, readdir, readFile, symlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { BrowserWindow } from 'electron'
import { IPC } from '../shared/ipc-channels'
import { log } from '../shared/logger'
import type {
  RecipeStep,
  RecipeStepType,
  SetupCompleteEvent,
  SetupProgressEvent,
  WorktreeRecipe,
} from '../shared/types'
import { getDb } from './db'
import { getProviderForModel } from './providers'

const execFileAsync = promisify(execFile)
const logger = log.child('worktree-recipe')

const STEP_TIMEOUTS: Record<RecipeStepType, number> = {
  install: 120_000,
  copy: 30_000,
  symlink: 5_000,
  run: 60_000,
}

const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.output',
  'target',
  '__pycache__',
  '.venv',
  'venv',
  '.tox',
  'coverage',
  '.cache',
  '.parcel-cache',
  '.turbo',
])

export class WorktreeRecipeService {
  private window: BrowserWindow | null = null

  setWindow(window: BrowserWindow): void {
    this.window = window
  }

  private send(channel: string, data: unknown): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(channel, data)
    }
  }

  // ── CRUD ──────────────────────────────────────

  getRecipe(projectPath: string): WorktreeRecipe | null {
    const db = getDb()
    const row = db
      .prepare('SELECT * FROM worktree_recipes WHERE project_path = ?')
      .get(projectPath) as
      | {
          id: string
          project_path: string
          created_at: number
          updated_at: number
          version: number
        }
      | undefined

    if (!row) return null

    const steps = db
      .prepare('SELECT * FROM worktree_recipe_steps WHERE recipe_id = ? ORDER BY sort_order')
      .all(row.id) as Array<{
      id: string
      recipe_id: string
      sort_order: number
      type: string
      label: string
      command: string | null
      source: string | null
      destination: string | null
      glob: string | null
      optional: number
    }>

    return {
      id: row.id,
      projectPath: row.project_path,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      version: row.version,
      steps: steps.map((s) => ({
        id: s.id,
        type: s.type as RecipeStepType,
        label: s.label,
        command: s.command ?? undefined,
        source: s.source ?? undefined,
        destination: s.destination ?? undefined,
        glob: s.glob ?? undefined,
        optional: s.optional === 1,
      })),
    }
  }

  private saveRecipe(projectPath: string, steps: RecipeStep[]): WorktreeRecipe {
    const db = getDb()
    const id = randomUUID()
    const now = Date.now()

    db.prepare(
      'INSERT INTO worktree_recipes (id, project_path, created_at, updated_at, version) VALUES (?, ?, ?, ?, 1)',
    ).run(id, projectPath, now, now)

    const insertStep = db.prepare(
      'INSERT INTO worktree_recipe_steps (id, recipe_id, sort_order, type, label, command, source, destination, glob, optional) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]
      insertStep.run(
        step.id,
        id,
        i,
        step.type,
        step.label,
        step.command ?? null,
        step.source ?? null,
        step.destination ?? null,
        step.glob ?? null,
        step.optional ? 1 : 0,
      )
    }

    return { id, projectPath, createdAt: now, updatedAt: now, version: 1, steps }
  }

  deleteRecipe(projectPath: string): void {
    const db = getDb()
    const row = db
      .prepare('SELECT id FROM worktree_recipes WHERE project_path = ?')
      .get(projectPath) as { id: string } | undefined
    if (row) {
      db.prepare('DELETE FROM worktree_recipe_steps WHERE recipe_id = ?').run(row.id)
      db.prepare('DELETE FROM worktree_recipes WHERE id = ?').run(row.id)
    }
  }

  // ── Analysis ─────────────────────────────────

  private async gatherProjectContext(projectPath: string): Promise<string> {
    const sections: string[] = []

    // 1. File tree (top 2 levels, excluding build/deps)
    try {
      const tree = await this.scanDirTree(projectPath, 2)
      sections.push(`## File Tree (top 2 levels)\n\`\`\`\n${tree}\n\`\`\``)
    } catch {
      sections.push('## File Tree\n(could not scan)')
    }

    // 2. Package manifests
    const manifests = [
      'package.json',
      'requirements.txt',
      'Pipfile',
      'pyproject.toml',
      'Makefile',
      'Cargo.toml',
      'go.mod',
      'Gemfile',
      'composer.json',
    ]
    for (const name of manifests) {
      const fullPath = join(projectPath, name)
      if (existsSync(fullPath)) {
        try {
          const content = await readFile(fullPath, 'utf-8')
          const truncated =
            content.length > 3000 ? `${content.slice(0, 3000)}\n...(truncated)` : content
          sections.push(`## ${name}\n\`\`\`\n${truncated}\n\`\`\``)
        } catch {
          sections.push(`## ${name}\n(could not read)`)
        }
      }
    }

    // 3. .env file names (not contents)
    try {
      const entries = await readdir(projectPath)
      const envFiles = entries.filter((e) => e.startsWith('.env'))
      if (envFiles.length > 0) {
        sections.push(`## Environment files present\n${envFiles.map((f) => `- ${f}`).join('\n')}`)
      }
    } catch {
      /* ignore */
    }

    // 4. .gitignore
    const gitignorePath = join(projectPath, '.gitignore')
    if (existsSync(gitignorePath)) {
      try {
        const content = await readFile(gitignorePath, 'utf-8')
        const truncated =
          content.length > 2000 ? `${content.slice(0, 2000)}\n...(truncated)` : content
        sections.push(`## .gitignore\n\`\`\`\n${truncated}\n\`\`\``)
      } catch {
        /* ignore */
      }
    }

    // 5. Setup scripts
    const setupFiles = ['setup.sh', 'setup.py', 'init.sh', 'bootstrap.sh']
    for (const name of setupFiles) {
      if (existsSync(join(projectPath, name))) {
        sections.push(`## Setup script: ${name} (exists)`)
      }
    }

    const scriptsDir = join(projectPath, 'scripts')
    if (existsSync(scriptsDir)) {
      try {
        const scripts = await readdir(scriptsDir)
        if (scripts.length > 0) {
          sections.push(`## scripts/ directory\n${scripts.map((s) => `- ${s}`).join('\n')}`)
        }
      } catch {
        /* ignore */
      }
    }

    return sections.join('\n\n')
  }

  private async scanDirTree(dirPath: string, maxDepth: number, depth = 0): Promise<string> {
    if (depth >= maxDepth) return ''
    const entries = await readdir(dirPath, { withFileTypes: true })
    const lines: string[] = []
    const indent = '  '.repeat(depth)

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (EXCLUDED_DIRS.has(entry.name)) continue
      if (entry.name.startsWith('.') && entry.name !== '.env' && !entry.name.startsWith('.env.'))
        continue

      if (entry.isDirectory()) {
        lines.push(`${indent}${entry.name}/`)
        const sub = await this.scanDirTree(join(dirPath, entry.name), maxDepth, depth + 1)
        if (sub) lines.push(sub)
      } else {
        lines.push(`${indent}${entry.name}`)
      }
    }
    return lines.join('\n')
  }

  async analyzeProject(projectPath: string, model?: string): Promise<WorktreeRecipe> {
    this.deleteRecipe(projectPath)

    const context = await this.gatherProjectContext(projectPath)
    const analysisModel = model ?? 'claude-sonnet-4-6'
    const provider = getProviderForModel(analysisModel)
    if (!provider) throw new Error(`No provider found for model: ${analysisModel}`)

    const textSession = provider.createSession({
      cwd: projectPath,
      model: analysisModel,
      effort: 'low',
      permissionMode: 'auto-approve',
      abortController: new AbortController(),
      onPermissionRequest: async () => ({ behavior: 'allow' as const }),
      onQuestionRequest: async () => ({}),
    })

    const systemPrompt = `You are analyzing a project to determine what setup steps are needed when creating a fresh git worktree. A worktree is a clean git checkout — it has all tracked files but no:
- Installed dependencies (node_modules, venv, etc.)
- Environment files (.env, .env.local — these are gitignored)
- Build artifacts or generated code
- Untracked data directories

Analyze the project structure and output ONLY a JSON array of setup steps. Each step must match this schema:

{
  "id": "<unique-id>",
  "type": "install" | "copy" | "symlink" | "run",
  "label": "<human-readable description>",
  "command": "<shell command for install/run types>",
  "source": "<relative path from repo root for copy/symlink types>",
  "destination": "<relative path in worktree for copy/symlink, defaults to same as source>",
  "glob": "<glob pattern for copy type, e.g. '.env*'>",
  "optional": false
}

Step types:
- "install": Run a package manager (bun install, npm install, pip install, etc.)
- "copy": Copy files from the original repo to the worktree (for .env files, data dirs)
- "symlink": Symlink from original repo to worktree (for large dirs you don't want duplicated)
- "run": Run an arbitrary command (prisma generate, make build, codegen, etc.)

Rules:
- Order steps by dependency (install deps before codegen that needs them)
- Use "copy" for .env files (they contain secrets, should not be symlinked)
- Use "symlink" for large data directories to save disk space
- Mark truly optional steps with "optional": true
- Generate unique IDs for each step (use descriptive slugs like "install-deps", "copy-env-local")
- Output ONLY the JSON array, no explanation or markdown

Respond with a valid JSON array. If the project needs no special setup beyond dependency installation, return a minimal array with just the install step.`

    const combinedPrompt = `${systemPrompt}\n\n${context}`

    let responseText = ''
    for await (const event of textSession.sendTextOnly(combinedPrompt)) {
      if (event.type === 'message_complete' && event.role === 'assistant') {
        const textBlock = event.content.find((b) => b.type === 'text')
        if (textBlock && textBlock.type === 'text') {
          responseText = textBlock.text
        }
      }
    }

    const steps = this.parseRecipeSteps(responseText)
    return this.saveRecipe(projectPath, steps)
  }

  private parseRecipeSteps(raw: string): RecipeStep[] {
    let cleaned = raw.trim()
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(cleaned)
    } catch (e) {
      logger.error('Failed to parse recipe JSON:', e)
      return []
    }

    if (!Array.isArray(parsed)) {
      logger.error('Recipe response is not an array')
      return []
    }

    const validTypes = new Set<string>(['install', 'copy', 'symlink', 'run'])
    const steps: RecipeStep[] = []

    for (const item of parsed) {
      if (typeof item !== 'object' || item === null) continue
      const obj = item as Record<string, unknown>

      if (typeof obj.type !== 'string' || !validTypes.has(obj.type)) {
        logger.warn('Skipping step with invalid type:', obj.type)
        continue
      }
      if (typeof obj.label !== 'string' || !obj.label) {
        logger.warn('Skipping step with missing label')
        continue
      }

      steps.push({
        id: typeof obj.id === 'string' && obj.id ? obj.id : randomUUID(),
        type: obj.type as RecipeStepType,
        label: obj.label,
        command: typeof obj.command === 'string' ? obj.command : undefined,
        source: typeof obj.source === 'string' ? obj.source : undefined,
        destination: typeof obj.destination === 'string' ? obj.destination : undefined,
        glob: typeof obj.glob === 'string' ? obj.glob : undefined,
        optional: obj.optional === true,
      })
    }

    return steps
  }

  // ── Execution ────────────────────────────────

  async executeRecipe(
    sessionId: string,
    recipe: WorktreeRecipe,
    worktreePath: string,
    originalPath: string,
    stepIds?: string[],
  ): Promise<SetupCompleteEvent> {
    const stepsToRun = stepIds ? recipe.steps.filter((s) => stepIds.includes(s.id)) : recipe.steps

    const results: SetupCompleteEvent['results'] = []

    for (let i = 0; i < stepsToRun.length; i++) {
      const step = stepsToRun[i]

      this.send(IPC.WORKTREE_SETUP_PROGRESS, {
        sessionId,
        stepId: step.id,
        stepLabel: step.label,
        status: 'running',
        current: i + 1,
        total: stepsToRun.length,
      } satisfies SetupProgressEvent)

      try {
        await this.executeStep(step, worktreePath, originalPath)
        results.push({ stepId: step.id, label: step.label, status: 'done' })

        this.send(IPC.WORKTREE_SETUP_PROGRESS, {
          sessionId,
          stepId: step.id,
          stepLabel: step.label,
          status: 'done',
          current: i + 1,
          total: stepsToRun.length,
        } satisfies SetupProgressEvent)
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        logger.warn(`Step "${step.label}" failed:`, error)
        results.push({ stepId: step.id, label: step.label, status: 'failed', error })

        this.send(IPC.WORKTREE_SETUP_PROGRESS, {
          sessionId,
          stepId: step.id,
          stepLabel: step.label,
          status: 'failed',
          error,
          current: i + 1,
          total: stepsToRun.length,
        } satisfies SetupProgressEvent)
      }
    }

    const nonOptionalFailed = results.some(
      (r) => r.status === 'failed' && !stepsToRun.find((s) => s.id === r.stepId)?.optional,
    )

    const event: SetupCompleteEvent = {
      sessionId,
      success: !nonOptionalFailed,
      results,
    }

    this.send(IPC.WORKTREE_SETUP_COMPLETE, event)
    return event
  }

  private async executeStep(
    step: RecipeStep,
    worktreePath: string,
    originalPath: string,
  ): Promise<void> {
    const timeout = STEP_TIMEOUTS[step.type]

    switch (step.type) {
      case 'install':
      case 'run': {
        if (!step.command) throw new Error(`No command specified for ${step.type} step`)
        const parts = step.command.split(/\s+/)
        const cmd = parts[0]
        const args = parts.slice(1)
        await execFileAsync(cmd, args, { cwd: worktreePath, timeout, shell: true })
        break
      }

      case 'copy': {
        if (!step.source) throw new Error('No source specified for copy step')
        const src = resolve(originalPath, step.source)
        const dest = resolve(worktreePath, step.destination ?? step.source)

        if (!existsSync(src)) throw new Error(`Source not found: ${step.source}`)

        await mkdir(resolve(dest, '..'), { recursive: true })
        await cp(src, dest, { recursive: true })
        break
      }

      case 'symlink': {
        if (!step.source) throw new Error('No source specified for symlink step')
        const src = resolve(originalPath, step.source)
        const dest = resolve(worktreePath, step.destination ?? step.source)

        if (!existsSync(src)) throw new Error(`Source not found: ${step.source}`)

        await mkdir(resolve(dest, '..'), { recursive: true })
        await symlink(src, dest)
        break
      }
    }
  }
}

export const worktreeRecipeService = new WorktreeRecipeService()
