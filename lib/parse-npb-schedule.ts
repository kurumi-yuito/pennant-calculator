/**
 * NPB 公式サイトの月別日程・結果ページ
 * (https://npb.jp/games/<year>/schedule_<MM>_detail.html) を解析する。
 *
 * 目的は未来の予定ではなく「どの球団同士が何試合終了済みか」を数えること。
 * ここで得た結果を lib/head-to-head.ts が集計し、残り直接対決数を復元する。
 *
 * 1 行 (<tr id="date{MMDD}">) が 1 カードに対応する:
 * - 終了済み: <a href="/scores/...">...<div class="score1">N</div>...<div class="score2">M</div>...</a>
 *   （N, M は数字。引き分けも N === M の数字として表示されるので、通常の完了試合と同じ扱いでよい）
 * - 中止・未再割当: <div class="cancel">中止</div> のような表示になり、スコアが無い。
 *   → 終了済みとして数えない。
 * - 未開催（未来の日程）: <div class="score1">&nbsp;</div> のようにスコアが空欄。
 *   → 終了済みとして数えない。
 * - オールスターゲーム（セ・リーグ選抜 対 パ・リーグ選抜）は 12 球団のいずれにも該当しないため、
 *   構造エラーではなく単純にスキップする。
 */
import { findTeamByOfficialName } from './teams'

export class ScheduleParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ScheduleParseError'
  }
}

export type CompletedGame = {
  /** ISO 日付 (YYYY-MM-DD) */
  date: string
  /** 対戦した 2 球団の id（順不同） */
  teamA: string
  teamB: string
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 1 か月分の日程・結果ページから、終了済みカードの一覧を取り出す。
 * 未来の日程・中止試合はここで除外され、オールスターゲームのような
 * 12 球団に該当しない対戦もスキップされる（構造エラーにはしない）。
 */
export function parseScheduleMonthHtml(html: string, month: number, seasonYear: number): CompletedGame[] {
  const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/)
  if (!tbodyMatch) {
    throw new ScheduleParseError(`${seasonYear}年${month}月の日程ページに本体 (tbody) が見つかりません`)
  }
  const rows = [...tbodyMatch[1].matchAll(/<tr id="date(\d{4})"[^>]*>([\s\S]*?)<\/tr>/g)]
  if (rows.length === 0) {
    throw new ScheduleParseError(`${seasonYear}年${month}月の日程ページに試合行が見つかりません`)
  }

  const games: CompletedGame[] = []
  for (const [, dateSuffix, row] of rows) {
    const team1Match = row.match(/<div class="team1">([\s\S]*?)<\/div>/)
    const team2Match = row.match(/<div class="team2">([\s\S]*?)<\/div>/)
    if (!team1Match || !team2Match) continue // 球団名を含まない行（想定外のレイアウトでも構造全体は壊さない）

    if (/<div class="cancel">/.test(row)) continue // 中止・未再割当

    const scoreMatch = row.match(
      /<div class="score1">(\d+)<\/div>\s*<div class="state">[^<]*<\/div>\s*<div class="score2">(\d+)<\/div>/,
    )
    if (!scoreMatch) continue // 未開催（スコア欄が空欄）

    const team1 = findTeamByOfficialName(stripTags(team1Match[1]))
    const team2 = findTeamByOfficialName(stripTags(team2Match[1]))
    if (!team1 || !team2) continue // オールスターゲーム（セ・リーグ/パ・リーグ選抜）等、12球団以外の対戦

    const month2 = dateSuffix.slice(0, 2)
    const day2 = dateSuffix.slice(2, 4)
    games.push({ date: `${seasonYear}-${month2}-${day2}`, teamA: team1.id, teamB: team2.id })
  }
  return games
}
