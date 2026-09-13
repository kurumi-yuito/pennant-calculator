#!/usr/bin/env node
/**
 * 固定 OG 画像 (public/og-image.png) を生成するスクリプト。
 *
 * 外部の画像ライブラリ（sharp / canvas 等）を追加したくないため、
 * Node 標準の zlib だけを使い、PNG を直接組み立てる小さなラスタライザを自前で書いている。
 * タイトル・説明文は og:title / og:description メタタグ側で表示されるので、
 * この画像自体は「アプリのブランドを一目で伝える」ための単純な図形のみで構成する。
 *
 * 実行:
 *   node scripts/generate-og-image.mjs
 *
 * 出力: public/og-image.png (1200x630)
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const WIDTH = 1200
const HEIGHT = 630

// --- 極小フレームバッファ ------------------------------------------------
const pixels = new Uint8ClampedArray(WIDTH * HEIGHT * 4)

function setPixel(x, y, [r, g, b, a = 255]) {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return
  const i = (y * WIDTH + x) * 4
  if (a >= 255) {
    pixels[i] = r
    pixels[i + 1] = g
    pixels[i + 2] = b
    pixels[i + 3] = 255
    return
  }
  // 単純な over 合成（背景は不透明前提）
  const alpha = a / 255
  pixels[i] = pixels[i] * (1 - alpha) + r * alpha
  pixels[i + 1] = pixels[i + 1] * (1 - alpha) + g * alpha
  pixels[i + 2] = pixels[i + 2] * (1 - alpha) + b * alpha
  pixels[i + 3] = 255
}

function fillRect(x0, y0, w, h, color) {
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) setPixel(x, y, color)
  }
}

function fillRectVGradient(x0, y0, w, h, colorTop, colorBottom) {
  for (let y = y0; y < y0 + h; y += 1) {
    const t = (y - y0) / Math.max(1, h - 1)
    const color = [
      Math.round(colorTop[0] + (colorBottom[0] - colorTop[0]) * t),
      Math.round(colorTop[1] + (colorBottom[1] - colorTop[1]) * t),
      Math.round(colorTop[2] + (colorBottom[2] - colorTop[2]) * t),
      255,
    ]
    for (let x = x0; x < x0 + w; x += 1) setPixel(x, y, color)
  }
}

function fillCircle(cx, cy, radius, color, { antialias = true } = {}) {
  const r2 = radius * radius
  for (let y = Math.floor(cy - radius) - 1; y <= Math.ceil(cy + radius) + 1; y += 1) {
    for (let x = Math.floor(cx - radius) - 1; x <= Math.ceil(cx + radius) + 1; x += 1) {
      const dx = x - cx
      const dy = y - cy
      const d2 = dx * dx + dy * dy
      if (d2 <= r2) {
        setPixel(x, y, color)
      } else if (antialias && d2 <= (radius + 1) * (radius + 1)) {
        const d = Math.sqrt(d2)
        const coverage = Math.max(0, Math.min(1, radius + 1 - d))
        setPixel(x, y, [...color.slice(0, 3), Math.round((color[3] ?? 255) * coverage)])
      }
    }
  }
}

/** 塗りつぶし三角形（符号付き面積によるハーフプレーン判定） */
function fillTriangle(p0, p1, p2, color) {
  const minX = Math.max(0, Math.floor(Math.min(p0[0], p1[0], p2[0])))
  const maxX = Math.min(WIDTH - 1, Math.ceil(Math.max(p0[0], p1[0], p2[0])))
  const minY = Math.max(0, Math.floor(Math.min(p0[1], p1[1], p2[1])))
  const maxY = Math.min(HEIGHT - 1, Math.ceil(Math.max(p0[1], p1[1], p2[1])))
  const sign = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const p = [x + 0.5, y + 0.5]
      const d1 = sign(p0, p1, p)
      const d2 = sign(p1, p2, p)
      const d3 = sign(p2, p0, p)
      const hasNeg = d1 < 0 || d2 < 0 || d3 < 0
      const hasPos = d1 > 0 || d2 > 0 || d3 > 0
      if (!(hasNeg && hasPos)) setPixel(x, y, color)
    }
  }
}

