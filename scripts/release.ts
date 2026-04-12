import { readFileSync, writeFileSync } from 'fs'
import { execFileSync } from 'child_process'
import { resolve } from 'path'

const BUMP_TYPES = ['patch', 'minor', 'major', 'beta'] as const
type BumpType = (typeof BUMP_TYPES)[number]

const pkgPath = resolve(import.meta.dirname, '..', 'package.json')

function readVersion(): string {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
  return pkg.version
}

function writeVersion(version: string): void {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
  pkg.version = version
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
}

function parseVersion(v: string): { major: number; minor: number; patch: number; beta: number | null } {
  const match = v.match(/^(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$/)
  if (!match) throw new Error(`Invalid version: ${v}`)
  return {
    major: parseInt(match[1]),
    minor: parseInt(match[2]),
    patch: parseInt(match[3]),
    beta: match[4] ? parseInt(match[4]) : null,
  }
}

function bump(current: string, type: BumpType): string {
  const v = parseVersion(current)

  switch (type) {
    case 'major':
      return `${v.major + 1}.0.0`
    case 'minor':
      if (v.beta !== null) return `${v.major}.${v.minor}.${v.patch}`
      return `${v.major}.${v.minor + 1}.0`
    case 'patch':
      if (v.beta !== null) return `${v.major}.${v.minor}.${v.patch}`
      return `${v.major}.${v.minor}.${v.patch + 1}`
    case 'beta':
      if (v.beta !== null) return `${v.major}.${v.minor}.${v.patch}-beta.${v.beta + 1}`
      return `${v.major}.${v.minor + 1}.0-beta.1`
  }
}

function generateReleaseNotes(tag: string): string {
  let prevTag: string
  try {
    prevTag = execFileSync('git', ['describe', '--tags', '--abbrev=0', 'HEAD'], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim()
  } catch {
    prevTag = ''
  }

  const range = prevTag ? `${prevTag}..HEAD` : 'HEAD'
  const log = execFileSync('git', ['log', range, '--oneline'], { encoding: 'utf-8' }).trim()

  if (!log) return `Release ${tag}`

  try {
    const notes = execFileSync(
      'claude',
      [
        '-p',
        `Generate concise user-facing release notes for version ${tag} of Pylon (an Electron desktop app for Claude). Group changes by type (Features, Fixes, Improvements). Use bullet points. Do not include commit hashes. Here are the commits:\n\n${log}`,
      ],
      { encoding: 'utf-8', timeout: 60_000 },
    ).trim()
    return notes || `Release ${tag}`
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.log(
      `claude release notes failed (${msg.includes('TIMEOUT') ? 'timeout' : 'error'}): ${msg.slice(0, 120)}`,
    )
    console.log('Falling back to commit log')
    return `## ${tag}\n\n${log}`
  }
}

// --- Main ---

const type = process.argv[2] as BumpType
if (!BUMP_TYPES.includes(type)) {
  console.error(`Usage: bun scripts/release.ts <${BUMP_TYPES.join('|')}>`)
  process.exit(1)
}

const current = readVersion()
const next = bump(current, type)
const tag = `v${next}`

console.log(`${current} -> ${next}`)

console.log('Generating release notes...')
const notes = generateReleaseNotes(tag)

writeVersion(next)
execFileSync('git', ['add', 'package.json'], { stdio: 'inherit' })

const commitMsg = `chore: release ${tag}`
execFileSync('git', ['commit', '-m', commitMsg], { stdio: 'inherit' })
execFileSync('git', ['tag', '-a', tag, '-m', notes], { stdio: 'inherit' })

execFileSync('git', ['push'], { stdio: 'inherit' })
execFileSync('git', ['push', '--tags'], { stdio: 'inherit' })

console.log(`\nReleased ${tag}`)
