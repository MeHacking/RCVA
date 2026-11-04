// @ts-check
// The page's one way to the desktop: saving what it shows as a PDF file (the results report).
// A sandboxed preload, so CommonJS and only Electron's renderer modules.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('rcvaDesktop', {
  /**
   * Asks where to save, then prints the page (its print styles) into that file.
   * @param {string} name the suggested file name
   * @returns {Promise<string | null>} the saved file, or null when the user cancelled
   */
  savePdf: (name) => ipcRenderer.invoke('rcva:save-pdf', name),
})
