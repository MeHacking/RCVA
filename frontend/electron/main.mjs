// @ts-check
import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, session, shell } from 'electron'
import { existsSync, statSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// The desktop application (Electron): the same web build as in the browser (web/, copied
// from dist/ by scripts/prepare-desktop.mjs), served from app://rcva/ so the paths of the
// screens (/route-map...) work as on a web server, and IndexedDB, the solver's Web Worker
// and fetch work as on an https page. Data lives in the user's profile (%APPDATA%\RCVA),
// apart from any browser.
//
// The services the application asks (Nominatim, OpenRouteService, OpenStreetMap tiles)
// want to know who asks: in the browser the page's address does that, here the
// application's own User-Agent. Links to other sites open in the default browser.

const ORIGIN = 'app://rcva'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const WEB = path.join(HERE, 'web')
const USER_AGENT = `RCVA/${app.getVersion()} (desktop aplikacija za planiranje utovara i ruta)`

// Tests keep their data apart from the user's.
if (process.env.RCVA_USER_DATA) app.setPath('userData', process.env.RCVA_USER_DATA)

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } },
])

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [window] = BrowserWindow.getAllWindows()
    if (!window) return
    if (window.isMinimized()) window.restore()
    window.focus()
  })
  app.on('window-all-closed', () => app.quit())
  app.whenReady().then(() => {
    session.defaultSession.setUserAgent(USER_AGENT)
    protocol.handle('app', (request) => net.fetch(pathToFileURL(fileFor(request.url)).toString()))
    Menu.setApplicationMenu(null)
    ipcMain.handle('rcva:save-pdf', savePdf)
    ipcMain.handle('rcva:send-viber', sendViber)
    createWindow()
  })
}

/**
 * The results report as a PDF file (electron/preload.cjs): the user picks where, then the
 * page is printed with its print styles. RCVA_PDF_PATH (tests only) skips the dialog.
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {unknown} name the suggested file name
 * @returns {Promise<string | null>} the saved file, or null when cancelled
 */
async function savePdf(event, name) {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window || !event.senderFrame?.url.startsWith(`${ORIGIN}/`)) return null
  const fileName = fileNameOf(name)
  const target =
    process.env.RCVA_PDF_PATH ??
    (
      await dialog.showSaveDialog(window, {
        title: 'Sačuvaj PDF',
        defaultPath: path.join(app.getPath('documents'), fileName),
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      })
    ).filePath
  if (!target) return null
  const pdf = await event.sender.printToPDF({ preferCSSPageSize: true, printBackground: true })
  await writeFile(target, pdf)
  return target
}

/**
 * A driver's PDF for Viber (08.11.2026): Viber has no way for an application to send a file
 * into a chat (only bots, which need the file on the internet), so the page is printed into
 * Documents\RCVA za Viber without asking, the folder opens with the file selected, and Viber
 * opens the chat with the driver, where the user drags the file in. RCVA_VIBER_DIR (tests
 * only) is the folder.
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {unknown} name the file name
 * @param {unknown} phone the driver's number in the international form ("+381641234567")
 * @returns {Promise<{ path: string; viber: boolean } | null>} the file, and whether Viber opened; null for a bad call
 */
async function sendViber(event, name, phone) {
  if (!BrowserWindow.fromWebContents(event.sender) || !event.senderFrame?.url.startsWith(`${ORIGIN}/`)) return null
  if (typeof phone !== 'string' || !/^\+[1-9]\d{7,14}$/.test(phone)) return null
  const folder = process.env.RCVA_VIBER_DIR ?? path.join(app.getPath('documents'), 'RCVA za Viber')
  await mkdir(folder, { recursive: true })
  const target = path.join(folder, fileNameOf(name))
  await writeFile(target, await event.sender.printToPDF({ preferCSSPageSize: true, printBackground: true }))
  shell.showItemInFolder(target)
  // Without Viber, Windows has nothing to open the link with: the page then says to install it.
  const viber = await shell.openExternal(`viber://chat?number=${encodeURIComponent(phone)}`).then(
    () => true,
    () => false,
  )
  return { path: target, viber }
}

/**
 * A file name from the page, without what Windows does not allow.
 * @param {unknown} name
 */
function fileNameOf(name) {
  return `${String(name).replace(/\.pdf$/i, '').replace(/[^\p{L}\p{N}._-]+/gu, '-') || 'rcva'}.pdf`
}

/**
 * A file of the web build; any other path is a screen of the application, so index.html.
 * @param {string} url
 */
function fileFor(url) {
  const file = path.normalize(path.join(WEB, decodeURIComponent(new URL(url).pathname)))
  if (file.startsWith(WEB + path.sep) && existsSync(file) && statSync(file).isFile()) return file
  return path.join(WEB, 'index.html')
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: 'RCVA',
    // The window and taskbar icon when started from the sources; the installed RCVA.exe has it built in.
    icon: path.join(WEB, 'logo.png'),
    show: false,
    backgroundColor: '#f5efe6',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: path.join(HERE, 'preload.cjs'),
    },
  })
  window.once('ready-to-show', () => window.show())
  // New windows (links with target="_blank") and navigation away from the application go to the browser.
  window.webContents.setWindowOpenHandler(({ url }) => {
    openOutside(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(`${ORIGIN}/`)) return
    event.preventDefault()
    openOutside(url)
  })
  window.loadURL(`${ORIGIN}/`)
}

/** @param {string} url */
function openOutside(url) {
  if (/^https?:\/\//.test(url)) shell.openExternal(url)
}
