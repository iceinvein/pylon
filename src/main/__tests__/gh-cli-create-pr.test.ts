import { test, expect, describe, mock } from 'bun:test'

// Mock electron and db to avoid Electron runtime dependency in tests
mock.module('electron', () => ({
  app: { getPath: () => '/tmp' },
}))

mock.module('../db', () => ({
  getDb: () => ({
    prepare: () => ({ get: () => undefined }),
  }),
}))

describe('createPullRequest', () => {
  test('should be exported from gh-cli module', async () => {
    const ghCli = await import('../gh-cli')
    expect(typeof ghCli.createPullRequest).toBe('function')
  })
})
