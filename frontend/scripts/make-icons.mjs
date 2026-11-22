// Makes the application's icons from branding/logo-source.png (npm run icons):
// - public/favicon.ico (16, 32, 48 px) and public/logo.png (256 px, the sidebar and the
//   desktop window);
// - branding/icon.ico (16 to 256 px) for the Windows installer and RCVA.exe.
// The transparent margin is cut off and the mark centred in a square. Resizing is done by
// Playwright's Chromium (a canvas), so no image library is needed.
/* global document, Image, ImageData -- the functions given to page.evaluate run in the browser */
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

/**
 * The logo split by colour, for the sidebar, where it takes the theme's colours (owner,
 * 22.11.2026): the mark is drawn in four flat colours (dark outline, light outline, the box's
 * sides, the arrow). Each pixel is read as a mix of the two nearest of them; each mask holds how
 * much of its colour a pixel has. Added back up (mix-blend-mode: plus-lighter), the four give the
 * logo again, edges included. Returns the masks and the four colours as found in the source.
 */
async function colourMasks(pngBase64) {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    return await page.evaluate(
      async ({ dataUrl, names, seeds }) => {
        const image = new Image()
        image.src = dataUrl
        await image.decode()
        const { width, height } = image
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d')
        context.drawImage(image, 0, 0)
        const { data } = context.getImageData(0, 0, width, height)
        // The four colours: the mean of the opaque pixels nearest to each seed.
        const near = (r, g, b, list) => {
          let best = 0
          let bestD = Infinity
          list.forEach((c, i) => {
            const d = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2
            if (d < bestD) [best, bestD] = [i, d]
          })
          return [best, bestD]
        }
        let palette = seeds
        for (let round = 0; round < 4; round++) {
          const sums = palette.map(() => [0, 0, 0, 0])
          for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] < 250) continue
            const [k] = near(data[i], data[i + 1], data[i + 2], palette)
            sums[k][0] += data[i]
            sums[k][1] += data[i + 1]
            sums[k][2] += data[i + 2]
            sums[k][3]++
          }
          palette = sums.map((s, k) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : palette[k]))
        }
        // Each pixel as the nearest mix of two of them: (1 - t) * a + t * b.
        const masks = names.map(() => new Uint8ClampedArray(width * height * 4))
        for (let p = 0; p < width * height; p++) {
          const i = p * 4
          const alpha = data[i + 3]
          if (alpha === 0) continue
          const px = [data[i], data[i + 1], data[i + 2]]
          let best = { a: 0, b: 0, t: 0, d: Infinity }
          for (let a = 0; a < palette.length; a++) {
            for (let b = a; b < palette.length; b++) {
              const A = palette[a]
              const B = palette[b]
              const v = [B[0] - A[0], B[1] - A[1], B[2] - A[2]]
              const len = v[0] ** 2 + v[1] ** 2 + v[2] ** 2
              const t = len === 0 ? 0 : Math.min(1, Math.max(0, ((px[0] - A[0]) * v[0] + (px[1] - A[1]) * v[1] + (px[2] - A[2]) * v[2]) / len))
              const d = (px[0] - A[0] - t * v[0]) ** 2 + (px[1] - A[1] - t * v[1]) ** 2 + (px[2] - A[2] - t * v[2]) ** 2
              if (d < best.d) best = { a, b, t, d }
            }
          }
          const weights = palette.map(() => 0)
          weights[best.a] += 1 - best.t
          weights[best.b] += best.t
          weights.forEach((w, k) => {
            masks[k][i] = 255
            masks[k][i + 1] = 255
            masks[k][i + 2] = 255
            masks[k][i + 3] = Math.round(alpha * w)
          })
        }
        const out = {}
        names.forEach((name, k) => {
          context.clearRect(0, 0, width, height)
          context.putImageData(new ImageData(masks[k], width, height), 0, 0)
          out[name] = canvas.toDataURL('image/png').split(',')[1]
        })
        const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
        return { masks: out, colours: Object.fromEntries(names.map((name, k) => [name, hex(palette[k])])) }
      },
      {
        dataUrl: `data:image/png;base64,${pngBase64}`,
        names: LOGO_PARTS,
        seeds: [
          [0x30, 0x30, 0x30],
          [0xf0, 0xf0, 0xf0],
          [0xd0, 0xb0, 0x80],
          [0xd0, 0x00, 0x20],
        ],
      },
    )
  } finally {
    await browser.close()
  }
}

/** The colours of the logo, in this order: dark outline, light outline, the box's sides, the arrow. */
const LOGO_PARTS = ['ink', 'light', 'box', 'arrow']

const SIZES = [16, 24, 32, 48, 64, 128, 256]
const images = await render(SIZES)
const png = (size) => ({ size, png: Buffer.from(images[size], 'base64') })

writeFileSync(new URL('public/favicon.ico', root), ico([16, 32, 48].map(png)))
writeFileSync(new URL('public/logo.png', root), png(256).png)
writeFileSync(new URL('branding/icon.ico', root), ico(SIZES.map(png)))
const { masks, colours } = await colourMasks(images[256])
for (const part of LOGO_PARTS) {
  writeFileSync(new URL(`public/logo-${part}.png`, root), Buffer.from(masks[part], 'base64'))
}
console.log('Wrote public/favicon.ico, public/logo.png, public/logo-{ink,light,box,arrow}.png and branding/icon.ico.')
console.log('Colours of the logo (the --logo-* tokens of Višnja):', colours)
