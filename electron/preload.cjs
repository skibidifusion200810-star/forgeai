const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('forge', Object.freeze({
  state: () => ipcRenderer.invoke('forge:state'),
  connect: () => ipcRenderer.invoke('forge:connect'),
  disconnect: () => ipcRenderer.invoke('forge:disconnect'),
  listTools: () => ipcRenderer.invoke('forge:tools'),
  execute: (name, args) => ipcRenderer.invoke('forge:execute', name, args),
  selectStudio: (id) => ipcRenderer.invoke('forge:select-studio', id),
  installClaude: () => ipcRenderer.invoke('forge:install-claude'),
  openClaude: () => ipcRenderer.invoke('forge:open-claude'),
  onChange: (callback) => { const listener = (_, data) => callback(data); ipcRenderer.on('forge:change', listener); return () => ipcRenderer.removeListener('forge:change', listener); }
}));
