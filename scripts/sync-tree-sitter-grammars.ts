import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDir, '..')
const outputDir = path.join(projectRoot, 'resources', 'grammars')

const GRAMMARS = [
  { packageName: 'tree-sitter-rust', fileName: 'tree-sitter-rust.wasm' },
  { packageName: 'tree-sitter-python', fileName: 'tree-sitter-python.wasm' },
  { packageName: 'tree-sitter-go', fileName: 'tree-sitter-go.wasm' },
]

mkdirSync(outputDir, { recursive: true })

for (const grammar of GRAMMARS) {
  const source = require.resolve(`${grammar.packageName}/${grammar.fileName}`)
  const destination = path.join(outputDir, grammar.fileName)

  copyFileSync(source, destination)

  const wasmModule = new WebAssembly.Module(readFileSync(destination))
  const hasDylink0 = WebAssembly.Module.customSections(wasmModule, 'dylink.0').length > 0
  if (!hasDylink0) {
    throw new Error(`${grammar.fileName} is not compatible with web-tree-sitter 0.26.x`)
  }

  console.log(`synced ${grammar.fileName}`)
}
