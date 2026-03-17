import { type ChildProcess, spawn } from 'node:child_process'
import { createConnection } from 'node:net'
import { log } from '../shared/logger'
import type { PortOverrideMethod, ProjectScan } from '../shared/types'

const logger = log.child('server-manager')

const MAX_PORT_ATTEMPTS = 11
const HEALTH_CHECK_INITIAL_MS = 500
const HEALTH_CHECK_MAX_MS = 4000
const HEALTH_CHECK_TIMEOUT_MS = 30_000
const KILL_TIMEOUT_MS = 5000

type ManagedServer = {
  refCount: number
  port: number
  process: ChildProcess
  url: string
}

class ServerManager {
  private servers = new Map<string, ManagedServer>()

  /**
   * Start (or reuse) a dev server for the given project.
   * Returns the URL the server is listening on.
   * Increments refCount — caller MUST call release() when done.
   */
  async acquire(cwd: string, scan: ProjectScan): Promise<{ url: string; port: number }> {
    const existing = this.servers.get(cwd)
    if (existing) {
      existing.refCount++
      logger.info(`Reusing server for ${cwd} (refCount=${existing.refCount})`)
      return { url: existing.url, port: existing.port }
    }

    logger.info(
      `acquire: devCommand=${scan.devCommand}, detectedPort=${scan.detectedPort}, portOverride=${JSON.stringify(scan.portOverrideMethod)}`,
    )

    if (!scan.devCommand) {
      throw new Error('No dev command detected. Use manual server mode instead.')
    }

    const port = await findFreePort(scan.detectedPort ?? 3000)
    logger.info(`findFreePort(${scan.detectedPort ?? 3000}) => ${port}`)
    const overrideMethod = scan.portOverrideMethod ?? { type: 'env' as const }
    const { command, env } = buildServerCommand(scan.devCommand, overrideMethod, port)

    logger.info(`Starting server: ${command} (port ${port})`)

    const child = spawn(command, [], {
      cwd,
      env: { ...process.env, ...env },
      stdio: 'pipe',
      shell: true,
    })

    child.stdout?.on('data', (chunk: Buffer) => {
      logger.info(`[server:${port}:stdout] ${chunk.toString().trim()}`)
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      logger.info(`[server:${port}:stderr] ${chunk.toString().trim()}`)
    })
    child.on('error', (err) => {
      logger.error(`[server:${port}] spawn error: ${err.message}`)
    })
    child.on('exit', (code, signal) => {
      logger.info(`[server:${port}] exited: code=${code}, signal=${signal}`)
    })

    const url = `http://localhost:${port}`

    // Wait for server to be ready — check both IPv4 and IPv6 to handle
    // servers that bind to either address family
    await waitForServer(port, child)

    const managed: ManagedServer = { refCount: 1, port, process: child, url }
    this.servers.set(cwd, managed)

    logger.info(`Server ready at ${url}`)
    return { url, port }
  }

  /**
   * Decrement refCount for a project's server.
   * Stops the server when refCount reaches 0.
   */
  release(cwd: string): void {
    const server = this.servers.get(cwd)
    if (!server) return

    server.refCount--
    logger.info(`Released server for ${cwd} (refCount=${server.refCount})`)

    if (server.refCount <= 0) {
      this.killServer(cwd, server)
    }
  }

  /** Kill all managed servers. Called on app quit. */
  killAll(): void {
    for (const [cwd, server] of this.servers) {
      this.killServer(cwd, server)
    }
  }

  private killServer(cwd: string, server: ManagedServer): void {
    logger.info(`Stopping server on port ${server.port}`)
    this.servers.delete(cwd)

    try {
      server.process.kill('SIGTERM')
    } catch {
      // already dead
    }

    // Force-kill after timeout
    setTimeout(() => {
      try {
        if (!server.process.killed) {
          server.process.kill('SIGKILL')
        }
      } catch {
        // already dead
      }
    }, KILL_TIMEOUT_MS)
  }
}

// ── Exported helpers (also used in tests) ──

/**
 * Build a shell command with port override.
 *
 * NOTE: The `--` separator before the flag is required because `devCommand`
 * is typically an npm/bun script (e.g. `bun run dev`). The `--` passes
 * subsequent args through to the underlying tool (vite, next, etc.).
 * If the devCommand runs the tool directly (e.g. `vite`), the extra `--`
 * is harmless — most CLI parsers ignore it.
 */
export function buildServerCommand(
  devCommand: string,
  overrideMethod: PortOverrideMethod,
  port: number,
): { command: string; env: Record<string, string> } {
  if (overrideMethod.type === 'cli-flag') {
    return {
      command: `${devCommand} -- ${overrideMethod.flag} ${port}`,
      env: {},
    }
  }
  return {
    command: devCommand,
    env: { PORT: String(port) },
  }
}

export async function findFreePort(startPort: number): Promise<number> {
  for (let i = 0; i < MAX_PORT_ATTEMPTS; i++) {
    const port = startPort + i
    if (port > 65535) break
    const inUse = await checkPort(port)
    if (!inUse) return port
  }
  throw new Error(
    `Could not find a free port starting from ${startPort} (tried ${MAX_PORT_ATTEMPTS} ports)`,
  )
}

/**
 * Check if a port is in use on BOTH IPv4 (127.0.0.1) and IPv6 (::1).
 *
 * On modern macOS/Linux, `localhost` may resolve to `::1` first.
 * Tools like Vite bind to `localhost` which means `::1` — so a check
 * against only `127.0.0.1` would miss them (ECONNREFUSED), wrongly
 * reporting the port as free. We check both address families.
 */
async function checkPort(port: number): Promise<boolean> {
  const [v4, v6] = await Promise.all([
    checkPortOnHost(port, '127.0.0.1'),
    checkPortOnHost(port, '::1'),
  ])
  return v4 || v6
}

function checkPortOnHost(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const conn = createConnection({ port, host })
    conn.on('connect', () => {
      conn.destroy()
      resolve(true)
    })
    conn.on('error', () => resolve(false))
    conn.setTimeout(500, () => {
      conn.destroy()
      resolve(false)
    })
  })
}

/**
 * Wait for a server to become ready on the given port.
 *
 * Checks both IPv4 and IPv6 loopback addresses since the server
 * may bind to either. Uses explicit IP addresses to avoid accidentally
 * connecting to a DIFFERENT server on localhost via DNS resolution.
 */
async function waitForServer(port: number, child: ChildProcess): Promise<void> {
  const start = Date.now()
  let delay = HEALTH_CHECK_INITIAL_MS
  const urls = [`http://127.0.0.1:${port}`, `http://[::1]:${port}`]

  while (Date.now() - start < HEALTH_CHECK_TIMEOUT_MS) {
    // Check if child process died
    if (child.exitCode !== null) {
      throw new Error(`Dev server exited with code ${child.exitCode} before becoming ready`)
    }

    // Try both IPv4 and IPv6 — server is ready if either responds
    const results = await Promise.allSettled(
      urls.map((url) =>
        fetch(url, { signal: AbortSignal.timeout(2000) }).then((r) => ({
          ok: r.ok || r.status < 500,
        })),
      ),
    )

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.ok) {
        return // Server is ready
      }
    }

    await new Promise((resolve) => setTimeout(resolve, delay))
    delay = Math.min(delay * 2, HEALTH_CHECK_MAX_MS)
  }

  throw new Error(
    `Dev server did not respond on port ${port} within ${HEALTH_CHECK_TIMEOUT_MS / 1000}s`,
  )
}

export const serverManager = new ServerManager()
