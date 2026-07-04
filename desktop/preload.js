const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  printSilent: (printerName, htmlContent) => ipcRenderer.invoke('print-silent', printerName, htmlContent),
  checkUpdates: () => ipcRenderer.invoke('check-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: (version) => ipcRenderer.invoke('install-update', version),
  // Allow rendering to listen for events
  onPrintComplete: (callback) => {
    const fn = (event, ...args) => callback(...args);
    ipcRenderer.on('print-complete', fn);
    return () => ipcRenderer.removeListener('print-complete', fn);
  },
  onUpdaterEvent: (callback) => {
    const fn = (event, data) => callback(data);
    ipcRenderer.on('updater-event', fn);
    return () => ipcRenderer.removeListener('updater-event', fn);
  },
});
