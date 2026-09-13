import { describe, expect, it } from 'vitest'
import {
  bindingConditions,
  buildProjection,
  calcFiveHundredLine,
  calcRankLines,
  currentRank,
  remainingGames,
} from '../lib/scenario'
import { formatWinningPercentage } from '../lib/record'
import { TOTAL_GAMES } from '../lib/teams'
import { makeHeadToHead, makeLeague } from './helpers'
import { bruteForceClinched, bruteForcePossible } from './brute-force'

const IDS = ['a', 'b', 'c', 'd', 'e', 'f']

describe('勝率5割ライン', () => {
  it('60勝63敗3分・残り17 なら あと10勝で 70勝70敗3分 (.500)', () => {
    const team = makeLeague(
      [{ id: 'a', wins: 60, losses: 63, ties: 3 }],
      null,
    ).teams[0]
    expect(remainingGames(team)).toBe(17)
    const result = calcFiveHundredLine(team)
    expect(result.requiredWins).toBe(10)
    expect(result.finalWins).toBe(70)
    expect(result.finalLosses).toBe(70)
    expect(result.finalTies).toBe(3)
    expect(result.finalPercentage).toBe(0.5)
    expect(formatWinningPercentage(result.finalPercentage)).toBe('.500')
    expect(result.status).toBe('possible')
  })

  it('すでに残り全敗でも5割以上なら「達成確定」', () => {
    // 75勝50敗0分・残り18 → 全敗しても 75-68 で .524
    const team = makeLeague([{ id: 'a', wins: 75, losses: 50, ties: 0 }], null).teams[0]
    const result = calcFiveHundredLine(team)
    expect(result.requiredWins).toBe(0)
    expect(result.status).toBe('clinched')
    expect(result.achievedNow).toBe(true)
  })

  it('現在5割以上でも、残り全敗すると割り込む場合は必要勝数が出る', () => {
    // 62勝61敗3分・残り17
    const team = makeLeague([{ id: 'a', wins: 62, losses: 61, ties: 3 }], null).teams[0]
    const result = calcFiveHundredLine(team)
    expect(result.achievedNow).toBe(true)
    expect(result.requiredWins).toBe(8) // 70勝70敗3分
    expect(result.finalWins).toBe(70)
    expect(result.finalLosses).toBe(70)
  })

  it('残り全勝でも5割に届かなければ「消滅」', () => {
    // 50勝80敗0分・残り13 → 全勝でも 63勝80敗
    const team = makeLeague([{ id: 'a', wins: 50, losses: 80, ties: 0 }], null).teams[0]
    const result = calcFiveHundredLine(team)
    expect(result.status).toBe('eliminated')
    expect(result.requiredWins).toBeNull()
  })

  it('シーズン終了 (残り0) でも NaN にならない', () => {
    const team = makeLeague([{ id: 'a', wins: 71, losses: 70, ties: 2 }], null).teams[0]
    expect(remainingGames(team)).toBe(0)
    const result = calcFiveHundredLine(team)
    expect(result.remaining).toBe(0)
    expect(result.requiredWins).toBe(0)
    expect(result.status).toBe('clinched')
    expect(Number.isFinite(result.finalPercentage)).toBe(true)
  })

  it('シーズン終了かつ5割未満なら消滅', () => {
    const team = makeLeague([{ id: 'a', wins: 70, losses: 71, ties: 2 }], null).teams[0]
    const result = calcFiveHundredLine(team)
    expect(result.status).toBe('eliminated')
    expect(result.requiredWins).toBeNull()
    expect(result.achievedNow).toBe(false)
  })
})

