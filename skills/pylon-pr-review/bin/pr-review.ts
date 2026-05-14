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
  setup: async () => 0,
  serve: async () => 0,
  dedupe: async () => 0,
  render: async () => 0,
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
