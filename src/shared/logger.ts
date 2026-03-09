// fs and path are loaded lazily to avoid Vite browser-externalization errors
// when this module is imported in the renderer process.
let _fs: typeof import('fs') | null = null
let _path: typeof import('path') | null = null

function getFs(): typeof import('fs') {
  if (!_fs) _fs = require('fs')
  return _fs!
}

function getPath(): typeof import('path') {
  if (!_path) _path = require('path')
  return _path!
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

type Logger = {
  debug: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
  child: (source: string) => Logger
}

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }
const LEVEL_LABELS: Record<LogLevel, string> = {
  debug: '[DEBUG]',
  info: '[INFO] ',
  warn: '[WARN] ',
  error: '[ERROR]',
}

const MAX_LOG_SIZE = 10 * 1024 * 1024 // 10 MB
let logFilePath: string | null = null
let logDirReady = false

function getLogDir(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '~'
  return getPath().join(home, '.pylon', 'logs')
}

function ensureLogDir(): void {
  if (logDirReady) return
  const dir = getLogDir()
  const fs = getFs()
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  logFilePath = getPath().join(dir, 'pylon.log')
  logDirReady = true
}

let writeCount = 0
const ROTATION_CHECK_INTERVAL = 100

function rotateIfNeeded(): void {
  if (!logFilePath) return
  if (++writeCount % ROTATION_CHECK_INTERVAL !== 0) return
  try {
    const fs = getFs()
    if (!fs.existsSync(logFilePath)) return
    const stats = fs.statSync(logFilePath)
    if (stats.size >= MAX_LOG_SIZE) {
      const backup = logFilePath + '.1'
      fs.renameSync(logFilePath, backup)
    }
  } catch {
    // Rotation failure is non-fatal
  }
}

function formatArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (a instanceof Error) return `${a.message}\n${a.stack ?? ''}`
      if (typeof a === 'string') return a
      try {
        return JSON.stringify(a)
      } catch {
        return String(a)
      }
    })
    .join(' ')
}

function formatLine(level: LogLevel, source: string, args: unknown[]): string {
  const timestamp = new Date().toISOString()
  const label = LEVEL_LABELS[level]
  const message = formatArgs(args)
  return `${timestamp} ${label} [${source}] ${message}`
}

/** Minimum level for output. Set via initLogger or defaults to 'debug' in dev, 'info' in prod. */
let minLevel: number = 0

let _isRenderer: boolean | null = null
function isRenderer(): boolean {
  if (_isRenderer === null) {
    _isRenderer = typeof window !== 'undefined' && typeof (window as any).api?.sendLog === 'function'
  }
  return _isRenderer
}

function writeLog(level: LogLevel, source: string, args: unknown[]): void {
  if (LEVELS[level] < minLevel) return

  // Renderer process — forward over IPC
  if (isRenderer()) {
    try {
      ;(window as any).api.sendLog(level, source, formatArgs(args))
    } catch {
      // Fallback to console if IPC unavailable
      const method = level === 'debug' ? 'log' : level
      ;(console as any)[method](`[${source}]`, ...args)
    }
    return
  }

  // Main process — write to stdout + file
  const line = formatLine(level, source, args)

  // Stdout
  const method = level === 'debug' ? 'log' : level
  ;(console as any)[method](line)

  // File
  try {
    ensureLogDir()
    rotateIfNeeded()
    if (logFilePath) {
      getFs().appendFileSync(logFilePath, line + '\n')
    }
  } catch {
    // File write failure is non-fatal
  }
}

function createLogger(source: string): Logger {
  return {
    debug: (...args: unknown[]) => writeLog('debug', source, args),
    info: (...args: unknown[]) => writeLog('info', source, args),
    warn: (...args: unknown[]) => writeLog('warn', source, args),
    error: (...args: unknown[]) => writeLog('error', source, args),
    child: (childSource: string) => createLogger(`${source}/${childSource}`),
  }
}

/** Call once in main process bootstrap to set log directory and minimum level. */
export function initLogger(options?: { level?: LogLevel }): void {
  if (options?.level) {
    minLevel = LEVELS[options.level]
  }
  ensureLogDir()
}

/** Write a log entry from the renderer (called by IPC handler in main). */
export function writeRendererLog(level: LogLevel, source: string, message: string): void {
  writeLog(level, `renderer/${source}`, [message])
}

/** Root logger instance. Use `log.child('name')` for scoped loggers. */
export const log = createLogger('main')
