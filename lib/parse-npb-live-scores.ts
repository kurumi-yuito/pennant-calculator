/**
 * NPB 公式トップページ (https://npb.jp/) のヘッダー速報スコアボード
 * (`<div id="header_score">`) を解析する。
 *
 * 当初は月別日程・結果ページ (schedule_<MM>_detail.html) だけで「勝敗表に未反映の
 * 終了済み試合」を検出できる想定だったが、実際には schedule_<MM>_detail.html も
 * 勝敗表と同程度に更新が遅れることがある（2026-09-13 実データで確認）。
 * 一方、トップページのヘッダー速報は当日の試合結果をほぼリアルタイムで反映するため、
 * こちらを「勝敗表・月別日程ページのどちらにもまだ反映されていない、直近の終了済み試合」
 * を拾う補助ソースとして追加する。npb.jp 自身のページであり、他サイトへのフォールバックではない。
 *
 * 速報ボードが表示するのは通常 1 日分（表示中の日付）のカードのみ。日付はカード自身の
 * リンク (/scores/<year>/<MMDD>/...) から取得するため、ヘッダーの日付表示に依存しない。
 *
 * 終了済みの判定は既存の月別日程ページと同じ考え方: 状態欄に「試合終了」の文字列があり、
 * かつスコアが数字で確定しているものだけを finished として扱う。試合中（イニング表示等）・
 * 開始前・中止はいずれも finished 扱いにしない。
 */
import { findTeamByOfficialName } from './teams'
import type { ScheduleRow } from './parse-npb-schedule'

export class LiveScoreParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LiveScoreParseError'
  }
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * トップページの HTML から、ヘッダー速報スコアボードのカードを取り出す。
 *
 * `<div id="header_score">` 自体が見つからない場合はページ構造が想定と異なるため
 * 例外を投げる（他のパーサーと同じく、誤って「試合なし」を返さないようにする）。
 * スコアボード自体は見つかったがカードが 0 件（試合が無い日）は正常な結果として空配列を返す。
 */
export function parseLiveScoreboardHtml(html: string): ScheduleRow[] {
  const containerMatch = html.match(
    /<div id="header_score">([\s\S]*?)<!--\s*試合速報のインクルード取込\s*ここまで\s*-->/,
  )
  if (!containerMatch) {
    throw new LiveScoreParseError('トップページの速報スコアボード (#header_score) が見つかりません')
  }
  const container = containerMatch[1]

  const cardMatches = [
    ...container.matchAll(
      /<div class="score_box">\s*<a href="\/scores\/(\d{4})\/(\d{4})\/[^"]*\/">\s*<div>\s*<img[^>]*alt="([^"]*)"[^>]*class="logo_left">\s*<img[^>]*alt="([^"]*)"[^>]*class="logo_right">\s*<div class="score">([\s\S]*?)<\/div>\s*<div class="state">([\s\S]*?)<\/div>/g,
    ),
  ]

  const rows: ScheduleRow[] = []
  for (const [, year, mmdd, name1, name2, scoreText, stateHtml] of cardMatches) {
    const month = mmdd.slice(0, 2)
    const day = mmdd.slice(2, 4)
    const date = `${year}-${month}-${day}`

    const team1 = findTeamByOfficialName(stripTags(name1))
    const team2 = findTeamByOfficialName(stripTags(name2))
    const teamA = team1?.id ?? null
    const teamB = team2?.id ?? null

    const state = stripTags(stateHtml)
    const scoreMatch = scoreText.match(/^\s*(\d+)\s*-\s*(\d+)\s*$/)

    if (state.includes('中止')) {
      rows.push({ date, teamA, teamB, status: 'cancelled' })
      continue
    }
    if (state.includes('試合終了') && scoreMatch) {
      rows.push({
        date,
        teamA,
        teamB,
        status: 'finished',
        scoreA: Number(scoreMatch[1]),
        scoreB: Number(scoreMatch[2]),
      })
      continue
    }
    // 試合中（イニング表示等）・開始前はいずれも「終了済みではない」として扱う
    rows.push({ date, teamA, teamB, status: 'scheduled' })
  }

  return rows
}
