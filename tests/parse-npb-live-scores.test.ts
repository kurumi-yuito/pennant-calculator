import { describe, expect, it } from 'vitest'
import { LiveScoreParseError, parseLiveScoreboardHtml } from '../lib/parse-npb-live-scores'

/**
 * npb.jp トップページ (https://npb.jp/) のヘッダー速報スコアボードを模した最小フィクスチャ。
 * 実際の構造（2026-09-13 実データで確認）に基づく。
 */
function makeTopPageHtml(cards: string): string {
  return `<!DOCTYPE html><html><body>
    <header>
      <div id="header_score">
      <div class="score_wrap">
        <div class="score_box date"><div>2026<br>9/13 Sun.</div></div>
        ${cards}
        <div class="score_box detail hide_sp"><a href="/scores/">&gt;&gt;</a></div>
      </div>
      <div class="score_box detail hide_pc"><a href="/scores/">&gt;&gt;</a></div>
      </div>
      <!-- 試合速報のインクルード取込 ここまで -->
    </header>
  </body></html>`
}

const FINISHED_CARD = `
  <div class="score_box">
    <a href="/scores/2026/0913/db-g-22/">
    <div>
      <img src="/img/common/logo/2026/logo_db_s.gif" alt="横浜DeNAベイスターズ" title="横浜DeNAベイスターズ" class="logo_left">
      <img src="/img/common/logo/2026/logo_g_s.gif" alt="読売ジャイアンツ" title="読売ジャイアンツ" class="logo_right">
      <div class="score">5-0</div>
      <div class="state">（横浜）<br class="hide_pc">試合終了</div>
    </div>
    </a>
  </div>
`

const IN_PROGRESS_CARD = `
  <div class="score_box">
    <a href="/scores/2026/0913/t-d-23/">
    <div>
      <img src="/img/common/logo/2026/logo_t_s.gif" alt="阪神タイガース" title="阪神タイガース" class="logo_left">
      <img src="/img/common/logo/2026/logo_d_s.gif" alt="中日ドラゴンズ" title="中日ドラゴンズ" class="logo_right">
      <div class="score">2-1</div>
      <div class="state">（甲子園）<br class="hide_pc">7回表</div>
    </div>
    </a>
  </div>
`

const NOT_STARTED_CARD = `
  <div class="score_box">
    <a href="/scores/2026/0913/l-f-24/">
    <div>
      <img src="/img/common/logo/2026/logo_l_s.gif" alt="埼玉西武ライオンズ" title="埼玉西武ライオンズ" class="logo_left">
      <img src="/img/common/logo/2026/logo_f_s.gif" alt="北海道日本ハムファイターズ" title="北海道日本ハムファイターズ" class="logo_right">
      <div class="score">&nbsp;</div>
      <div class="state">（ベルーナ）<br class="hide_pc">18:00</div>
    </div>
    </a>
  </div>
`

const CANCELED_CARD = `
  <div class="score_box">
    <a href="/scores/2026/0913/h-m-23/">
    <div>
      <img src="/img/common/logo/2026/logo_h_s.gif" alt="福岡ソフトバンクホークス" title="福岡ソフトバンクホークス" class="logo_left">
      <img src="/img/common/logo/2026/logo_m_s.gif" alt="千葉ロッテマリーンズ" title="千葉ロッテマリーンズ" class="logo_right">
      <div class="score">&nbsp;</div>
      <div class="state">（みずほPayPay）<br class="hide_pc">中止</div>
    </div>
    </a>
  </div>
`

describe('parseLiveScoreboardHtml', () => {
  it('試合終了カードを status: finished・スコア付きで取得する', () => {
    const rows = parseLiveScoreboardHtml(makeTopPageHtml(FINISHED_CARD))
    expect(rows).toEqual([
      { date: '2026-09-13', teamA: 'baystars', teamB: 'giants', status: 'finished', scoreA: 5, scoreB: 0 },
    ])
  })

  it('試合中（イニング表示）は finished 扱いにしない', () => {
    const rows = parseLiveScoreboardHtml(makeTopPageHtml(IN_PROGRESS_CARD))
    expect(rows).toEqual([{ date: '2026-09-13', teamA: 'tigers', teamB: 'dragons', status: 'scheduled' }])
  })

  it('開始前（時刻表示のみ）は finished 扱いにしない', () => {
    const rows = parseLiveScoreboardHtml(makeTopPageHtml(NOT_STARTED_CARD))
    expect(rows).toEqual([{ date: '2026-09-13', teamA: 'lions', teamB: 'fighters', status: 'scheduled' }])
  })

  it('中止カードは status: cancelled でスコア無し', () => {
    const rows = parseLiveScoreboardHtml(makeTopPageHtml(CANCELED_CARD))
    expect(rows).toEqual([{ date: '2026-09-13', teamA: 'hawks', teamB: 'marines', status: 'cancelled' }])
  })

  it('複数カードが混在していても正しく振り分ける', () => {
    const html = makeTopPageHtml([FINISHED_CARD, IN_PROGRESS_CARD, NOT_STARTED_CARD, CANCELED_CARD].join('\n'))
    const rows = parseLiveScoreboardHtml(html)
    expect(rows).toHaveLength(4)
    expect(rows.filter((r) => r.status === 'finished')).toHaveLength(1)
    expect(rows.filter((r) => r.status === 'scheduled')).toHaveLength(2)
    expect(rows.filter((r) => r.status === 'cancelled')).toHaveLength(1)
  })

  it('#header_score が無ければ例外を投げる', () => {
    expect(() => parseLiveScoreboardHtml('<html><body>メンテナンス中</body></html>')).toThrow(LiveScoreParseError)
  })

  it('カードが0件（試合の無い日）は空配列を返す（例外にしない）', () => {
    const rows = parseLiveScoreboardHtml(makeTopPageHtml(''))
    expect(rows).toEqual([])
  })
})
