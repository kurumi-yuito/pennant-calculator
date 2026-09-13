/**
 * ShareImageData（lib/share-image.ts の純粋関数が作る描画内容）を
 * Canvas API で 1200×630 の PNG Blob に実描画する。
 *
 * DOM/Canvas に依存するためクライアント専用。
 * - components/ShareImagePanel.vue（「結果を画像にする」単体機能）
 * - pages/index.vue（Xシェア時の画像自動添付。navigator.share が files 添付に
 *   対応する環境でのみ、生成した PNG を共有シートに渡す）
 * の両方から使う共通ロジック。
 */
import type { ShareImageData } from '~/lib/share-image'

const WIDTH = 1200
const HEIGHT = 630

function colorVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

function drawShareImage(canvas: HTMLCanvasElement, data: ShareImageData): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d context を取得できませんでした')

  const bg = colorVar('--bg', '#0f172a')
  const panel = colorVar('--panel', '#1e293b')
  const text = colorVar('--text', '#f8fafc')
  const muted = colorVar('--muted', '#94a3b8')
  const good = colorVar('--good', '#34d399')
  const line = colorVar('--line', '#334155')

  // 背景
  const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT)
  gradient.addColorStop(0, bg)
  gradient.addColorStop(1, panel)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = muted
  ctx.font = '600 28px "Hiragino Sans","Noto Sans JP",sans-serif'
  ctx.fillText('Vまであとどのくらい？', 64, 76)
  ctx.font = '400 22px "Hiragino Sans","Noto Sans JP",sans-serif'
  ctx.fillText('Pennant Calculator', 64, 104)

  // 球団名（長い名前でも文字切れしないよう、事前計算済みのフォントサイズ・行分割を使う）
  ctx.fillStyle = text
  const { fontSize, lines: nameLines } = data.teamNameLayout
  ctx.font = `700 ${fontSize}px "Hiragino Sans","Noto Sans JP",sans-serif`
  let nameY = 190
  for (const nameLine of nameLines) {
    ctx.fillText(nameLine, 64, nameY)
    nameY += fontSize + 8
  }

  // 現在地
  ctx.font = '700 30px "Hiragino Sans","Noto Sans JP",sans-serif'
  ctx.fillStyle = good
  const infoY = nameY + 16
  ctx.fillText(`${data.rankLine}   ${data.recordLine}   ${data.remainingLine}`, 64, infoY)

  // 区切り線
  ctx.strokeStyle = line
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(64, infoY + 28)
  ctx.lineTo(WIDTH - 64, infoY + 28)
  ctx.stroke()

  // 優勝 / CS / 5割の各行
  ctx.textBaseline = 'middle'
  let rowY = infoY + 80
  const rowHeight = 56
  for (const scenarioLine of data.lines) {
    ctx.font = '400 34px "Hiragino Sans","Noto Sans JP",sans-serif'
    ctx.fillStyle = text
    ctx.fillText(`${scenarioLine.icon} ${scenarioLine.label}`, 64, rowY)
    ctx.font = '700 34px "Hiragino Sans","Noto Sans JP",sans-serif'
    ctx.fillStyle = good
    ctx.textAlign = 'right'
    ctx.fillText(scenarioLine.value, WIDTH - 64, rowY)
    ctx.textAlign = 'left'
    rowY += rowHeight
  }

  // フッター
  ctx.textBaseline = 'alphabetic'
  ctx.font = '400 24px "Hiragino Sans","Noto Sans JP",sans-serif'
  ctx.fillStyle = muted
  ctx.fillText(data.asOfLine, 64, HEIGHT - 48)
  ctx.textAlign = 'right'
  ctx.fillStyle = good
  ctx.font = '700 24px "Hiragino Sans","Noto Sans JP",sans-serif'
  ctx.fillText(data.hashtag, WIDTH - 64, HEIGHT - 48)
  ctx.textAlign = 'left'
}

/** ShareImageData を 1200×630 の PNG canvas に描画する（プレビュー表示・保存用に canvas 自体も返す） */
export function renderShareImageCanvas(data: ShareImageData): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  drawShareImage(canvas, data)
  return canvas
}

/** ShareImageData を PNG Blob として生成する */
export async function renderShareImagePng(data: ShareImageData): Promise<Blob> {
  const canvas = renderShareImageCanvas(data)
  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('画像の生成に失敗しました')
  return blob
}
