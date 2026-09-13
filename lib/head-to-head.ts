/**
 * 終了済みカード一覧（lib/parse-npb-schedule.ts）から、
 * リーグ内の残り直接対決数 (RemainingHeadToHead) を復元する純粋関数群。
 *
 * 同一リーグでは各球団ペアの年間対戦数は 25 試合と決まっているため、
 *
 *   remainingHeadToHead[A][B] = 25 - completedHeadToHead[A][B]
 *
 * として復元する。「未来の日程表にカードが何枚残っているか」ではなく
 * 「終了済みが何試合か」から逆算するため、雨天中止で振替日程が
 * まだ発表されていない試合も自動的に残り試合数へ含まれる。
 *
 * 143 試合には交流戦 18 試合が含まれるため、
 *
 *   totalRemaining    = 143 - games
 *   leagueRemaining   = Σ remainingHeadToHead[team][同リーグの相手]
 *   externalRemaining = totalRemaining - leagueRemaining （交流戦など）
 *
 * を整理し、externalRemaining が負にならないことを検証する。これにより
 * 開幕直後〜交流戦前〜交流戦中〜交流戦後〜シーズン終盤のどの時期でも
 * 同じロジックで扱える。
 *
 * ここでの検証に失敗した場合は誤った最短ラインを表示しないよう、
 * 必ず例外を投げる（null にフォールバックしない）。
 */
import { TOTAL_GAMES } from './teams'
import type { CompletedGame } from './parse-npb-schedule'
import type { RemainingHeadToHead, TeamStanding } from './types'

/** 同一リーグ内、1 球団ペアあたりの年間対戦数 */
export const GAMES_PER_OPPONENT = 25

export class HeadToHeadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HeadToHeadError'
  }
}

/** 終了済みカードから、球団ペアごとの終了試合数を対称に集計する */
export function buildCompletedHeadToHead(games: CompletedGame[]): Record<string, Record<string, number>> {
  const completed: Record<string, Record<string, number>> = {}
  for (const { teamA, teamB } of games) {
    if (teamA === teamB) continue
    completed[teamA] ??= {}
    completed[teamB] ??= {}
    completed[teamA][teamB] = (completed[teamA][teamB] ?? 0) + 1
    completed[teamB][teamA] = (completed[teamB][teamA] ?? 0) + 1
  }
  return completed
}

/**
 * 1 リーグ分の残り直接対決数を復元する。
 *
 * @param games   全期間・全対戦（他リーグ・交流戦を含む）の終了済みカード一覧
 * @param teams   このリーグの 6 球団（games/2026 勝敗表からの TeamStanding[]）
 * @param asOfDate このリーグの基準日 (YYYY-MM-DD)。この日付以前の対戦のみを終了済みとして数える
 */
export function deriveRemainingHeadToHead(
  games: CompletedGame[],
  teams: TeamStanding[],
  asOfDate: string,
): RemainingHeadToHead {
  const teamIds = new Set(teams.map((t) => t.teamId))
  const leagueGames = games.filter(
    (g) => g.date <= asOfDate && teamIds.has(g.teamA) && teamIds.has(g.teamB),
  )
  const completed = buildCompletedHeadToHead(leagueGames)

  const remaining: RemainingHeadToHead = {}
  for (const team of teams) {
    remaining[team.teamId] = {}
  }
  for (const team of teams) {
    for (const opponent of teams) {
      if (opponent.teamId === team.teamId) continue
      const played = completed[team.teamId]?.[opponent.teamId] ?? 0
      const left = GAMES_PER_OPPONENT - played
      if (left < 0 || left > GAMES_PER_OPPONENT) {
        throw new HeadToHeadError(
          `${team.teamId} 対 ${opponent.teamId}: 終了済み ${played} 試合は年間対戦数 ${GAMES_PER_OPPONENT} と矛盾します（残り ${left}）`,
        )
      }
      remaining[team.teamId][opponent.teamId] = left
    }
  }

  // 対称性の検証（構築上は自動的に満たされるはずだが、データ破損を確実に検知するため明示的に確認する）
  for (const team of teams) {
    for (const opponent of teams) {
      if (opponent.teamId === team.teamId) continue
      if (remaining[team.teamId][opponent.teamId] !== remaining[opponent.teamId][team.teamId]) {
        throw new HeadToHeadError(`${team.teamId} と ${opponent.teamId} の残り直接対決数が対称になっていません`)
      }
    }
  }

  // 143試合 = リーグ内 + 交流戦等。externalRemaining が負なら終了済みカードの数え方が矛盾している。
  for (const team of teams) {
    const totalRemaining = TOTAL_GAMES - team.games
    const leagueRemaining = Object.values(remaining[team.teamId]).reduce((sum, n) => sum + n, 0)
    const externalRemaining = totalRemaining - leagueRemaining
    if (externalRemaining < 0) {
      throw new HeadToHeadError(
        `${team.teamId}: 交流戦等の残り試合数が負になりました ` +
          `(総残り ${totalRemaining} − リーグ内残り ${leagueRemaining} = ${externalRemaining})`,
      )
    }
  }

  return remaining
}
