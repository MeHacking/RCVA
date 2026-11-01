// Copies the web build (dist/, from `npm run build`) into the desktop application
// (electron/web/), which Electron serves and electron-builder packs.
import { cpSync, existsSync, rmSync } from 'node:fs'

const dist = new URL('../dist/', import.meta.url)
const web = new URL('../electron/web/', import.meta.url)

if (!existsSync(new URL('index.html', dist))) {
  console.error('dist/index.html is missing: run `npm run build` first.')
  process.exit(1)
}
rmSync(web, { recursive: true, force: true })
cpSync(dist, web, { recursive: true })
console.log('Copied dist/ to electron/web/.')