/** 太さ付きの円弧（縫い目の表現に使う簡易ストローク） */
function strokeArc(cx, cy, radius, startDeg, endDeg, thickness, color) {
  const steps = 240
  for (let i = 0; i <= steps; i += 1) {
    const deg = startDeg + ((endDeg - startDeg) * i) / steps
    const rad = (deg * Math.PI) / 180
    const px = cx + radius * Math.cos(rad)
    const py = cy + radius * Math.sin(rad)
    fillCircle(px, py, thickness / 2, color, { antialias: false })
  }
}

// --- 配色（アプリのダークテーマに合わせる） -------------------------------
const BG_TOP = [15, 23, 42] // --bg
const BG_BOTTOM = [30, 41, 59] // --panel
const GOOD = [52, 211, 153] // --good
const OK = [96, 165, 250] // --ok
const WARN = [251, 191, 36] // --warn
const WHITE = [248, 250, 252]

fillRectVGradient(0, 0, WIDTH, HEIGHT, BG_TOP, BG_BOTTOM)

// アクセントの三角形（ペナント / 旗のモチーフ）
fillTriangle([WIDTH - 60, 90], [WIDTH - 60, 320], [WIDTH - 320, 205], [...GOOD, 230])
fillTriangle([WIDTH - 140, 340], [WIDTH - 140, 520], [WIDTH - 360, 430], [...OK, 200])

// ボール（左側）
fillCircle(230, 315, 150, WHITE)
strokeArc(230, 315, 95, 200, 340, 10, [214, 40, 57, 220])
strokeArc(230, 315, 95, 20, 160, 10, [214, 40, 57, 220])

// 下部の3色アクセントバー（優勝 / CS / 5割を象徴）
const barY = HEIGHT - 54
const barH = 14
fillRect(80, barY, 300, barH, GOOD)
fillRect(80 + 300 + 24, barY, 300, barH, OK)
fillRect(80 + (300 + 24) * 2, barY, 300, barH, WARN)

// --- 手書き最小限のドット文字で "NPB" とホームベース型のマークを添える -----
// 5x7 ドットフォント（NPB の3文字のみ）
const FONT = {
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
}
function drawGlyph(ch, x0, y0, scale, color) {
  const rows = FONT[ch]
  if (!rows) return
  for (let ry = 0; ry < rows.length; ry += 1) {
    for (let rx = 0; rx < rows[ry].length; rx += 1) {
      if (rows[ry][rx] === '1') {
        fillRect(x0 + rx * scale, y0 + ry * scale, scale, scale, color)
      }
    }
  }
}
function drawText(text, x0, y0, scale, color, gap = 1) {
  let x = x0
  for (const ch of text) {
    drawGlyph(ch, x, y0, scale, color)
    x += (5 + gap) * scale
  }
}
drawText('NPB', 460, 120, 14, WHITE)
drawGlyph('?', 460, 120 + 7 * 14 + 24, 14, GOOD)

// --- PNG エンコード -------------------------------------------------------
function crc32(buf) {
  let c
  const table = crc32.table ?? (crc32.table = (() => {
    const t = new Uint32Array(256)
    for (let n = 0; n < 256; n += 1) {
      c = n
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      t[n] = c >>> 0
    }
    return t
  })())
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i += 1) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  const idat = deflateSync(raw, { level: 9 })

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const rgbaBuffer = Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength)
const png = encodePng(WIDTH, HEIGHT, rgbaBuffer)

const outPath = fileURLToPath(new URL('../public/og-image.png', import.meta.url))
writeFileSync(outPath, png)
console.log(`wrote ${outPath} (${png.length} bytes)`)
