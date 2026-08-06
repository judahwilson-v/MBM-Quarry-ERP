export const isElectron = () => {
  if (typeof window !== 'undefined' && typeof window.process === 'object' && (window.process as any).type === 'renderer') {
    return true;
  }
  if (typeof process !== 'undefined' && typeof process.versions === 'object' && !!process.versions.electron) {
    return true;
  }
  if (typeof navigator === 'object' && typeof navigator.userAgent === 'string' && navigator.userAgent.indexOf('Electron') >= 0) {
    return true;
  }
  // Check our contextBridge
  if (typeof window !== 'undefined' && window.electron) {
    return true;
  }
  return false;
};

export const printSilently = async (printerName?: string, htmlContent?: string): Promise<{ success: boolean; error?: string }> => {
  if (isElectron() && typeof window !== 'undefined' && window.electron?.printSilent) {
    return await window.electron.printSilent(printerName, htmlContent);
  }
  console.warn("Silent print is only available in the Electron desktop app.");
  return { success: false, error: "Not running in desktop app" };
};