describe('優勝判定', () => {
  it('残り全勝でも1位に届かなければ「可能性なし」', () => {
    const league = makeLeague(
      [
        { id: 'a', wins: 50, losses: 80, ties: 0 }, // 残り13 → 最大63勝
        { id: 'b', wins: 85, losses: 40, ties: 0 }, // 残り18
        { id: 'c', wins: 70, losses: 60, ties: 0 },
        { id: 'd', wins: 68, losses: 62, ties: 0 },
        { id: 'e', wins: 66, losses: 64, ties: 0 },
        { id: 'f', wins: 60, losses: 70, ties: 0 },
      ],
      null,
    )
    const result = calcRankLines(league, 'a', 1)
    expect(result).not.toBeNull()
    expect(result?.possibleWins).toBeNull()
    expect(result?.clinchWins).toBeNull()
    expect(result?.status).toBe('eliminated')
  })

  it('ゲーム差ではなく直接対決を踏まえて最短ラインが決まる', () => {
    // a は残り2、b と c も残り2。b と c は直接対決が無いので両方とも勝ち続けられる
    const ids = ['a', 'b', 'c', 'd', 'e', 'f']
    const noDirect = makeHeadToHead(ids, [
      ['a', 'd', 2],
      ['b', 'e', 2],
      ['c', 'f', 2],
    ])
    const withDirect = makeHeadToHead(ids, [
      ['a', 'd', 2],
      ['b', 'c', 2],
      ['e', 'f', 2],
    ])
    const seeds = [
      { id: 'a', wins: 70, losses: 69, ties: 2 },
      { id: 'b', wins: 70, losses: 69, ties: 2 },
      { id: 'c', wins: 70, losses: 69, ties: 2 },
      { id: 'd', wins: 60, losses: 79, ties: 2 },
      { id: 'e', wins: 60, losses: 79, ties: 2 },
      { id: 'f', wins: 60, losses: 79, ties: 2 },
    ]
    const separate = calcRankLines(makeLeague(seeds, noDirect), 'a', 1)
    const direct = calcRankLines(makeLeague(seeds, withDirect), 'a', 1)
    expect(separate?.possibleWins).toBe(0) // b も c も2連敗しうる
    // b と c が直接対決するため、必ずどちらかが勝つ。a は自力で上回る必要がある
    expect(direct?.possibleWins).toBeGreaterThan(0)
  })
})

describe('CS (3位以内) 判定', () => {
  const ids = IDS
  const h2h = makeHeadToHead(ids, [
    ['a', 'b', 1],
    ['a', 'c', 1],
    ['b', 'c', 1],
    ['d', 'e', 1],
    ['d', 'f', 1],
    ['e', 'f', 1],
  ])
  const league = makeLeague(
    [
      { id: 'a', wins: 70, losses: 69, ties: 2 },
      { id: 'b', wins: 71, losses: 68, ties: 2 },
      { id: 'c', wins: 70, losses: 70, ties: 1 },
      { id: 'd', wins: 69, losses: 70, ties: 2 },
      { id: 'e', wins: 68, losses: 71, ties: 2 },
      { id: 'f', wins: 67, losses: 72, ties: 2 },
    ],
    h2h,
  )

  it('最短ラインは総当たりの結果と一致する', () => {
    for (const rank of [1, 3]) {
      const result = calcRankLines(league, 'a', rank)
      expect(result).not.toBeNull()
      if (!result) return
      for (let wins = 0; wins <= result.remaining; wins += 1) {
        const expected = bruteForcePossible(league, 'a', wins, rank)
        const actual = result.possibleWins !== null && wins >= result.possibleWins
        expect({ rank, wins, actual }).toEqual({ rank, wins, actual: expected })
      }
    }
  })

  it('確定ラインは総当たり (引き分けを含む全パターン) でも破られない', () => {
    for (const rank of [1, 3]) {
      const result = calcRankLines(league, 'a', rank)
      if (!result || result.clinchWins === null) continue
      expect(bruteForceClinched(league, 'a', result.clinchWins, rank)).toBe(true)
      // 1 勝足りない場合は確定しない（＝ラインが過大でない）
      if (result.clinchWins > 0) {
        expect(bruteForceClinched(league, 'a', result.clinchWins - 1, rank)).toBe(false)
      }
    }
  })

  it('確定ラインは最短ライン以上', () => {
    for (const teamId of ids) {
      for (const rank of [1, 3]) {
        const result = calcRankLines(league, teamId, rank)
        if (!result || result.possibleWins === null || result.clinchWins === null) continue
        expect(result.clinchWins).toBeGreaterThanOrEqual(result.possibleWins)
      }
    }
  })

  it('全球団・全勝数で総当たりと突き合わせる', () => {
    for (const teamId of ids) {
      for (const rank of [1, 3]) {
        const result = calcRankLines(league, teamId, rank)
        expect(result).not.toBeNull()
        if (!result) continue
        for (let wins = 0; wins <= result.remaining; wins += 1) {
          const possible = result.possibleWins !== null && wins >= result.possibleWins
          expect({ teamId, rank, wins, possible }).toEqual({
            teamId,
            rank,
            wins,
            possible: bruteForcePossible(league, teamId, wins, rank),
          })
          // 「確定」と言い切った場合は、引き分けを含む総当たりでも必ず成立する
          if (result.clinchWins !== null && wins >= result.clinchWins) {
            expect(bruteForceClinched(league, teamId, wins, rank)).toBe(true)
          }
        }
      }
    }
  })

  it('直接対決が不明な場合は確定ラインを安全側 (厳しめ) に出す', () => {
    const known = calcRankLines(league, 'a', 3)
    const unknown = calcRankLines(makeLeague(league.teams.map((t) => ({ id: t.teamId, wins: t.wins, losses: t.losses, ties: t.ties })), null), 'a', 3)
    expect(unknown?.headToHeadKnown).toBe(false)
    expect(known?.headToHeadKnown).toBe(true)
    if (known?.clinchWins !== null && unknown?.clinchWins !== null && known && unknown) {
      expect(unknown.clinchWins ?? Infinity).toBeGreaterThanOrEqual(known.clinchWins ?? 0)
    }
  })
})

