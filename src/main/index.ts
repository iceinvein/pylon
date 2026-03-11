import { join } from 'node:path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { IPC } from '../shared/ipc-channels'
import { initLogger, log, writeRendererLog } from '../shared/logger'
import { initDatabase } from './db'
import { registerIpcHandlers } from './ipc-handlers'
import { prReviewManager } from './pr-review-manager'
import { sessionManager } from './session-manager'

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    backgroundColor: '#0a0a0f',
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Intercept regular link clicks that would navigate the app away
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // Allow dev server HMR reloads
    if (is.dev && url.startsWith(process.env.ELECTRON_RENDERER_URL ?? '')) return
    event.preventDefault()
    shell.openExternal(url)
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.pylon.app')

  // Initialize logging
  initLogger({ level: is.dev ? 'debug' : 'info' })
  log.info('App starting', { version: app.getVersion(), dev: is.dev })

  // Receive renderer logs
  const validLogLevels = new Set(['debug', 'info', 'warn', 'error'])
  ipcMain.on(
    IPC.LOG_FROM_RENDERER,
    (_e, data: { level: string; source: string; message: string }) => {
      const safeLevel = validLogLevels.has(data.level) ? data.level : 'info'
      writeRendererLog(safeLevel as 'debug' | 'info' | 'warn' | 'error', data.source, data.message)
    },
  )

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  initDatabase()
  registerIpcHandlers()

  // Auto-cleanup stale worktrees (>7 days old)
  import('./worktree-cleanup')
    .then(({ cleanupStaleWorktrees }) => cleanupStaleWorktrees(7))
    .catch((err) => log.warn('Stale worktree cleanup failed:', err))

  const mainWindow = createWindow()
  sessionManager.setWindow(mainWindow)
  prReviewManager.setWindow(mainWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const w = createWindow()
      sessionManager.setWindow(w)
      prReviewManager.setWindow(w)
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', async () => {
  const { unwatchAll } = await import('./git-watcher')
  unwatchAll()
})

process.on('uncaughtException', (err) => {
  log.error('Uncaught exception:', err)
})

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled rejection:', reason)
})
