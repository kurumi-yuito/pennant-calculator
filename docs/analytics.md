# GA4 計測

`nuxt.config.ts` で `G-QYPXN46YN7` の gtag.js を非同期に読み込み、初回の
`page_view` は標準の `gtag('config', ...)` に任せる。ルート/query の監視から
`page_view` や追加の `config` は送らない。

## GA4 管理画面の確認

データストリーム → ウェブ → 拡張計測機能 → ページビュー → 詳細設定の
「ブラウザの履歴イベントに基づくページの変更」をオフにする。
これがオンだと GA4 自身が球団選択時の query 変更を `page_view` として送る。
アプリ側の `send_page_view: false` ではこの自動計測は止まらない。
[Google公式のページビュー計測ドキュメント](https://developers.google.com/analytics/devguides/collection/ga4/views)

## 独自イベント

すべて `composables/useAnalytics.ts` の `track` 経由で送信する。
SSR・gtag 未定義・タグの例外時はアプリの処理を妨げない。

| イベント | パラメータ | 発火箇所 |
| --- | --- | --- |
| `team_select` | `team`, `league` | 球団セレクトのユーザー操作（初期query復元では送らない） |
| `result_view` | `team`, `championship_possible`, `cs_possible`, `five_hundred_possible` | mount後/表示更新後の正常な計算結果 |
| `share_image_generate` | `team` | 画像パネルのPNG生成成功時・共有用PNGの自動生成成功時 |
| `share_image_download` | `team` | PNGダウンロード用リンクのクリック時 |
| `share_x_click` | `team` | X Web Intentを開く直前（OS共有シートでは送らない） |
| `api_error` | `endpoint`, `status` | `/api/standings` のエラーをクライアントで観測したとき |

`result_view` は球団slugと選択リーグの順位データをシリアライズしたキーを監視し、
同じデータの再描画・取得時刻だけの更新では連続送信しない。初期queryの結果表示も計測する。
画像保存は、球団を切り替えた後でも保存対象の画像を生成した球団に帰属させる。
`team`, `league`, `endpoint` は必要に応じてGA4のイベントスコープのカスタムディメンションに登録する。

## 検証結果（2026-09-13）

- `npm test`: 88件成功、既存の外部接続用テスト1件は通常設定によりスキップ。
- `npm run lint`、`npm run typecheck`、`npm run build`: 成功。
- `npm run deploy:cloudflare`: 既存Worker `pennant-calculator` の更新成功。
  バージョン: `0b9ae6f4-0bc4-44e0-83ca-a5e543af09bf`。
- 本番: https://pennant-calculator.mr-y50-0104.workers.dev
- Chromium / Playwrightで本番ページを操作し、dataLayerと実際の
  `https://www.google-analytics.com/g/collect` リクエストを確認。
  6種類の独自イベントすべてが送信され、収集先の204応答を確認した。
- GAタグの読み込みは200、非同期scriptは1個、config呼び出しは1回。
- `/api/standings` は200、2リーグのデータを取得。
- 初期query復元時は `result_view` のみ。同じデータの再取得では追加送信なし。
- PNG保存を実行し1200×630の画像を確認。球団切り替え後の既存画像保存も
  元画像の球団を計測。OS共有はAPIをブラウザ内で模擬し、生成イベントのみを確認。
- X Web Intentはブラウザ内でwindow.openを記録し、URLと直前のイベントを確認。
- APIエラーはブラウザ内の通信差し替えで503を再現し、エラー表示と
  `api_error { endpoint: '/api/standings', status: 503 }` のネットワーク送信を確認。
  差し替え解除後の再読み込みで正常復帰。本番APIへの変更はない。
- JavaScriptの実行エラーなし。

管理者による履歴変更計測オフの設定後、本番のChromium検証を再実行した。
球団をbaystarsからhawksへ切り替えても `page_view` は初回の1回のみで、
6種類の独自イベントはすべて送信され、収集先の204応答を確認した。
ページビューの重複に関する残課題は解消済み。
GA4管理画面への接続権限がないため、Realtime/DebugView上の確認は未実施。