describe('現在順位と一覧', () => {
  const league = makeLeague(
    [
      { id: 'a', wins: 70, losses: 56, ties: 2 },
      { id: 'b', wins: 69, losses: 54, ties: 1 },
      { id: 'c', wins: 61, losses: 63, ties: 3 },
      { id: 'd', wins: 55, losses: 69, ties: 2 },
      { id: 'e', wins: 54, losses: 74, ties: 2 },
      { id: 'f', wins: 50, losses: 69, ties: 4 },
    ],
    null,
  )

  it('勝率順で順位を出す (丸め前の値で比較)', () => {
    expect(currentRank(league, 'b')).toEqual({ rank: 1, tied: false })
    expect(currentRank(league, 'a')).toEqual({ rank: 2, tied: false })
    expect(currentRank(league, 'c')).toEqual({ rank: 3, tied: false })
  })

  it('残り勝数の一覧が最終成績と勝率を正しく出す', () => {
    const team = league.teams.find((t) => t.teamId === 'c')
    expect(team).toBeDefined()
    if (!team) return
    const rows = buildProjection(team, [10])
    const row = rows.find((r) => r.wins === 10)
    expect(row).toBeDefined()
    expect(row?.losses).toBe(6)
    expect(row?.finalWins).toBe(71)
    expect(row?.finalLosses).toBe(69)
    expect(row?.finalTies).toBe(3)
    for (const projection of rows) {
      expect(projection.wins + projection.losses).toBe(TOTAL_GAMES - team.games)
      expect(Number.isFinite(projection.percentage)).toBe(true)
    }
  })

  it('一覧は連続した勝数で、重要ラインを含む', () => {
    const team = league.teams.find((t) => t.teamId === 'c')
    expect(team).toBeDefined()
    if (!team) return
    const rows = buildProjection(team, [10, 0, 12, 10])
    expect(rows.length).toBeLessThanOrEqual(7)
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i].wins).toBe(rows[i - 1].wins + 1)
    }
    expect(rows.some((r) => r.wins === 10)).toBe(true)
    expect(rows.some((r) => r.wins === 12)).toBe(true)
    expect(rows[0].wins).toBeGreaterThanOrEqual(0)
    expect(rows[rows.length - 1].wins).toBeLessThanOrEqual(TOTAL_GAMES - team.games)
  })

  it('実質無条件の他球団条件は表示対象から外す', () => {
    expect(
      bindingConditions([
        { teamId: 'b', maxWins: 0, remaining: 15 },
        { teamId: 'd', maxWins: 13, remaining: 13 },
      ]),
    ).toEqual([{ teamId: 'b', maxWins: 0, remaining: 15 }])
  })

  it('残り0 でも一覧が壊れない', () => {
    const finished = makeLeague([{ id: 'a', wins: 71, losses: 70, ties: 2 }], null).teams[0]
    const rows = buildProjection(finished, [0])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ wins: 0, losses: 0, finalWins: 71, finalLosses: 70 })
  })
})
