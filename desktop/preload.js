const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  printSilent: (printerName, htmlContent) => ipcRenderer.invoke('print-silent', printerName, htmlContent),
  checkUpdates: () => ipcRenderer.invoke('check-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: (version) => ipcRenderer.invoke('install-update', version),
  // Allow rendering to listen for print events if needed
  onPrintComplete: (callback) => ipcRenderer.on('print-complete', callback),
  onUpdaterEvent: (callback) => ipcRenderer.on('updater-event', (event, data) => callback(data)),
});
