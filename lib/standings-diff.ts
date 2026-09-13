/**
 * NPB 公式の勝敗表 (https://npb.jp/games/<year>/) は、当日試合終了後もしばらく
 * 前日時点（またはそれ以前）のまま更新されないことがある。一方で同じ npb.jp 内の
 * 月別日程・結果ページ (schedule_<MM>_detail.html) には、終了済み試合がより早く反映される。
 *
 * ここでは、勝敗表の基準日（sourceAsOfDate）より後・基準日（throughDate、通常は
 * JST の「今日」）以下の終了済み試合を勝敗表へ差分適用し、games/wins/losses/ties/
 * winningPercentage/順位/ゲーム差を再構築する純粋関数を提供する。
 *
 * 二重加算防止: game.date > sourceAsOfDate の試合のみを対象にする
 * （sourceAsOfDate と同日以前の試合は、勝敗表側で既に反映済みとみなして加算しない）。
 *
 * リーグ跨ぎ（交流戦）: この関数は 1 リーグ分の teams だけを受け取り、
 * 試合の 2 球団のうち「このリーグに属する側」だけを更新する。交流戦のカードは
 * 両リーグそれぞれに対してこの関数を呼ぶことで、両球団に正しく反映される
 * （呼び出し側は server/api/standings.get.ts）。
 *
 * 順位の並び替えは既存の lib/record.ts の compareForRank をそのまま再利用し、
 * ここで新たな順位決定規定（同率時の公式タイブレークルール等）は実装しない。
 */
import { compareForRank, gamesBehind as computeGamesBehind, winningPercentage } from './record'
import type { TeamStanding } from './types'
import type { ScheduleRow } from './parse-npb-schedule'

export type FinishedGame = {
  date: string
  teamA: string
  teamB: string
  scoreA: number
  scoreB: number
}

export type StandingsDiffResult = {
  /** 差分適用後、compareForRank で再ソート済みの球団一覧 */
  teams: TeamStanding[]
  /** 実際に反映できた最新日付。差分が無ければ sourceAsOfDate と同じ */
  effectiveAsOfDate: string
}

/**
 * 複数ソース（月別日程・結果ページ、npb.jp トップページの速報スコアボード等）から得た
 * ScheduleRow[] を、(日付, 対戦カード) をキーに 1 つにまとめる。
 *
 * 月別日程ページは、その日の試合が未終了でも「スコア欄が空欄のカード（status: scheduled）」
 * を必ず持っている（実データで確認: 9/13 分のカードは、勝敗表・月別日程ページの双方が
 * 9/12時点のまま更新されておらず score が空欄だった）。単純に「base に同じキーがあれば
 * 常に base を採用する」と、この空欄プレースホルダーに阻まれて、より新しい
 * extra（トップページ速報）側の確定済みスコアが一切反映されないバグになる。
 *
 * そのため、base 側のカードが確定済み（finished / cancelled）の場合のみ base を優先し、
 * base 側がまだ未確定（scheduled）または存在しない場合は extra 側の情報で補う
 * （＝ extra がより新しい結果を持っていればそちらを採用する）。試合の二重加算防止と
 * 「未確定のプレースホルダーに阻まれて新しい結果が反映されない」問題の両方を解消する。
 */
export function mergeScheduleRows(base: ScheduleRow[], extra: ScheduleRow[]): ScheduleRow[] {
  const key = (r: ScheduleRow) => `${r.date}|${[r.teamA ?? '', r.teamB ?? ''].sort().join('-')}`

  const merged = new Map<string, ScheduleRow>()
  for (const row of base) {
    merged.set(key(row), row)
  }
  for (const row of extra) {
    const k = key(row)
    const existing = merged.get(k)
    // base 側が確定済み（finished/cancelled）なら base を優先し、extra では上書きしない
    if (existing && existing.status !== 'scheduled') continue
    merged.set(k, row)
  }
  return [...merged.values()]
}

/** ScheduleRow から、12球団同士の終了済み（スコア確定済み）カードだけを抜き出す */
export function finishedGamesFrom(rows: ScheduleRow[]): FinishedGame[] {
  const finished: FinishedGame[] = []
  for (const row of rows) {
    if (row.status !== 'finished') continue
    if (!row.teamA || !row.teamB) continue // オールスターゲーム等、12球団以外はスキップ
    finished.push({ date: row.date, teamA: row.teamA, teamB: row.teamB, scoreA: row.scoreA!, scoreB: row.scoreB! })
  }
  return finished
}

/**
 * 指定日に、12球団のいずれかが関わる「まだ終了していない」試合（開催前・中止ではない）が
 * 存在するか。isPartialDay（その日の試合がまだ全部終わっていない可能性）の判定に使う。
 */
export function hasUnfinishedGameOn(rows: ScheduleRow[], date: string): boolean {
  return rows.some(
    (row) => row.date === date && row.status === 'scheduled' && row.teamA !== null && row.teamB !== null,
  )
}

/**
 * teams（1 リーグ 6 球団）へ、sourceAsOfDate より後・throughDate 以下の終了済み試合を
 * 日付昇順に適用し、再計算・再ソートした結果を返す。
 *
 * - 引き分け: 両チームの ties と games を +1 する。
 * - teams に含まれない球団（他リーグ）が絡む試合は、該当しない側のチームをスキップする
 *   （＝交流戦は、呼び出し側が central/pacific それぞれに対して本関数を呼ぶことで両方に反映される）。
 * - ゲーム差 (gamesBehind) は再ソート後の暫定首位を基準に再計算する
 *   （lib/record.ts の gamesBehind をそのまま利用。新規ロジックは実装しない）。
 */
export function applyStandingsDiff(
  teams: TeamStanding[],
  finishedGames: FinishedGame[],
  sourceAsOfDate: string,
  throughDate: string,
): StandingsDiffResult {
  const updated = new Map(teams.map((t) => [t.teamId, { ...t }]))
  let effectiveAsOfDate = sourceAsOfDate

  const relevant = finishedGames
    .filter((g) => g.date > sourceAsOfDate && g.date <= throughDate)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  for (const game of relevant) {
    const teamA = updated.get(game.teamA)
    const teamB = updated.get(game.teamB)
    if (!teamA && !teamB) continue // このリーグに無関係な対戦（通常は起きない）

    const tied = game.scoreA === game.scoreB
    if (teamA) {
      teamA.games += 1
      if (tied) teamA.ties += 1
      else if (game.scoreA > game.scoreB) teamA.wins += 1
      else teamA.losses += 1
    }
    if (teamB) {
      teamB.games += 1
      if (tied) teamB.ties += 1
      else if (game.scoreB > game.scoreA) teamB.wins += 1
      else teamB.losses += 1
    }
    if (game.date > effectiveAsOfDate) effectiveAsOfDate = game.date
  }

  const recalculated = teams.map((t) => {
    const u = updated.get(t.teamId)!
    return { ...u, winningPercentage: winningPercentage(u.wins, u.losses) }
  })
  recalculated.sort(compareForRank)

  const leader = recalculated[0] as TeamStanding | undefined
  const withGamesBehind = recalculated.map((t) => ({
    ...t,
    gamesBehind: !leader ? t.gamesBehind : t.teamId === leader.teamId ? 0 : computeGamesBehind(leader, t),
  }))

  return { teams: withGamesBehind, effectiveAsOfDate }
}
