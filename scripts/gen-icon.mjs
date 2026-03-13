/**
 * gen-icon.mjs — generates frontend/public/icon.png
 *
 * Dependency-free: uses only Node.js built-in modules (zlib, fs, path).
 * Run with:  node scripts/gen-icon.mjs
 *
 * Produces a 180×180 PNG with the LANDMAN "L" mark:
 *   Background: pistachio green #8FAF7A
 *   Lettermark: deep olive      #4E5B3C
 */

import { deflateSync } from 'zlib'
import { writeFileSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))

/* ── CRC-32 (required by PNG spec) ───────────────────────────────── */
function makeCrcTable() {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[i] = c
  }
  return t
}
const CRC = makeCrcTable()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/* ── PNG chunk builder ────────────────────────────────────────────── */
function chunk(type, data) {
  const tb = Buffer.from(type, 'ascii')
  const lb = Buffer.allocUnsafe(4);  lb.writeUInt32BE(data.length)
  const cb = Buffer.allocUnsafe(4);  cb.writeUInt32BE(crc32(Buffer.concat([tb, data])))
  return Buffer.concat([lb, tb, data, cb])
}

/* ── PNG encoder ─────────────────────────────────────────────────── */
function buildPNG(w, h, getPixelRGB) {
  // Raw scanlines: 1 filter-byte + w×3 RGB bytes per row
  const raw = Buffer.allocUnsafe(h * (1 + w * 3))
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0               // filter type: None
    for (let x = 0; x < w; x++) {
      const [r, g, b] = getPixelRGB(x, y)
      const o = y * (1 + w * 3) + 1 + x * 3
      raw[o] = r;  raw[o + 1] = g;  raw[o + 2] = b
    }
  }

  const ihdr = Buffer.allocUnsafe(13)
  ihdr.writeUInt32BE(w, 0);  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8   // bit depth
  ihdr[9] = 2   // colour type: RGB
  ihdr[10] = 0  // compression method (deflate)
  ihdr[11] = 0  // filter method
  ihdr[12] = 0  // interlace (none)

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), // PNG signature
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ── Icon pixel function ─────────────────────────────────────────── */
function makeIconPixel(SIZE) {
  const BG = [143, 175, 122]   // #8FAF7A pistachio green
  const FG = [78,  91,  60]    // #4E5B3C deep olive

  // "L" proportions designed at 180×180, scaled to any SIZE:
  //   Vertical stroke : x=[38..76],  y=[18..155]
  //   Horizontal bar  : x=[38..148], y=[117..155]
  //   (Both share the bottom-left corner — no gap in the angle)
  const s   = SIZE / 180
  const vx1 = Math.round(38  * s), vx2 = Math.round(76  * s)
  const vy1 = Math.round(18  * s), vy2 = Math.round(155 * s)
  const hx2 = Math.round(148 * s)
  const hy1 = Math.round(117 * s)

  return (x, y) => {
    const inV = x >= vx1 && x < vx2 && y >= vy1 && y < vy2
    const inH = x >= vx1 && x < hx2 && y >= hy1 && y < vy2
    return (inV || inH) ? FG : BG
  }
}

/* ── Generate & write ────────────────────────────────────────────── */
const SIZE    = 180
const outPath = join(__dir, '..', 'frontend', 'public', 'icon.png')

try { mkdirSync(join(__dir, '..', 'frontend', 'public'), { recursive: true }) } catch {}

writeFileSync(outPath, buildPNG(SIZE, SIZE, makeIconPixel(SIZE)))
console.log(`✓  Generated ${outPath}  (${SIZE}×${SIZE} px, no dependencies)`)
console.log(`   Update index.html apple-touch-icon and manifest.webmanifest to reference /icon.png`)
