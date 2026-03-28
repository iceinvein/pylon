/**
 * Grammar manager — handles downloading, caching, and loading tree-sitter WASM grammars.
 * Supports bundled grammars (resources/grammars/), cached grammars (~/.pylon/grammars/),
 * and CDN fallback (jsdelivr).
 */
import * as fs from 'node:fs'
import * as https from 'node:https'
import * as path from 'node:path'
import { log } from '../../shared/logger'

const glog = log.child('grammar-manager')

// Use `any` for web-tree-sitter types since the declared types don't always
// match the runtime API shape in Node/Electron environments.
// biome-ignore lint/suspicious/noExplicitAny: web-tree-sitter dynamic import
let TreeSitterModule: any = null

// biome-ignore lint/suspicious/noExplicitAny: web-tree-sitter dynamic import
async function getTreeSitterModule(): Promise<any> {
  if (!TreeSitterModule) {
    TreeSitterModule = await import('web-tree-sitter')
  }
  return TreeSitterModule
}

// ── CDN base URL ──

const CDN_BASE = 'https://cdn.jsdelivr.net/npm/tree-sitter-wasms@latest/out'

// ── State ──

let cacheDir: string = path.join(process.env.HOME || '~', '.pylon', 'grammars')
let resourceDir: string | null = null
// biome-ignore lint/suspicious/noExplicitAny: web-tree-sitter Parser instance
let parserInstance: any = null
let treeSitterInitialized = false

/** In-memory cache of loaded Language objects keyed by language name. */
// biome-ignore lint/suspicious/noExplicitAny: web-tree-sitter Language objects
const languageCache = new Map<string, any>()

// ── Cache directory ──

export function setCacheDir(dir: string): void {
  cacheDir = dir
}

export function getCacheDir(): string {
  return cacheDir
}

// ── Resource directory (bundled grammars) ──

export function setResourceDir(dir: string): void {
  resourceDir = dir
}

// ── File name helper ──

function wasmFileName(lang: string): string {
  return `tree-sitter-${lang}.wasm`
}

// ── Check if a grammar is cached on disk ──

export function isGrammarCached(lang: string): boolean {
  const cached = path.join(cacheDir, wasmFileName(lang))
  if (fs.existsSync(cached)) return true

  if (resourceDir) {
    const bundled = path.join(resourceDir, wasmFileName(lang))
    if (fs.existsSync(bundled)) return true
  }

  return false
}

// ── Initialize tree-sitter WASM runtime ──

export async function initTreeSitter(): Promise<void> {
  if (treeSitterInitialized) return

  const mod = await getTreeSitterModule()
  // web-tree-sitter exports Parser as both default and named — pick whichever exists
  const Parser = mod.default ?? mod.Parser ?? mod
  await Parser.init()
  parserInstance = new Parser()
  treeSitterInitialized = true
  glog.info('tree-sitter WASM runtime initialized')
}

// ── Get the shared Parser instance ──

// biome-ignore lint/suspicious/noExplicitAny: web-tree-sitter Parser instance
export function getParserInstance(): any {
  if (!parserInstance) {
    throw new Error('tree-sitter not initialized — call initTreeSitter() first')
  }
  return parserInstance
}

// ── Download a file from URL to disk ──

type ProgressCallback = (progress: number) => void

function downloadFile(url: string, dest: string, onProgress?: ProgressCallback): Promise<void> {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(dest)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    const tmpDest = `${dest}.tmp`

    const doRequest = (requestUrl: string, redirectCount: number): void => {
      if (redirectCount > 5) {
        reject(new Error('Too many redirects'))
        return
      }

      https
        .get(requestUrl, (res) => {
          // Handle redirects
          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            doRequest(res.headers.location, redirectCount + 1)
            return
          }

          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} downloading ${requestUrl}`))
            return
          }

          const totalSize = Number.parseInt(res.headers['content-length'] || '0', 10)
          let downloaded = 0

          const file = fs.createWriteStream(tmpDest)
          res.on('data', (chunk: Buffer) => {
            downloaded += chunk.length
            if (onProgress && totalSize > 0) {
              onProgress(downloaded / totalSize)
            }
          })
          res.pipe(file)
          file.on('finish', () => {
            file.close(() => {
              fs.renameSync(tmpDest, dest)
              resolve()
            })
          })
          file.on('error', (err) => {
            fs.unlink(tmpDest, () => {})
            reject(err)
          })
        })
        .on('error', (err) => {
          fs.unlink(tmpDest, () => {})
          reject(err)
        })
    }

    doRequest(url, 0)
  })
}

// ── Load a grammar (bundled → cached → CDN) ──

export async function loadGrammar(
  lang: string,
  onProgress?: ProgressCallback,
  // biome-ignore lint/suspicious/noExplicitAny: web-tree-sitter Language object
): Promise<any | null> {
  const mod = await getTreeSitterModule()
  const Parser = mod.default ?? mod.Parser ?? mod
  const fileName = wasmFileName(lang)

  // 1. Try bundled grammars
  if (resourceDir) {
    const bundledPath = path.join(resourceDir, fileName)
    if (fs.existsSync(bundledPath)) {
      glog.info(`loading bundled grammar: ${bundledPath}`)
      try {
        const language = await Parser.Language.load(bundledPath)
        return language
      } catch (err) {
        glog.warn(`failed to load bundled grammar for ${lang}:`, err)
      }
    }
  }

  // 2. Try cache
  const cachedPath = path.join(cacheDir, fileName)
  if (fs.existsSync(cachedPath)) {
    glog.info(`loading cached grammar: ${cachedPath}`)
    try {
      const language = await Parser.Language.load(cachedPath)
      return language
    } catch (err) {
      glog.warn(`failed to load cached grammar for ${lang}, will re-download:`, err)
      // Remove corrupted cache file
      try {
        fs.unlinkSync(cachedPath)
      } catch {}
    }
  }

  // 3. Download from CDN
  const url = `${CDN_BASE}/${fileName}`
  glog.info(`downloading grammar from CDN: ${url}`)
  try {
    await downloadFile(url, cachedPath, onProgress)
    const language = await Parser.Language.load(cachedPath)
    glog.info(`grammar loaded for ${lang}`)
    return language
  } catch (err) {
    glog.error(`failed to download grammar for ${lang}:`, err)
    return null
  }
}

// ── Load grammar with in-memory caching ──

export async function loadGrammarCached(
  lang: string,
  onProgress?: ProgressCallback,
  // biome-ignore lint/suspicious/noExplicitAny: web-tree-sitter Language object
): Promise<any | null> {
  const cached = languageCache.get(lang)
  if (cached) return cached

  const language = await loadGrammar(lang, onProgress)
  if (language) {
    languageCache.set(lang, language)
  }
  return language
}
