# pennant-calculator — NPB「Vまであとどのくらい？」計算機

NPB 公式の最新勝敗表を取得し、選んだ球団が

- 🏆 優勝
- 🎫 CS 進出（3位以内）
- ⚖️ 勝率5割

に「あと何勝」必要かを表示するモバイル優先の Web アプリ。結果は PNG 画像として保存・共有でき、
X（旧Twitter）向けの投稿文としてシェアすることもできる（対応環境では画像付き。
共有先が確実に X になるとは限らないため、ボタンは宛先を確約しない表記にしている）。

## 使い方

```bash
npm install
npm run dev      # http://localhost:3000
```

球団選択は URL クエリに保持される（例: `/?team=baystars`）。

## スクリプト

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバ |
| `npm run build` | 本番ビルド（`NITRO_PRESET` で Nitro preset を指定可能） |
| `npm test` | ユニットテスト（vitest / ネットワーク不要） |
| `npm run lint` | ESLint |
| `npm run typecheck` | vue-tsc による型チェック |
| `node scripts/generate-og-image.mjs` | 固定 OG 画像 (`public/og-image.png`) を再生成 |

実データでの確認:

```bash
RUN_LIVE=1 npx vitest run tests/live-standings.test.ts
```

## データ取得

- **現在順位・勝敗・勝率・基準日**の取得元は **`https://npb.jp/games/<year>/` の 1 ページのみ**
  （唯一の取得元。他ページへのフォールバックは行わない）。このページに埋め込まれている
  「`<year>`年 勝敗表」（セ・リーグ／パ・リーグの 2 テーブル）から、試合・勝・敗・分・勝率・差、
  およびリーグごとの「○月○日現在」を読み取る（`lib/parse-npb-standings.ts`）。
  旧 `std_c.html` / `std_p.html`（チーム勝敗表ページ）は使用しない。
- **残り直接対決数**は、同じ npb.jp 内の月別日程・結果ページ
  (`https://npb.jp/games/<year>/schedule_<MM>_detail.html`) から、シーズン開幕〜基準日までに
  終了した公式戦カードを集計して復元する（`lib/parse-npb-schedule.ts`、`lib/head-to-head.ts`）。
  NPB 公式以外のデータソースは使用しない。詳細は下記「残り直接対決について」を参照。
- ブラウザから直接叩くと CORS で失敗するため、`server/api/standings.get.ts` 経由で取得する。
- 10 分間はメモリキャッシュを使い、その間は正常表示を返す。
- **取得・解析・残り直接対決の復元検証のいずれかに失敗した場合、古い（期限切れの）データを
  「最新」であるかのように返すことはしない。** 有効なキャッシュが無ければ常に 502 を返し、
  画面には「最新の勝敗表を取得できませんでした。時間を置いて再読み込みしてください。」だけを
  表示する（球団選択 UI・計算結果・過去の順位は一切出さない）。`remainingHeadToHead = null` を
  通常運用の結果として返すこともしない（誤った最短ラインを表示しないため、復元に失敗した
  場合は必ずエラー扱いにする）。
- HTML は正規表現のみで解析する（Cloudflare Workers でも動かせるよう DOM ライブラリ非依存）。
  構造変更・欠損・勝率の不一致を検出したら例外にして、壊れた値を表示しない
  （`lib/parse-npb-standings.ts`、`lib/parse-npb-schedule.ts`、対応するテスト）。

### 残り直接対決について

同一リーグでは各球団ペアの年間対戦数が 25 試合と決まっているため、

```ts
remainingHeadToHead[A][B] = 25 - completedHeadToHead[A][B]
```

として復元している（`lib/head-to-head.ts` の `deriveRemainingHeadToHead()`）。
`completedHeadToHead` は月別日程・結果ページ（`schedule_<MM>_detail.html`）を
シーズン開幕月（3月）から基準日の月まで走査し、スコアが確定している行だけを
「終了済み」としてカウントして作る:

- 引き分け（両者同点）も終了済み 1 試合としてカウントする。
- 中止・未再割当（振替日程が未発表）の試合は終了済みとしてカウントしない。
  「未来の日程表に何試合残っているか」を直接使うのではなく「25 − 終了済み対戦数」で
  逆算しているため、振替日が決まっていない中止試合も自動的に残り試合へ含まれる。
