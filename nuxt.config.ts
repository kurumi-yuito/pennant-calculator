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
      script: [
        {
          key: 'ga4-loader',
          src: 'https://www.googletagmanager.com/gtag/js?id=G-QYPXN46YN7',
          async: true,
        },
        {
          key: 'ga4-init',
          innerHTML: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-QYPXN46YN7');
          `,
        },
      ],
    },
  },
  // NITRO_PRESET が未指定のときは従来どおり Node 向けにビルドする（ローカル確認・既存の
  // 動作検証はすべてこの経路）。cloudflare* プリセットが指定されたときだけ、Cloudflare
  // Workers（Static Assets）向けの追加設定を足す。アプリ本体のロジックには影響しない。
  nitro: {
    ...(process.env.NITRO_PRESET ? { preset: process.env.NITRO_PRESET } : {}),
    ...(process.env.NITRO_PRESET?.startsWith('cloudflare')
      ? {
          cloudflare: {
            // .output/server/wrangler.json と、プロジェクトルートの
            // .wrangler/deploy/config.json（そこへのポインタ）を自動生成させる。
            // これにより `npx wrangler deploy` をプロジェクトルートでそのまま実行するだけで
            // Nuxt/Nitro のビルド出力（.output/server/index.mjs, .output/public）を
            // 自動検出してデプロイできる。
            deployConfig: true,
            // server/api/standings.get.ts が process.env を参照するため、
            // Workers ランタイムで process が使えるように nodejs_compat を有効化する
            nodeCompat: true,
            // Worker 名を明示する（未指定だと git remote 等から自動生成された名前になり
            // 予測しづらいため）。同名の Cloudflare Pages プロジェクトが別に存在するが、
            // Workers と Pages は別の名前空間なので衝突しない。
            wrangler: {
              name: 'pennant-calculator',
            },
          },
        }
      : {}),
  },
})
