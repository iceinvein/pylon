import { describe, expect, test } from 'bun:test'

describe('ServerManager', () => {
  describe('findFreePort', () => {
    test('returns the starting port if it is free', async () => {
      const { findFreePort } = await import('../server-manager')
      // Use a high port that's almost certainly free
      const port = await findFreePort(59123)
      expect(port).toBe(59123)
    })

    test('increments port if starting port is taken', async () => {
      const net = await import('node:net')
      // Occupy a port
      const server = net.createServer()
      await new Promise<void>((resolve) => server.listen(59200, resolve))

      try {
        const { findFreePort } = await import('../server-manager')
        const port = await findFreePort(59200)
        expect(port).toBeGreaterThan(59200)
        expect(port).toBeLessThanOrEqual(59210)
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()))
      }
    })

    test('throws after max attempts', async () => {
      const { findFreePort } = await import('../server-manager')
      expect(findFreePort(65536)).rejects.toThrow()
    })
  })

  describe('buildServerCommand', () => {
    test('appends CLI flag for vite framework', async () => {
      const { buildServerCommand } = await import('../server-manager')
      const result = buildServerCommand('bun run dev', { type: 'cli-flag', flag: '--port' }, 3456)
      expect(result.command).toBe('bun run dev -- --port 3456')
      expect(result.env).toEqual({})
    })

    test('sets PORT env var for CRA framework', async () => {
      const { buildServerCommand } = await import('../server-manager')
      const result = buildServerCommand('npm run start', { type: 'env' }, 3456)
      expect(result.command).toBe('npm run start')
      expect(result.env).toEqual({ PORT: '3456' })
    })
  })
})
