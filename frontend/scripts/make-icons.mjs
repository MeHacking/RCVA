// Makes the application's icons from branding/logo-source.png (npm run icons):
// - public/favicon.ico (16, 32, 48 px) and public/logo.png (256 px, the sidebar and the
//   desktop window);
// - branding/icon.ico (16 to 256 px) for the Windows installer and RCVA.exe.
// The transparent margin is cut off and the mark centred in a square. Resizing is done by
// Playwright's Chromium (a canvas), so no image library is needed.
/* global document, Image -- the function given to page.evaluate runs in the browser */
import { readFileSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const root = new URL('../', import.meta.url)
const source = readFileSync(new URL('branding/logo-source.png', root))

/** PNG images of the given sizes, square, from the source's visible part. */
async function render(sizes) {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    return await page.evaluate(
      async ({ dataUrl, sizes }) => {
        const image = new Image()
        image.src = dataUrl
        await image.decode()
        const full = document.createElement('canvas')
        full.width = image.width
        full.height = image.height
        const context = full.getContext('2d')
        context.drawImage(image, 0, 0)
        const { data } = context.getImageData(0, 0, image.width, image.height)
        // The visible part: every pixel that is not (almost) transparent.
        let [left, top, right, bottom] = [image.width, image.height, -1, -1]
        for (let y = 0; y < image.height; y++) {
          for (let x = 0; x < image.width; x++) {
            if (data[(y * image.width + x) * 4 + 3] <= 8) continue
            left = Math.min(left, x)
            right = Math.max(right, x)
            top = Math.min(top, y)
            bottom = Math.max(bottom, y)
          }
        }
        // A square around it with 2 % of room on each side.
        const side = Math.max(right - left + 1, bottom - top + 1) * 1.04
        const cx = (left + right + 1) / 2
        const cy = (top + bottom + 1) / 2
        const out = {}
        for (const size of sizes) {
          const canvas = document.createElement('canvas')
          canvas.width = size
          canvas.height = size
          const c = canvas.getContext('2d')
          c.imageSmoothingEnabled = true
          c.imageSmoothingQuality = 'high'
          c.drawImage(full, cx - side / 2, cy - side / 2, side, side, 0, 0, size, size)
          out[size] = canvas.toDataURL('image/png').split(',')[1]
        }
        return out
      },
      { dataUrl: `data:image/png;base64,${source.toString('base64')}`, sizes },
    )
  } finally {
    await browser.close()
  }
}

/** An .ico holding the PNG images as they are (allowed since Windows Vista). */
function ico(pngs) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(pngs.length, 4)
  let offset = 6 + 16 * pngs.length
  const entries = pngs.map(({ size, png }) => {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += png.length
    return entry
  })
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.png)])
}

const SIZES = [16, 24, 32, 48, 64, 128, 256]
const images = await render(SIZES)
const png = (size) => ({ size, png: Buffer.from(images[size], 'base64') })

writeFileSync(new URL('public/favicon.ico', root), ico([16, 32, 48].map(png)))
writeFileSync(new URL('public/logo.png', root), png(256).png)
writeFileSync(new URL('branding/icon.ico', root), ico(SIZES.map(png)))
console.log('Wrote public/favicon.ico, public/logo.png and branding/icon.ico.')
