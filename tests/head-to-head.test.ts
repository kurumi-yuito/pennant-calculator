import { describe, expect, it } from 'vitest'
import { GAMES_PER_OPPONENT, HeadToHeadError, buildCompletedHeadToHead, deriveRemainingHeadToHead } from '../lib/head-to-head'
import { TOTAL_GAMES } from '../lib/teams'
import type { CompletedGame } from '../lib/parse-npb-schedule'
import type { TeamStanding } from '../lib/types'

const CENTRAL_IDS = ['tigers', 'giants', 'baystars', 'swallows', 'dragons', 'carp'] as const

function makeGames(count: number, teamA: string, teamB: string, startDate = '2026-04-01'): CompletedGame[] {
  const games: CompletedGame[] = []
  const base = new Date(startDate)
  for (let i = 0; i < count; i += 1) {
    const d = new Date(base)
    d.setDate(d.getDate() + i)
    games.push({ date: d.toISOString().slice(0, 10), teamA, teamB })
  }
  return games
}

function makeTeam(teamId: string, games: number): TeamStanding {
  return {
    teamId,
    teamName: teamId,
    league: 'central',
    games,
    wins: Math.floor(games / 2),
    losses: games - Math.floor(games / 2),
    ties: 0,
    winningPercentage: 0.5,
    gamesBehind: null,
  }
}

describe('buildCompletedHeadToHead', () => {
  it('対称に終了試合数を集計する', () => {
    const games = [...makeGames(3, 'tigers', 'giants'), ...makeGames(2, 'giants', 'baystars')]
    const completed = buildCompletedHeadToHead(games)
    expect(completed.tigers.giants).toBe(3)
    expect(completed.giants.tigers).toBe(3)
    expect(completed.giants.baystars).toBe(2)
    expect(completed.baystars.giants).toBe(2)
  })
})

describe('deriveRemainingHeadToHead — 基本ケース', () => {
  it('A-B が22試合終了済みなら残りは3試合になる', () => {
    // tigers-giants だけ 22 試合終了済み、他ペアは 0 試合（テスト用の単純化）
    const games = makeGames(22, 'tigers', 'giants')
    const teams = CENTRAL_IDS.map((id) => makeTeam(id, id === 'tigers' || id === 'giants' ? 22 : 0))
    const remaining = deriveRemainingHeadToHead(games, teams, '2026-12-31')
    expect(remaining.tigers.giants).toBe(3)
    expect(remaining.giants.tigers).toBe(3)
    // 対戦のない他ペアは満額の25試合残っている
    expect(remaining.tigers.carp).toBe(25)
  })

  it('対称性を検証する（内部的に必ず一致する）', () => {
    const games = makeGames(10, 'tigers', 'giants')
    const teams = CENTRAL_IDS.map((id) => makeTeam(id, id === 'tigers' || id === 'giants' ? 10 : 0))
    const remaining = deriveRemainingHeadToHead(games, teams, '2026-12-31')
    for (const a of CENTRAL_IDS) {
      for (const b of CENTRAL_IDS) {
        if (a === b) continue
        expect(remaining[a][b]).toBe(remaining[b][a])
      }
    }
  })

  it('25試合を超える終了済み（データ不整合）は例外を投げる', () => {
    const games = makeGames(26, 'tigers', 'giants')
    const teams = CENTRAL_IDS.map((id) => makeTeam(id, id === 'tigers' || id === 'giants' ? 26 : 0))
    expect(() => deriveRemainingHeadToHead(games, teams, '2026-12-31')).toThrow(HeadToHeadError)
  })
})

describe('deriveRemainingHeadToHead — 引き分け・中止・未再割当', () => {
  it('引き分け試合も1試合の消化としてカウントされる（呼び出し側の CompletedGame に既に反映されている前提）', () => {
    // parseScheduleMonthHtml が引き分けも通常の完了試合として1件返す設計なので、
    // ここでは単純に「1件の CompletedGame = 1試合消化」として扱われることを確認する。
    const games = makeGames(1, 'tigers', 'giants')
    const teams = CENTRAL_IDS.map((id) => makeTeam(id, id === 'tigers' || id === 'giants' ? 1 : 0))
    const remaining = deriveRemainingHeadToHead(games, teams, '2026-12-31')
    expect(remaining.tigers.giants).toBe(GAMES_PER_OPPONENT - 1)
  })

  it('中止カードは CompletedGame に含まれないため、残り試合数は減らない', () => {
    // 中止試合は parseScheduleMonthHtml の時点で除外される。ここでは
    // 「終了済みリストに現れない = 残り25試合のまま」であることを確認する。
    const games: CompletedGame[] = []
    const teams = CENTRAL_IDS.map((id) => makeTeam(id, 0))
    const remaining = deriveRemainingHeadToHead(games, teams, '2026-12-31')
    expect(remaining.tigers.giants).toBe(GAMES_PER_OPPONENT)
  })

  it('未来の日程表に振替カードが存在しなくても、終了済み数から正しい残数になる', () => {
    // 振替日程が未発表でも「終了済み22試合」という事実だけで残り3試合と算出できる
    const games = makeGames(22, 'dragons', 'carp')
    const teams = CENTRAL_IDS.map((id) => makeTeam(id, id === 'dragons' || id === 'carp' ? 22 : 0))
    const remaining = deriveRemainingHeadToHead(games, teams, '2026-12-31')
    expect(remaining.dragons.carp).toBe(3)
  })
})

