#!/usr/bin/env bun

const USAGE = `Usage: pr-review <subcommand> [args]

Subcommands:
  setup <run-dir> --pr <n>   Pre-flight, fetch PR, create worktree
  serve <run-dir>            Start the HTML server in the background
  dedupe <run-dir>           Merge specialist findings into deduped set
  render <run-dir> <page>    Render progress.html or findings.html
  cleanup <run-dir>          Remove worktree, stop server, archive run
  status <run-dir>           Print highest completed stage
  --list-runs                List archived runs
  --cleanup-run <id>         Delete an archived run
  --help                     Show this message`

type Handler = (args: string[]) => Promise<number> | number

const HANDLERS: Record<string, Handler> = {
  setup: async (args) => {
    const runDir = args[0]
    const prFlag = args.indexOf('--pr')
    const prValue = prFlag !== -1 ? args[prFlag + 1] : undefined
    const repoFlag = args.indexOf('--repo')
    if (!runDir || prFlag === -1 || !prValue) {
      process.stderr.write('setup: missing <run-dir> --pr <n> [--repo <path>]\n')
      return 2
    }
    const prNumber = Number(prValue)
    if (!Number.isFinite(prNumber)) {
      process.stderr.write(`setup: invalid PR number ${prValue}\n`)
      return 2
    }
    const repoPath = (repoFlag !== -1 ? args[repoFlag + 1] : undefined) ?? process.cwd()
    const { runSetup } = await import('../scripts/setup-cmd.ts')
    return runSetup({ runDir, prNumber, repoPath })
  },
  serve: async (args) => {
    const runDir = args[0]
    if (!runDir) {
      process.stderr.write('serve: missing <run-dir>\n')
      return 2
    }
    const idleFlag = args.indexOf('--idle-ms')
    const idleRaw = idleFlag !== -1 ? args[idleFlag + 1] : undefined
    const idleMs = idleRaw !== undefined ? Number(idleRaw) : 30 * 60 * 1000
    if (!Number.isFinite(idleMs) || idleMs <= 0) {
      process.stderr.write(`serve: invalid --idle-ms ${idleRaw}\n`)
      return 2
    }
    const hostFlag = args.indexOf('--host')
    const host = hostFlag !== -1 ? args[hostFlag + 1] : undefined
    const { runServe } = await import('../scripts/serve-cmd.ts')
    return runServe({ runDir, idleMs, host })
  },
  dedupe: async (args) => {
    const runDir = args[0]
    if (!runDir) {
      process.stderr.write('dedupe: missing <run-dir>\n')
      return 2
    }
    const { runDedupe } = await import('../scripts/dedupe-cmd.ts')
    return runDedupe(runDir)
  },
  render: async (args) => {
    const runDir = args[0]
    const page = args[1]
    if (!runDir || (page !== 'progress' && page !== 'findings')) {
      process.stderr.write('render: missing <run-dir> <progress|findings>\n')
      return 2
    }
    const { runRender } = await import('../scripts/render-cmd.ts')
    return runRender(runDir, page)
  },
  cleanup: async () => 0,
  status: async () => 0,
  '--list-runs': async () => 0,
  '--cleanup-run': async () => 0,
}

async function main(argv: string[]): Promise<number> {
  const [sub, ...rest] = argv
  if (sub === '--help' || sub === '-h') {
    process.stdout.write(`${USAGE}\n`)
    return 0
  }
  if (!sub) {
    process.stderr.write(`${USAGE}\n`)
    return 2
  }
  const handler = HANDLERS[sub]
  if (!handler) {
    process.stderr.write(`Unknown subcommand: ${sub}\n${USAGE}\n`)
    return 2
  }
  return await handler(rest)
}

const code = await main(process.argv.slice(2))
process.exit(code)

export {}