- オールスターゲーム（セ・リーグ選抜 対 パ・リーグ選抜）のような、12 球団のいずれにも
  該当しない対戦はスキップする（構造エラーにはしない）。

復元結果は必ず以下を検証し、満たさない場合は `HeadToHeadError` を投げる（誤った最短ラインを
表示しないよう、null へのフォールバックはしない）:

- 対称性: `remainingHeadToHead[A][B] === remainingHeadToHead[B][A]`
- 値の範囲: `0 <= remainingHeadToHead[A][B] <= 25`
- 143 試合の内訳: `totalRemaining = 143 - games`、
  `leagueRemaining = Σ remainingHeadToHead[team][同リーグの相手]`、
  `externalRemaining = totalRemaining - leagueRemaining`（交流戦など同一リーグの
  順位争いとは直接関係ない残り試合）が **0 以上** であること。

143 試合には交流戦 18 試合が含まれるため、交流戦が終わるまでは
`totalRemaining > leagueRemaining`（＝ `externalRemaining > 0`）となるのが正常な状態であり、
これをエラーとはしない。これにより、開幕直後・交流戦前・交流戦中・交流戦後・シーズン終盤の
どの時期でも同じモデルで扱える（`tests/head-to-head.test.ts` で交流戦前後どちらのケースも
検証している）。

復元した `remainingHeadToHead` は `lib/scenario.ts` にそのまま渡され、直接対決依存
（A が勝てば B が負ける）・Hall 条件 / min-cut による厳密な最短ライン／確定ラインの計算に
利用される。`lib/scenario.ts` 自体は変更していない（brute-force 参照実装との一致は
`tests/scenario*.test.ts` で従来どおり検証済み）。9月12日時点の実データで比較したところ、
残り直接対決を厳密に考慮できるようになったことで、最短ラインの一部が復元前（h2h 不明時の
安全側フォールバック）より正確な値に変わった（例: 巨人の優勝最短ラインが 0 勝 → 1 勝、
ヤクルトの優勝最短ラインが 15 勝 → 16 勝）。確定ライン・消滅判定・5割ラインには影響しない。

## 計算ロジック（`lib/`）

UI から完全に分離した純粋関数。

- `lib/record.ts` — 勝率 = 勝 ÷ (勝 + 敗)。引き分けは分母に含めない。
  順位比較は丸め前の値を整数の交差積で厳密比較し、次に勝利数を見る。表示用に丸めた値では判定しない。
- `lib/scenario.ts` — 優勝 / CS / 5割の必要勝数。
  - **最短ライン**: その勝数を挙げれば、他球団の結果次第で到達しうる最小勝数。
  - **確定ライン**: その勝数を挙げれば、他球団の残り結果がどうなっても到達する最小勝数。
  - 直接対決の依存関係（A が勝てば B が負ける）を残り直接対決表から考慮し、
    集合ごとの最大獲得勝数 / 最低獲得勝数を min-cut（Hall 条件）で評価する。
    通常運用ではこの表は常に既知（月別日程ページから復元済み。詳細は上記
    「残り直接対決について」）。取得・復元に失敗した場合のみ、サーバがエラーとして扱う
    （h2h=null は単体テスト用の安全側フォールバック経路として残っている）。
  - 確定判定では、ライバルが残りの非勝利分をすべて引き分けにできる（＝敗戦が増えない）という
    こちらに最も不利な仮定を置く。誤った「確定」を出さないための安全側の評価。
  - 同率（勝率・勝利数まで並ぶ）は、確定判定では相手有利、最短ライン判定ではこちら有利として扱い、
    画面に「順位決定規定により変動する可能性があります」と注記する。
  - 5割ラインは今後の引き分けを 0 と仮定して `(勝 + N) / (勝 + 敗 + 残り) >= 0.5` の最小 N。
    実際に引き分けが出た場合は敗戦が減るだけなので、この N は常に十分（安全側）。

`tests/brute-force.ts` に総当たりの参照実装を置き、残り試合の少ないリーグで
最短ラインの一致・確定ラインが破られないことを検証している（`tests/scenario*.test.ts`）。

## シェア機能

### 結果画像（PNG）

