import { execFileSync } from 'child_process'

// Bun auto-loads .env.local into process.env but doesn't export to shell children.
// This wrapper runs electron-vite build then electron-builder with env vars forwarded.

execFileSync('npx', ['electron-vite', 'build'], { stdio: 'inherit', env: process.env })

const args = process.argv.slice(2)
if (!args.includes('--publish')) {
  args.push('--publish', 'never')
}
execFileSync('npx', ['electron-builder', ...args], { stdio: 'inherit', env: process.env })
