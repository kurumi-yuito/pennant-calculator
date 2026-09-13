import { describe, expect, it } from 'vitest'
import { ScheduleParseError, parseScheduleMonthHtml } from '../lib/parse-npb-schedule'

/** 実際のページ構造を模した最小限の月別日程・結果フィクスチャ */
function makeScheduleHtml(rows: string): string {
  return `<!DOCTYPE html><html><body>
    <div id="schedule_detail">
      <table>
        <thead><tr><th>月日</th><th>対戦カード</th></tr></thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  </body></html>`
}

const COMPLETED_ROW = `
  <tr id="date0901" class="">
    <th class="" rowspan="1">9/1（火）</th>
    <td>
      <div class="team1">巨人</div>
      <a href="/scores/2026/0901/g-db-20/">
        <div class="score1">4</div>
        <div class="state">-</div>
        <div class="score2">3</div>
      </a>
      <div class="team2">DeNA</div>
    </td>
  </tr>
`

const TIE_ROW = `
  <tr id="date0902" class="">
    <td>
      <div class="team1">日本ハム</div>
      <a href="/scores/2026/0902/f-h-22/">
        <div class="score1">1</div>
        <div class="state">-</div>
        <div class="score2">1</div>
      </a>
      <div class="team2">ソフトバンク</div>
    </td>
  </tr>
`

const CANCELED_ROW = `
  <tr id="date0906" class="">
    <th class="holiday" rowspan="1">9/6（日）</th>
    <td>
      <div class="team1">ヤクルト</div>
      <a href="/scores/2026/0906/s-d-22/">
        <div class="cancel">中止</div>
      </a>
      <div class="team2">中日</div>
    </td>
  </tr>
`

const FUTURE_ROW = `
  <tr id="date0920" class="">
    <th class="holiday" rowspan="1">9/20（日）</th>
    <td>
      <div class="team1">巨人</div>
      <div class="score1">&nbsp;</div>
      <div class="state">-</div>
      <div class="score2">&nbsp;</div>
      <div class="team2">ヤクルト</div>
    </td>
  </tr>
`

const ALL_STAR_ROW = `
  <tr id="date0728" class="last">
    <th class="" rowspan="1">7/28（火）</th>
    <td>
      <div class="team1">セ・リーグ</div>
      <a href="/scores/2026/0728/cl-pl-01/">
        <div class="score1">5</div>
        <div class="state">-</div>
        <div class="score2">7</div>
      </a>
      <div class="team2">パ・リーグ</div>
    </td>
  </tr>
`

describe('parseScheduleMonthHtml', () => {
  it('終了済みカードを日付・球団id付きで取得する', () => {
    const games = parseScheduleMonthHtml(makeScheduleHtml(COMPLETED_ROW), 9, 2026)
    expect(games).toEqual([{ date: '2026-09-01', teamA: 'giants', teamB: 'baystars' }])
  })

  it('引き分け（両者同点）も終了済み1試合としてカウントする', () => {
    const games = parseScheduleMonthHtml(makeScheduleHtml(TIE_ROW), 9, 2026)
    expect(games).toEqual([{ date: '2026-09-02', teamA: 'fighters', teamB: 'hawks' }])
  })

  it('中止カードは終了済みとしてカウントしない', () => {
    const games = parseScheduleMonthHtml(makeScheduleHtml(CANCELED_ROW), 9, 2026)
    expect(games).toEqual([])
  })

  it('未開催（未来）のカードはカウントしない', () => {
    const games = parseScheduleMonthHtml(makeScheduleHtml(FUTURE_ROW), 9, 2026)
    expect(games).toEqual([])
  })

  it('オールスターゲーム（セ・パ選抜）は構造エラーにせずスキップする', () => {
    const games = parseScheduleMonthHtml(makeScheduleHtml(ALL_STAR_ROW), 7, 2026)
    expect(games).toEqual([])
  })

  it('複数行が混在していても終了済みカードだけを正しく抽出する', () => {
    const html = makeScheduleHtml([COMPLETED_ROW, TIE_ROW, CANCELED_ROW, FUTURE_ROW, ALL_STAR_ROW].join('\n'))
    const games = parseScheduleMonthHtml(html, 9, 2026)
    expect(games).toHaveLength(2)
    expect(games).toContainEqual({ date: '2026-09-01', teamA: 'giants', teamB: 'baystars' })
    expect(games).toContainEqual({ date: '2026-09-02', teamA: 'fighters', teamB: 'hawks' })
  })

  it('tbody が無ければ例外を投げる', () => {
    expect(() => parseScheduleMonthHtml('<html><body>メンテナンス中</body></html>', 9, 2026)).toThrow(
      ScheduleParseError,
    )
  })

  it('試合行が1つも無ければ例外を投げる', () => {
    const html = `<html><body><div id="schedule_detail"><table><tbody></tbody></table></div></body></html>`
    expect(() => parseScheduleMonthHtml(html, 9, 2026)).toThrow(ScheduleParseError)
  })
})