- `lib/share-image.ts` の `buildShareImageData()` が、現在の順位・優勝/CS/5割の状態を
  「画像に描く内容（文字列の集合）」という純粋なデータへ変換する（Canvas 非依存、単体テスト可能）。
  優勝・CS が消滅していれば「可能性なし」、確定していれば「確定」、確定ラインが存在しなければ
  「確定ラインなし」、5割を既に達成していれば「達成済み」と、状態に応じた文言になる。
  `computeTeamNameLayout()` が球団名の文字数に応じてフォントサイズ・改行を決め、
  長い球団名（例: 「東北楽天ゴールデンイーグルス」）でも文字切れしないようにしている。
- `components/ShareImagePanel.vue` がそのデータを Canvas API で 1200×630 の PNG に実描画する
  （このファイルのみが DOM/Canvas に依存し、クライアント側でのみ実行される）。
  「結果を画像にする」ボタンで生成し、「画像を保存」で PNG をダウンロードできる。
  `navigator.canShare({ files: [...] })` が画像 File 共有に対応する環境でのみ
  「画像を共有」ボタンを表示する（非対応環境では保存のみで正常動作）。

### シェア機能と画像添付について（X（旧Twitter）向け投稿文）

- `lib/share-text.ts` の `buildShareText()` が投稿本文を組み立てる。優勝・CS はそれぞれ
  「確定ラインがあればそれを、無ければ最短ラインを」1行に凝縮して表示する
  （`lib/share-lines.ts` の `buildRankPrimaryLine()`）。
- 球団別ハッシュタグは `lib/team-hashtags.ts` の `TEAM_HASHTAGS` に一元管理。
  投稿文には必須ハッシュタグ `#Vまであとどのくらい` が必ず 1 個、球団別ハッシュタグが必ず 1 個付く
  （`tests/share-text.test.ts` で 12 球団すべてについて `undefined` / `NaN` / `##` が
  発生しないことを検証）。
- 共有 URL には選択中の球団の `?team=` クエリを含める（`buildShareUrl()`）。
- シェアボタン（`pages/index.vue` の `shareResult()`）は、**画像の添付を必須**として扱う
  （可能な環境では常に画像付きで共有する）。**ボタンのラベルに "X" は一切出さない**
  （「シェアする」とだけ表示する）。理由は次のとおり:
  - `navigator.share` が画像 File の共有に対応する環境（主にモバイル）では、
    `composables/useShareImagePng.ts` で結果画像を自動生成し、
    `navigator.share({ files: [...], text })` で OS のネイティブ共有シートに画像とテキストを
    まとめて渡す。この共有シートはブラウザ/OS が表示する標準の仕組みで、
    「どのアプリに渡すか」は常にユーザーが選ぶ。Web サイト側が「X に決め打ちで直接渡す」
    ことは仕様上できないため、この経路では「必ず X に行く」とは言い切れない
    （共有シートで X を選べば画像付きの投稿になるが、それは保証された挙動ではない）。
  - `navigator.share` が無い環境（主にデスクトップブラウザ）では、画像を添付する技術的な
    手段が存在しない（X Web Intent は URL ベースで、画像の事前添付に対応していない）ため、
    その場合に限りテキスト＋URLのみで X Web Intent
    （`https://twitter.com/intent/tweet?text=...&url=...`）を新しいタブに開く
    （この場合は文字どおり X に直接遷移する）。
  - **「X に確実に届くとは限らない」経路と「X に確実に届く」経路の両方をひとつのボタンが
    持つため、ボタンの文言は常にどちらの場合にも嘘にならない、宛先を主張しない表記
    （「シェアする」）に統一している。** 環境によって文言を出し分けることもしない
    （どちらの経路を通っても、ボタンの見た目・文言は変わらない）。
  - ユーザーが共有シートをキャンセルした場合（`AbortError`）は、Web Intent へのフォールバックはしない。
- 「結果を画像にする」パネル（`components/ShareImagePanel.vue`）は上記と同じ描画ロジック
  （`composables/useShareImagePng.ts`）を使う独立した機能で、画像単体の保存や
  X 以外のアプリへの共有にも使える。こちらのボタンも「画像を共有」という、
  宛先を主張しない表記になっている。

## OGP

`nuxt.config.ts` の `app.head` に固定の OGP / Twitter Card メタタグを設定している。

- `og:title` / `twitter:title`: 「Vまであとどのくらい？ | NPB 優勝・CS・5割計算機」
- `og:description` / `twitter:description`: 「好きな球団を選ぶだけ。優勝、CS、勝率5割まで
  あと何勝かを最新順位から計算。」
- `og:image` / `twitter:image`: `/og-image.png`（1200×630 の固定画像）

