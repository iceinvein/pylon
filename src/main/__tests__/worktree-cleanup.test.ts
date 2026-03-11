import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cleanupAllWorktrees, cleanupStaleWorktrees, getWorktreeUsage } from '../worktree-cleanup'

describe('worktree-cleanup', () => {
  let testDir: string

  beforeEach(() => {
    testDir = join(tmpdir(), `pylon-test-${Date.now()}`)
    mkdirSync(join(testDir, 'repo1', 'session-a'), { recursive: true })
    mkdirSync(join(testDir, 'repo1', 'session-b'), { recursive: true })
    mkdirSync(join(testDir, 'repo2', 'session-c'), { recursive: true })
    writeFileSync(join(testDir, 'repo1', 'session-a', 'file.txt'), 'hello')
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  test('getWorktreeUsage returns count and size', async () => {
    const usage = await getWorktreeUsage(testDir)
    expect(usage.count).toBe(3)
    expect(usage.sizeBytes).toBeGreaterThan(0)
  })

  test('getWorktreeUsage returns zero for missing directory', async () => {
    const usage = await getWorktreeUsage('/tmp/nonexistent-pylon-test')
    expect(usage.count).toBe(0)
    expect(usage.sizeBytes).toBe(0)
  })

  test('cleanupAllWorktrees removes all directories', async () => {
    const result = await cleanupAllWorktrees(testDir)
    expect(result.removed).toBe(3)
    expect(result.freedBytes).toBeGreaterThan(0)
    const usage = await getWorktreeUsage(testDir)
    expect(usage.count).toBe(0)
  })

  test('cleanupStaleWorktrees only removes old directories', async () => {
    const oldTime = Date.now() - 10 * 24 * 60 * 60 * 1000
    const oldPath = join(testDir, 'repo1', 'session-a')
    const oldDate = new Date(oldTime)
    utimesSync(oldPath, oldDate, oldDate)

    const result = await cleanupStaleWorktrees(7, testDir)
    expect(result.removed).toBe(1)

    const usage = await getWorktreeUsage(testDir)
    expect(usage.count).toBe(2)
  })
})
