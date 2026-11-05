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
  openGeminiKeys: () => ipcRenderer.invoke('forge:open-gemini-keys'),
  geminiState: () => ipcRenderer.invoke('forge:gemini:state'),
  saveGeminiKey: key => ipcRenderer.invoke('forge:gemini:key', key),
  removeGeminiKey: () => ipcRenderer.invoke('forge:gemini:remove-key'),
  setGeminiModel: model => ipcRenderer.invoke('forge:gemini:model', model),
  refreshGeminiModels: () => ipcRenderer.invoke('forge:gemini:models'),
  testGemini: () => ipcRenderer.invoke('forge:gemini:test'),
  sendGemini: message => ipcRenderer.invoke('forge:gemini:send', message),
  clearGemini: () => ipcRenderer.invoke('forge:gemini:clear'),
  stopGemini: () => ipcRenderer.invoke('forge:gemini:stop'),
  onGeminiEvent: callback => { const listener = (_, data) => callback(data); ipcRenderer.on('forge:gemini:event', listener); return () => ipcRenderer.removeListener('forge:gemini:event', listener); },
  onChange: (callback) => { const listener = (_, data) => callback(data); ipcRenderer.on('forge:change', listener); return () => ipcRenderer.removeListener('forge:change', listener); }
}));
