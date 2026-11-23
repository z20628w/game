import { contextBridge, ipcRenderer } from 'electron'
import type { Profile, Slot, LaunchEvent, CalibrationCheck } from './shared'
contextBridge.exposeInMainWorld('studio', {
  snapshot: () => ipcRenderer.invoke('studio:snapshot'),
  calibrationBegin:(id:string)=>ipcRenderer.invoke('studio:calibration-begin',id),
  calibrationRefresh:(id:string)=>ipcRenderer.invoke('studio:calibration-refresh',id),
  calibrationLaunch:(id:string)=>ipcRenderer.invoke('studio:calibration-launch',id),
  calibrationBind:(id:string,handle:string,title:string)=>ipcRenderer.invoke('studio:calibration-bind',id,handle,title),
  calibrationTest:(id:string,check:CalibrationCheck)=>ipcRenderer.invoke('studio:calibration-test',id,check),
  calibrationEnd:(id:string)=>ipcRenderer.invoke('studio:calibration-end',id),
  scan: (path?: string) => ipcRenderer.invoke('studio:scan', path),
  chooseExecutable: () => ipcRenderer.invoke('studio:choose-executable'),
  importAdapter: () => ipcRenderer.invoke('studio:import-adapter'),
  save: (profile: Profile) => ipcRenderer.invoke('studio:save', profile),
  remove: (id: string) => ipcRenderer.invoke('studio:remove', id),
  importMedia: () => ipcRenderer.invoke('studio:import-media'),
  shortcut: (id: string) => ipcRenderer.invoke('studio:shortcut', id),
  exportAdapter: (id: string) => ipcRenderer.invoke('studio:export-adapter', id),
  launch: (id: string) => ipcRenderer.invoke('studio:launch', id),
  preview: (id: string, slot: Slot) => ipcRenderer.invoke('studio:preview', id, slot),
  previewTheme: (id: string, themeId: string, slot: Slot) => ipcRenderer.invoke('studio:preview-theme', id, themeId, slot),
  openData: () => ipcRenderer.invoke('studio:open-data'),
  onLaunch: (callback: (event: LaunchEvent) => void) => { const listener = (_event: unknown, data: LaunchEvent) => callback(data); ipcRenderer.on('studio:launch-event', listener); return () => ipcRenderer.removeListener('studio:launch-event', listener) }
})
