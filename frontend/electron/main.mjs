// @ts-check
import { app, BrowserWindow, Menu, net, protocol, session, shell } from 'electron'
import { existsSync, statSync } from 'node:fs'
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
const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), 'web')
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
    createWindow()
  })
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
    show: false,
    backgroundColor: '#f5efe6',
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
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
