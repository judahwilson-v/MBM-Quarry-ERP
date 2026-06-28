const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  printSilent: (printerName, htmlContent) => ipcRenderer.invoke('print-silent', printerName, htmlContent),
  checkUpdates: () => ipcRenderer.invoke('check-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  // Allow rendering to listen for print events if needed
  onPrintComplete: (callback) => ipcRenderer.on('print-complete', callback),
  onUpdaterEvent: (callback) => ipcRenderer.on('updater-event', (event, data) => callback(data)),
});
