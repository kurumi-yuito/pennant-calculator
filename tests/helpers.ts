import { TOTAL_GAMES } from '../lib/teams'
import { winningPercentage } from '../lib/record'
import type { LeagueId, LeagueStandings, RemainingHeadToHead, TeamStanding } from '../lib/types'

export type TeamSeed = { id: string; wins: number; losses: number; ties: number }

/** テスト用のリーグ順位表を組み立てる（143 試合制との整合性も検証する） */
export function makeLeague(
  seeds: TeamSeed[],
  headToHead: RemainingHeadToHead | null,
  league: LeagueId = 'central',
): LeagueStandings {
  const teams: TeamStanding[] = seeds.map((seed) => {
    const games = seed.wins + seed.losses + seed.ties
    return {
      teamId: seed.id,
      teamName: seed.id,
      league,
      games,
      wins: seed.wins,
      losses: seed.losses,
      ties: seed.ties,
      winningPercentage: winningPercentage(seed.wins, seed.losses),
      gamesBehind: null,
    }
  })
  if (headToHead) {
    for (const team of teams) {
      const sum = Object.values(headToHead[team.teamId] ?? {}).reduce((a, b) => a + b, 0)
      if (sum !== TOTAL_GAMES - team.games) {
        throw new Error(`テストデータが不整合: ${team.teamId} 残り ${TOTAL_GAMES - team.games} / 直接対決 ${sum}`)
      }
    }
  }
  return {
    league,
    asOfLabel: 'テスト',
    asOfDate: '2026-09-12',
    teams,
    remainingHeadToHead: headToHead,
    sourceUrl: 'test',
  }
}

/** 対称な残り直接対決表を作る。pairs は [teamA, teamB, 試合数] */
export function makeHeadToHead(ids: string[], pairs: [string, string, number][]): RemainingHeadToHead {
  const table: RemainingHeadToHead = {}
  for (const id of ids) {
    table[id] = {}
    for (const other of ids) {
      if (other !== id) table[id][other] = 0
    }
  }
  for (const [a, b, count] of pairs) {
    table[a][b] = count
    table[b][a] = count
  }
  return table
}

export type Game = [string, string]

/** 残り直接対決表を 1 試合ずつに展開する */
export function expandGames(headToHead: RemainingHeadToHead): Game[] {
  const ids = Object.keys(headToHead)
  const games: Game[] = []
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const count = headToHead[ids[i]][ids[j]] ?? 0
      for (let k = 0; k < count; k += 1) games.push([ids[i], ids[j]])
    }
  }
  return games
}
