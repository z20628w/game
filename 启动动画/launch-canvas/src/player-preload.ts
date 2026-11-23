import { contextBridge, ipcRenderer } from 'electron'
contextBridge.exposeInMainWorld('player', {
  data: () => ipcRenderer.invoke('player:data'),
  ready: (error?: string) => ipcRenderer.send('player:ready', error),
  finished: () => ipcRenderer.send('player:finished'),
  failed: (error: string) => ipcRenderer.send('player:failed', error),
  onPlay: (callback: () => void) => ipcRenderer.on('player:play', callback),
  onViewport: (callback: (viewport: import('./shared').PlayerViewport) => void) => ipcRenderer.on('player:viewport', (_event, viewport) => callback(viewport)),
  onStatus: (callback: (message: string) => void) => ipcRenderer.on('player:status', (_event, message: string) => callback(message))
})
