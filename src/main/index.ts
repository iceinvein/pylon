import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDatabase } from './db'
import { registerIpcHandlers } from './ipc-handlers'
import { sessionManager } from './session-manager'
import { prReviewManager } from './pr-review-manager'
import { initLogger, log, writeRendererLog } from '../shared/logger'
import { IPC } from '../shared/ipc-channels'

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
  ipcMain.on(IPC.LOG_FROM_RENDERER, (_e, data: { level: string; source: string; message: string }) => {
    writeRendererLog(data.level as any, data.source, data.message)
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  initDatabase()
  registerIpcHandlers()

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

process.on('uncaughtException', (err) => {
  log.error('Uncaught exception:', err)
})

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled rejection:', reason)
})
