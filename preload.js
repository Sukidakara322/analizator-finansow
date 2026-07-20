const { contextBridge, ipcRenderer } = require('electron');

// Bezpieczny most między interfejsem a systemem plików.
// Interfejs (renderer.js) nie ma bezpośredniego dostępu do Node.js — tylko do tych funkcji.
contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.invoke('data:load'),
  save: (data) => ipcRenderer.invoke('data:save', data),
  getPath: () => ipcRenderer.invoke('data:path'),
  openFolder: () => ipcRenderer.invoke('data:openFolder'),
  exportData: (data) => ipcRenderer.invoke('data:export', data),
  importData: () => ipcRenderer.invoke('data:import')
});
