/**
 * 総当たりでシナリオを検証するテスト専用の参照実装。
 * 残り試合が少ないリーグでのみ使う（O(outcomes ^ games)）。
 */
import { compareForRank } from '../lib/record'
import type { LeagueStandings } from '../lib/types'
import { expandGames } from './helpers'

type Final = { wins: number; losses: number; ties: number }

function playAll(
  standings: LeagueStandings,
  outcomes: number[],
  allowTies: boolean,
): Record<string, Final> {
  const finals: Record<string, Final> = {}
  for (const team of standings.teams) {
    finals[team.teamId] = { wins: team.wins, losses: team.losses, ties: team.ties }
  }
  const games = expandGames(standings.remainingHeadToHead ?? {})
  games.forEach(([home, away], index) => {
    const outcome = outcomes[index]
    if (allowTies && outcome === 2) {
      finals[home].ties += 1
      finals[away].ties += 1
    } else if (outcome === 0) {
      finals[home].wins += 1
      finals[away].losses += 1
    } else {
      finals[away].wins += 1
      finals[home].losses += 1
    }
  })
  return finals
}

function* allOutcomes(count: number, base: number): Generator<number[]> {
  const outcomes = new Array<number>(count).fill(0)
  const total = base ** count
  for (let i = 0; i < total; i += 1) {
    let rest = i
    for (let k = 0; k < count; k += 1) {
      outcomes[k] = rest % base
      rest = Math.floor(rest / base)
    }
    yield outcomes
  }
}

function rivalsAtOrAbove(
  standings: LeagueStandings,
  finals: Record<string, Final>,
  teamId: string,
  includeTies: boolean,
): number {
  let count = 0
  for (const team of standings.teams) {
    if (team.teamId === teamId) continue
    const cmp = compareForRank(finals[team.teamId], finals[teamId])
    if (cmp < 0 || (includeTies && cmp === 0)) count += 1
  }
  return count
}

/** 残り wins 勝で targetRank 位以内になるシナリオが存在するか（引き分けなし前提） */
export function bruteForcePossible(
  standings: LeagueStandings,
  teamId: string,
  wins: number,
  targetRank: number,
): boolean {
  const games = expandGames(standings.remainingHeadToHead ?? {})
  for (const outcomes of allOutcomes(games.length, 2)) {
    const finals = playAll(standings, outcomes, false)
    const teamWins = finals[teamId].wins - (standings.teams.find((t) => t.teamId === teamId)?.wins ?? 0)
    if (teamWins !== wins) continue
    if (rivalsAtOrAbove(standings, finals, teamId, false) <= targetRank - 1) return true
  }
  return false
}

/** 残り wins 勝以上なら、引き分けを含むどんな結果でも targetRank 位以内か */
export function bruteForceClinched(
  standings: LeagueStandings,
  teamId: string,
  wins: number,
  targetRank: number,
): boolean {
  const games = expandGames(standings.remainingHeadToHead ?? {})
  const base = standings.teams.find((t) => t.teamId === teamId)?.wins ?? 0
  for (const outcomes of allOutcomes(games.length, 3)) {
    const finals = playAll(standings, outcomes, true)
    if (finals[teamId].wins - base < wins) continue
    if (rivalsAtOrAbove(standings, finals, teamId, true) > targetRank - 1) return false
  }
  return true
}
