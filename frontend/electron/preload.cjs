// @ts-check
// The page's ways to the desktop: saving what it shows as a PDF file (the results report), and
// the same for a driver on Viber.
// A sandboxed preload, so CommonJS and only Electron's renderer modules.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('rcvaDesktop', {
  /**
   * Asks where to save, then prints the page (its print styles) into that file.
   * @param {string} name the suggested file name
   * @returns {Promise<string | null>} the saved file, or null when the user cancelled
   */
  savePdf: (name) => ipcRenderer.invoke('rcva:save-pdf', name),
  /**
   * Prints the page into a file for Viber, shows it in its folder and opens the driver's chat.
   * @param {string} name the file name
   * @param {string} phone the driver's number, "+381641234567"
   * @returns {Promise<{ path: string; viber: boolean } | null>}
   */
  sendToViber: (name, phone) => ipcRenderer.invoke('rcva:send-viber', name, phone),
})
