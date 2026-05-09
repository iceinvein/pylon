type LogLevel = 'debug' | 'info' | 'warn' | 'error'

type Logger = {
  debug: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
  child: (source: string) => Logger
}

type WindowWithApi = {
  api?: { sendLog?: (level: string, source: string, message: string) => void }
}

type ConsoleMethod = 'log' | 'info' | 'warn' | 'error'

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

function writeLog(level: LogLevel, source: string, args: unknown[]): void {
  try {
    ;(window as WindowWithApi).api?.sendLog?.(level, source, formatArgs(args))
  } catch {
    const method: ConsoleMethod = level === 'debug' ? 'log' : level
    console[method](`[${source}]`, ...args)
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

export const log = createLogger('renderer')
