import { contextBridge } from 'electron'

// Expose a minimal API surface to the renderer process.
// Extend this as IPC handlers are added to the main process.
const api = {}

contextBridge.exposeInMainWorld('api', api)
