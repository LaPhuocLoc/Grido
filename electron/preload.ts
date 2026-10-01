import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { GridoBridge, UpdateState } from '../shared/types'

const bridge: GridoBridge = {
  platform: process.platform,
  pathForFile: (file) => webUtils.getPathForFile(file),
  library: {
    list: () => ipcRenderer.invoke('library:list'),
    pick: () => ipcRenderer.invoke('library:pick'),
    stage: (paths) => ipcRenderer.invoke('library:stage', paths),
    stageBytes: (name, bytes) => ipcRenderer.invoke('library:stageBytes', name, bytes),
    add: (photo) => ipcRenderer.invoke('library:add', photo),
    remove: (ids) => ipcRenderer.invoke('library:remove', ids),
    reveal: (id) => ipcRenderer.invoke('library:reveal', id),
  },
  exportFile: {
    pick: (name) => ipcRenderer.invoke('export:pick', name),
    write: (path, bytes) => ipcRenderer.invoke('export:write', path, bytes),
    reveal: (path) => ipcRenderer.invoke('export:reveal', path),
  },
  app: {
    info: () => ipcRenderer.invoke('app:info'),
    setTheme: (source, dark) => ipcRenderer.send('app:theme', source, dark),
    openDataDir: () => ipcRenderer.invoke('app:openDataDir'),
  },
  updates: {
    check: () => ipcRenderer.invoke('updates:check'),
    install: () => ipcRenderer.invoke('updates:install'),
    onState: (listener) => {
      const handler = (_e: unknown, state: UpdateState) => listener(state)
      ipcRenderer.on('updates:state', handler)
      void ipcRenderer.invoke('updates:state').then(listener)
      return () => ipcRenderer.removeListener('updates:state', handler)
    },
  },
}

contextBridge.exposeInMainWorld('grido', bridge)
