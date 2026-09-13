<script setup lang="ts">
/**
 * 「結果を画像にする」機能。
 *
 * - buildShareImageData()（lib/share-image.ts、純粋関数）で作ったデータを
 *   composables/useShareImagePng.ts（Canvas API）で 1200×630 の PNG に描画する。
 * - 生成した PNG は「画像を保存」（ダウンロード）に加え、
 *   navigator.share / navigator.canShare が画像 File 共有に対応する環境でのみ
 *   「画像を共有」ボタンを表示する。
 * - Xシェア（pages/index.vue）でも同じ描画ロジックを使って画像を自動生成し、
 *   navigator.share 経由で対応環境では画像付きの共有シートを開く。
 */
import { ref } from 'vue'
import { useAnalytics } from '~/composables/useAnalytics'
import { renderShareImageCanvas } from '~/composables/useShareImagePng'
import type { ShareImageData } from '~/lib/share-image'

const props = defineProps<{
  imageData: ShareImageData
  team: string
}>()

const { track } = useAnalytics()
let generatedTeam = ''

const canvasEl = ref<HTMLCanvasElement | null>(null)
const previewUrl = ref<string | null>(null)
const status = ref<'idle' | 'generating' | 'ready' | 'error'>('idle')
const canShareFiles = ref(false)
const fileName = ref('pennant-calculator.png')

async function generate() {
  const team = props.team
  status.value = 'generating'
  try {
    const canvas = renderShareImageCanvas(props.imageData)
    canvasEl.value = canvas

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('画像の生成に失敗しました')
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = URL.createObjectURL(blob)

    const nav = navigator as Navigator & {
      canShare?: (data?: ShareData) => boolean
    }
    if (typeof nav.canShare === 'function') {
      const file = new File([blob], fileName.value, { type: 'image/png' })
      canShareFiles.value = nav.canShare({ files: [file] })
    } else {
      canShareFiles.value = false
    }
    status.value = 'ready'
    generatedTeam = team
    track('share_image_generate', { team })
  } catch {
    status.value = 'error'
  }
}

function download() {
  if (!canvasEl.value) return
  const team = generatedTeam
  canvasEl.value.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName.value
    document.body.appendChild(a)
    a.click()
    track('share_image_download', { team })
    a.remove()
    URL.revokeObjectURL(url)
  }, 'image/png')
}

async function share() {
  if (!canvasEl.value) return
  canvasEl.value.toBlob(async (blob) => {
    if (!blob) return
    try {
      const file = new File([blob], fileName.value, { type: 'image/png' })
      await navigator.share({ files: [file], title: 'Vまであとどのくらい？' })
    } catch {
      // ユーザーによるキャンセル等。エラー表示はしない。
    }
  }, 'image/png')
}
</script>

<template>
  <section class="panel">
    <button type="button" class="primary-button" :disabled="status === 'generating'" @click="generate">
      {{ status === 'ready' ? '画像を再生成' : '結果を画像にする' }}
    </button>

    <p v-if="status === 'error'" class="error">画像の生成に失敗しました。もう一度お試しください。</p>

    <div v-if="status === 'ready' && previewUrl" class="preview">
      <img :src="previewUrl" alt="共有用画像のプレビュー" class="preview-img">
      <div class="actions">
        <button type="button" class="button" @click="download">画像を保存</button>
        <button v-if="canShareFiles" type="button" class="button" @click="share">画像を共有</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.primary-button {
  width: 100%;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--panel-2);
  color: var(--text);
  font-size: 0.95rem;
  font-weight: 600;
}

.primary-button:disabled {
  opacity: 0.6;
}

.error {
  color: var(--bad);
  font-size: 0.85rem;
  margin: 0;
}

.preview {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.preview-img {
  width: 100%;
  border-radius: 10px;
  border: 1px solid var(--line);
  display: block;
}

.actions {
  display: flex;
  gap: 8px;
}

.button {
  flex: 1;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--panel);
  color: var(--text);
  font-size: 0.88rem;
}
</style>
