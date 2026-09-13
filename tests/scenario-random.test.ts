/**
 * ランダムな順位表に対して、最短ライン／確定ラインを総当たりと突き合わせる性質テスト。
 * 「誤った確定を出さない」ことを広い入力で担保するのが目的。
 */
import { describe, expect, it } from 'vitest'
import { calcRankLines } from '../lib/scenario'
import { TOTAL_GAMES } from '../lib/teams'
import { makeHeadToHead, makeLeague } from './helpers'
import { bruteForceClinched, bruteForcePossible } from './brute-force'

const IDS = ['a', 'b', 'c', 'd', 'e', 'f']

/** 再現性のある擬似乱数 (mulberry32) */
function createRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 各球団の残り試合が 2 になるように 3 カード × 2 試合を割り当てる */
const PAIRINGS: [string, string][][] = [
  [
    ['a', 'b'],
    ['c', 'd'],
    ['e', 'f'],
  ],
  [
    ['a', 'c'],
    ['b', 'd'],
    ['e', 'f'],
  ],
  [
    ['a', 'f'],
    ['b', 'c'],
    ['d', 'e'],
  ],
]

describe('ランダム順位表での総当たり照合', () => {
  it('最短ラインは総当たりと一致し、確定ラインは総当たりでも破られない', () => {
    const random = createRandom(20260913)
    for (let trial = 0; trial < 12; trial += 1) {
      const pairs = PAIRINGS[trial % PAIRINGS.length].map(
        ([a, b]) => [a, b, 1] as [string, string, number],
      )
      const extra = PAIRINGS[(trial + 1) % PAIRINGS.length].map(
        ([a, b]) => [a, b, 1] as [string, string, number],
      )
      const headToHead = makeHeadToHead(IDS, [...pairs, ...extra])
      const seeds = IDS.map((id) => {
        const remaining = Object.values(headToHead[id]).reduce((sum, n) => sum + n, 0)
        const games = TOTAL_GAMES - remaining
        const ties = Math.floor(random() * 4)
        const wins = 60 + Math.floor(random() * 21)
        const losses = games - ties - wins
        return { id, wins, losses, ties }
      })
      if (seeds.some((s) => s.losses < 0)) continue
      const league = makeLeague(seeds, headToHead)

      for (const teamId of IDS) {
        for (const rank of [1, 3]) {
          const result = calcRankLines(league, teamId, rank)
          expect(result).not.toBeNull()
          if (!result) continue
          for (let wins = 0; wins <= result.remaining; wins += 1) {
            const possible = result.possibleWins !== null && wins >= result.possibleWins
            expect({ trial, teamId, rank, wins, possible }).toEqual({
              trial,
              teamId,
              rank,
              wins,
              possible: bruteForcePossible(league, teamId, wins, rank),
            })
            if (result.clinchWins !== null && wins >= result.clinchWins) {
              expect({ trial, teamId, rank, wins, clinched: true }).toEqual({
                trial,
                teamId,
                rank,
                wins,
                clinched: bruteForceClinched(league, teamId, wins, rank),
              })
            }
          }
        }
      }
    }
  })
})