`public/og-image.png` は `scripts/generate-og-image.mjs` で生成した静的アセット。
外部の画像ライブラリを追加したくないため、Node 標準の `zlib` だけで PNG を直接組み立てる
小さなラスタライザを自前で書いている（球団名などの動的テキストは含まない、固定の
ブランドカード）。デザインを変更したい場合はスクリプトを編集して再実行する。

## 前提

- 2026 年度 NPB 一軍公式戦は 1 球団 143 試合制。残り試合数 = `143 - 消化試合数`。
- 同一リーグ内、1 球団ペアあたりの年間対戦数は 25 試合。
- 試合中の途中経過は使わない（順位表に反映された確定成績のみ）。
- 残り直接対決（直接対決の依存関係）は NPB 公式の月別日程・結果ページから
  「終了済みカード数」を集計して復元する。詳細は上記「残り直接対決について」を参照。

## Cloudflare へのデプロイ

このアプリは `/api/standings` という Nitro server route（SSR API）に依存する SSR アプリのため、
**単純な静的サイトとしては配信できない。** Cloudflare 上では **Workers（Static Assets 付き）**
としてデプロイする（Cloudflare Pages ではない。理由は後述）。

### デプロイ手順

```bash
npx wrangler login   # 初回のみ。このプロジェクトの Cloudflare アカウントにログインする
npm run deploy:cloudflare
```

`deploy:cloudflare` は内部で次の 2 段階を行う（`package.json` 参照）:

1. `NITRO_PRESET=cloudflare_module nuxt build`
   Nitro の `cloudflare-module` プリセットでビルドし、`.output/server/index.mjs`（Worker 本体）と
   `.output/public`（静的アセット。`og-image.png` や `_nuxt/` バンドルを含む）を生成する。
   `nuxt.config.ts` の `nitro.cloudflare` 設定（`deployConfig: true` / `nodeCompat: true` /
   `wrangler.name: 'pennant-calculator'`）により、このとき `.output/server/wrangler.json`
   （実体の Wrangler 設定）と、プロジェクトルートの `.wrangler/deploy/config.json`
   （そこへのポインタ）が自動生成される。この 2 つの設定は `NITRO_PRESET` が
   `cloudflare` で始まる場合にのみ有効になり、通常の `npm run build`（Node 向け）には
   一切影響しない。
2. `wrangler deploy`
   プロジェクトルートで引数なしのまま実行するだけで、上記のポインタ経由で自動的に
   `.output/server/wrangler.json` を検出してデプロイする
   （`npx wrangler deploy` による Nuxt/Nitro の自動検出。`--cwd` や `--config` の指定は不要）。

`server/api/standings.get.ts` が `process.env` を参照するため、`nodejs_compat`
互換フラグを有効化している（未設定だと Workers ランタイム上で `process is not defined` になる）。

### なぜ Cloudflare Pages ではなく Workers なのか

- `pennant-calculator.pages.dev` という名前の Cloudflare **Pages** プロジェクトが既に存在するが、
  GitHub リポジトリを Pages の「Connect to Git」で接続した際の自動ビルドが Nuxt の SSR 出力
  （Nitro server route）に対応しておらず、`/` にアクセスすると本文無しの 404 が返る状態だった
  （`cache-control: no-store` 付きの空レスポンス。ビルド自体は「成功」扱いだが、出力が
  このアプリの実体と合っていない）。
- **Workers と Pages は Cloudflare 上で別の名前空間（別のリソース種別）** なので、
  Worker 名を `pennant-calculator` にしても既存の Pages プロジェクトとは衝突しない
  （デプロイ前に `npx wrangler deployments list --name pennant-calculator` で
  「This Worker does not exist on your account」であることを確認済み）。
- 既存の Pages プロジェクトはそのまま残している（削除は行っていない）。本番 URL としては
  **今回デプロイした Worker 側のみ**を使う。紛らわしければ、Cloudflare ダッシュボードから
  当該 Pages プロジェクトを削除するか、無関係な別用途に転用することを推奨する。

### 本番 URL

```
https://pennant-calculator.mr-y50-0104.workers.dev
```

（アカウントの `workers.dev` サブドメインが変わった場合は `npx wrangler deploy` の出力に
表示される URL を参照。`?team=<球団id>` で球団選択を保持できる — 例:
`https://pennant-calculator.mr-y50-0104.workers.dev/?team=baystars`）
