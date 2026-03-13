import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { BrowserWindow } from 'electron'
import { IPC } from '../shared/ipc-channels'
import type { FindingSeverity, TestFinding } from '../shared/types'
import { getDb } from './db'

type ToolContext = {
  explorationId: string
  cwd: string
  e2eOutputPath: string
  window: BrowserWindow | null
}

export function createReportFindingTool(ctx: ToolContext) {
  return {
    name: 'report_finding',
    description:
      'Report a bug or issue found during exploration. Call this whenever you discover unexpected behavior, visual issues, errors, or potential problems.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short descriptive title' },
        description: { type: 'string', description: 'Detailed description' },
        severity: {
          type: 'string',
          enum: ['critical', 'high', 'medium', 'low', 'info'],
          description: 'Severity level',
        },
        url: { type: 'string', description: 'URL where found' },
        reproduction_steps: {
          type: 'array',
          items: { type: 'string' },
          description: 'Steps to reproduce',
        },
      },
      required: ['title', 'description', 'severity', 'url', 'reproduction_steps'],
    },
    execute: async (args: Record<string, unknown>) => {
      const title = args.title as string
      const description = args.description as string
      const severity = args.severity as FindingSeverity
      const url = args.url as string
      const reproductionSteps = args.reproduction_steps as string[]

      const finding: TestFinding = {
        id: randomUUID(),
        explorationId: ctx.explorationId,
        title,
        description,
        severity,
        url,
        screenshotPath: null,
        reproductionSteps,
        createdAt: Date.now(),
      }

      const db = getDb()
      db.prepare(
        `INSERT INTO test_findings (id, exploration_id, title, description, severity, url, screenshot_path, reproduction_steps, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        finding.id,
        finding.explorationId,
        finding.title,
        finding.description,
        finding.severity,
        finding.url,
        finding.screenshotPath,
        JSON.stringify(finding.reproductionSteps),
        finding.createdAt,
      )

      db.prepare(
        `UPDATE test_explorations SET findings_count = findings_count + 1 WHERE id = ?`,
      ).run(ctx.explorationId)

      const row = db
        .prepare(`SELECT findings_count FROM test_explorations WHERE id = ?`)
        .get(ctx.explorationId) as { findings_count: number } | undefined

      const updatedCount = row?.findings_count ?? 1

      ctx.window?.webContents.send(IPC.TEST_EXPLORATION_UPDATE, {
        explorationId: ctx.explorationId,
        findings: [finding],
        findingsCount: updatedCount,
      })

      return { content: [{ type: 'text', text: `Finding reported: ${title}` }] }
    },
  }
}

export function createSavePlaywrightTestTool(ctx: ToolContext) {
  return {
    name: 'save_playwright_test',
    description:
      "Save a Playwright test file (.spec.ts) to the project's e2e directory. The test should be a complete, runnable Playwright test that can be executed with npx playwright test.",
    inputSchema: {
      type: 'object',
      properties: {
        filename: {
          type: 'string',
          description: 'Test file name (must end with .spec.ts)',
        },
        content: {
          type: 'string',
          description: 'Full Playwright test file content',
        },
      },
      required: ['filename', 'content'],
    },
    execute: async (args: Record<string, unknown>) => {
      const rawFilename = args.filename as string
      const content = args.content as string

      // Sanitize filename to prevent path traversal
      let sanitized = basename(rawFilename).replace(/\.\./g, '')

      // Ensure filename ends with .spec.ts
      if (!sanitized.endsWith('.spec.ts')) {
        sanitized = `${sanitized}.spec.ts`
      }

      const outputDir = join(ctx.cwd, ctx.e2eOutputPath)
      mkdirSync(outputDir, { recursive: true })

      // Handle filename conflicts
      let finalFilename = sanitized
      if (existsSync(join(outputDir, finalFilename))) {
        const base = finalFilename.replace(/\.spec\.ts$/, '')
        let counter = 1
        while (existsSync(join(outputDir, `${base}-${counter}.spec.ts`))) {
          counter++
        }
        finalFilename = `${base}-${counter}.spec.ts`
      }

      const fullPath = join(outputDir, finalFilename)
      writeFileSync(fullPath, content, 'utf-8')

      const relativePath = join(ctx.e2eOutputPath, finalFilename)

      // Update DB
      const db = getDb()
      const row = db
        .prepare(`SELECT generated_test_paths, tests_generated FROM test_explorations WHERE id = ?`)
        .get(ctx.explorationId) as
        | { generated_test_paths: string; tests_generated: number }
        | undefined

      const existingPaths: string[] = row ? JSON.parse(row.generated_test_paths) : []
      existingPaths.push(relativePath)
      const updatedCount = (row?.tests_generated ?? 0) + 1

      db.prepare(
        `UPDATE test_explorations SET generated_test_paths = ?, tests_generated = ? WHERE id = ?`,
      ).run(JSON.stringify(existingPaths), updatedCount, ctx.explorationId)

      ctx.window?.webContents.send(IPC.TEST_EXPLORATION_UPDATE, {
        explorationId: ctx.explorationId,
        generatedTests: [relativePath],
        testsGenerated: updatedCount,
      })

      return { content: [{ type: 'text', text: `Test saved: ${relativePath}` }] }
    },
  }
}
