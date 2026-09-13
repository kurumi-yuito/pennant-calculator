const OG_TITLE = 'Vまであとどのくらい？ | NPB 優勝・CS・5割計算機'
const OG_DESCRIPTION = '好きな球団を選ぶだけ。優勝、CS、勝率5割まであと何勝かを最新順位から計算。'
// 固定 OG 画像（public/og-image.png、scripts/generate-og-image.mjs で生成）
const OG_IMAGE = '/og-image.png'

export default defineNuxtConfig({
  compatibilityDate: '2026-09-01',
  devtools: { enabled: false },
  typescript: {
    strict: true,
  },
  app: {
    head: {
      htmlAttrs: { lang: 'ja' },
      title: OG_TITLE,
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'description', content: OG_DESCRIPTION },
        { name: 'theme-color', content: '#0f172a' },
        { property: 'og:type', content: 'website' },
        { property: 'og:locale', content: 'ja_JP' },
        { property: 'og:site_name', content: 'Vまであとどのくらい？' },
        { property: 'og:title', content: OG_TITLE },
        { property: 'og:description', content: OG_DESCRIPTION },
        { property: 'og:image', content: OG_IMAGE },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: OG_TITLE },
        { name: 'twitter:description', content: OG_DESCRIPTION },
        { name: 'twitter:image', content: OG_IMAGE },
      ],
    },
  },
  nitro: process.env.NITRO_PRESET ? { preset: process.env.NITRO_PRESET } : {},
})