describe('deriveRemainingHeadToHead — 交流戦前後', () => {
  it('交流戦前（totalRemaining > leagueRemaining）でも正常に動作し、差分を externalRemaining として扱える', () => {
    // 開幕直後: 各ペア 3 試合ずつ消化、交流戦はまだ1試合も消化していない想定
    const perPair = 3
    const games: CompletedGame[] = []
    for (let i = 0; i < CENTRAL_IDS.length; i += 1) {
      for (let j = i + 1; j < CENTRAL_IDS.length; j += 1) {
        games.push(...makeGames(perPair, CENTRAL_IDS[i], CENTRAL_IDS[j]))
      }
    }
    // 1球団あたり5ペア × 3試合 = 15試合消化（交流戦はまだ0試合）
    const teams = CENTRAL_IDS.map((id) => makeTeam(id, 15))
    const remaining = deriveRemainingHeadToHead(games, teams, '2026-12-31')

    for (const team of teams) {
      const totalRemaining = TOTAL_GAMES - team.games
      const leagueRemaining = Object.values(remaining[team.teamId]).reduce((a, b) => a + b, 0)
      const externalRemaining = totalRemaining - leagueRemaining
      expect(totalRemaining).toBeGreaterThan(leagueRemaining)
      expect(externalRemaining).toBe(18) // 交流戦がまるまる残っている
      expect(externalRemaining).toBeGreaterThanOrEqual(0)
    }
  })

  it('externalRemaining が負になるデータ不整合は例外を投げる', () => {
    // team.games（総消化試合数）が異常に大きいのに、リーグ内の終了済み対戦がほぼ無い
    // ＝「総残り試合数」が「リーグ内だけの残り試合数」を下回ってしまう矛盾したデータ
    const games: CompletedGame[] = []
    const teams = CENTRAL_IDS.map((id) => makeTeam(id, 140))
    expect(() => deriveRemainingHeadToHead(games, teams, '2026-12-31')).toThrow(HeadToHeadError)
  })
})

describe('deriveRemainingHeadToHead — 交流戦終了後（実データ相当）', () => {
  it('totalRemaining === leagueRemaining になる（交流戦を消化しきった状態）', () => {
    // 実データ（2026-09-12時点）を模したケース: 各ペア消化数の合計が総消化試合数と一致する
    // ＝ 交流戦18試合をすべて消化済みという想定
    const games: CompletedGame[] = []
    const perPairPlayed: Record<string, number> = {
      'tigers-giants': 21,
      'tigers-baystars': 20,
      'tigers-swallows': 21,
      'tigers-dragons': 22,
      'tigers-carp': 19,
      'giants-baystars': 21,
      'giants-swallows': 22,
      'giants-dragons': 23,
      'giants-carp': 20,
      'baystars-swallows': 22,
      'baystars-dragons': 23,
      'baystars-carp': 23,
      'swallows-dragons': 22,
      'swallows-carp': 21,
      'dragons-carp': 22,
    }
    for (const [pair, count] of Object.entries(perPairPlayed)) {
      const [a, b] = pair.split('-')
      games.push(...makeGames(count, a, b))
    }
    const gamesPlayed: Record<string, number> = Object.fromEntries(CENTRAL_IDS.map((id) => [id, 18])) // 交流戦18試合
    for (const [pair, count] of Object.entries(perPairPlayed)) {
      const [a, b] = pair.split('-')
      gamesPlayed[a] += count
      gamesPlayed[b] += count
    }
    const teams = CENTRAL_IDS.map((id) => makeTeam(id, gamesPlayed[id]))
    const remaining = deriveRemainingHeadToHead(games, teams, '2026-12-31')

    for (const team of teams) {
      const totalRemaining = TOTAL_GAMES - team.games
      const leagueRemaining = Object.values(remaining[team.teamId]).reduce((a, b) => a + b, 0)
      expect(totalRemaining).toBe(leagueRemaining) // externalRemaining === 0
    }
  })

  it('asOfDate 以降の対戦は集計に含めない', () => {
    const games = [
      ...makeGames(5, 'tigers', 'giants', '2026-04-01'),
      ...makeGames(2, 'tigers', 'giants', '2026-09-13'), // 基準日より後
    ]
    const teams = CENTRAL_IDS.map((id) => makeTeam(id, id === 'tigers' || id === 'giants' ? 5 : 0))
    const remaining = deriveRemainingHeadToHead(games, teams, '2026-09-12')
    expect(remaining.tigers.giants).toBe(GAMES_PER_OPPONENT - 5)
  })

  it('他リーグとの対戦（交流戦）は同一リーグの残り直接対決に含めない', () => {
    const games = [
      ...makeGames(3, 'tigers', 'giants'),
      ...makeGames(4, 'tigers', 'hawks'), // パ・リーグとの交流戦
    ]
    const teams = CENTRAL_IDS.map((id) => makeTeam(id, id === 'tigers' ? 7 : id === 'giants' ? 3 : 0))
    const remaining = deriveRemainingHeadToHead(games, teams, '2026-12-31')
    expect(remaining.tigers.giants).toBe(GAMES_PER_OPPONENT - 3)
    expect(Object.keys(remaining.tigers)).not.toContain('hawks')
  })
})
