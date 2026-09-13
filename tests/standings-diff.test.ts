/**
 * NPB 公式勝敗表 (https://npb.jp/games/<year>/) が当日の試合結果をまだ反映していない場合に、
 * 同じ npb.jp の月別日程・結果ページから終了済み試合を差分適用する lib/standings-diff.ts の
 * 検証。要求されている 8 シナリオをすべてカバーする。
 */
import { describe, expect, it } from 'vitest'
import { applyStandingsDiff, finishedGamesFrom, hasUnfinishedGameOn, mergeScheduleRows } from '../lib/standings-diff'
import { deriveRemainingHeadToHead } from '../lib/head-to-head'
import { winningPercentage } from '../lib/record'
import { TOTAL_GAMES } from '../lib/teams'
import { makeLeague } from './helpers'
import type { FinishedGame } from '../lib/standings-diff'
import type { CompletedGame, ScheduleRow } from '../lib/parse-npb-schedule'
import type { TeamStanding } from '../lib/types'

function team(id: string, wins: number, losses: number, ties: number): TeamStanding {
  const games = wins + losses + ties
  return {
    teamId: id,
    teamName: id,
    league: 'central',
    games,
    wins,
    losses,
    ties,
    winningPercentage: winningPercentage(wins, losses),
    gamesBehind: null,
  }
}

describe('applyStandingsDiff', () => {
  it('1) 前日基準の勝敗表 + 当日の終了済み試合を反映する（DeNA/巨人の具体例）', () => {
    const baystars = team('baystars', 61, 63, 3) // 127試合
    const giants = team('giants', 70, 55, 2) // 127試合
    const teams = [baystars, giants]

    const finishedGames: FinishedGame[] = [
      { date: '2026-09-13', teamA: 'baystars', teamB: 'giants', scoreA: 5, scoreB: 0 },
    ]

    const result = applyStandingsDiff(teams, finishedGames, '2026-09-12', '2026-09-13')

    const newBaystars = result.teams.find((t) => t.teamId === 'baystars')!
    const newGiants = result.teams.find((t) => t.teamId === 'giants')!

    expect(newBaystars).toMatchObject({ games: 128, wins: 62, losses: 63, ties: 3 })
    expect(newBaystars.winningPercentage).toBeCloseTo(62 / 125, 9)
    expect(newGiants).toMatchObject({ games: 128, wins: 70, losses: 56, ties: 2 })
    expect(result.effectiveAsOfDate).toBe('2026-09-13')
  })

  it('2) 引き分けの試合は両チームの ties と games を +1 する', () => {
    const a = team('a', 60, 60, 3)
    const b = team('b', 55, 60, 4)
    const finishedGames: FinishedGame[] = [{ date: '2026-09-13', teamA: 'a', teamB: 'b', scoreA: 2, scoreB: 2 }]

    const result = applyStandingsDiff([a, b], finishedGames, '2026-09-12', '2026-09-13')

    const newA = result.teams.find((t) => t.teamId === 'a')!
    const newB = result.teams.find((t) => t.teamId === 'b')!
    expect(newA).toMatchObject({ games: 124, wins: 60, losses: 60, ties: 4 })
    expect(newB).toMatchObject({ games: 120, wins: 55, losses: 60, ties: 5 })
  })

  it('3) 中止試合は finishedGamesFrom で除外され、何も加算されない', () => {
    const a = team('a', 60, 60, 0)
    const b = team('b', 55, 60, 0)
    const rows: ScheduleRow[] = [{ date: '2026-09-13', teamA: 'a', teamB: 'b', status: 'cancelled' }]

    const finishedGames = finishedGamesFrom(rows)
    expect(finishedGames).toEqual([])

    const result = applyStandingsDiff([a, b], finishedGames, '2026-09-12', '2026-09-13')
    expect(result.teams.find((t) => t.teamId === 'a')).toMatchObject({ games: 60 + 60, wins: 60, losses: 60 })
    expect(result.teams.find((t) => t.teamId === 'b')).toMatchObject({ games: 115, wins: 55, losses: 60 })
    expect(result.effectiveAsOfDate).toBe('2026-09-12')
  })

  it('4) 未開催（開始前）の試合も finishedGamesFrom で除外され、何も加算されない', () => {
    const a = team('a', 60, 60, 0)
    const b = team('b', 55, 60, 0)
    const rows: ScheduleRow[] = [{ date: '2026-09-13', teamA: 'a', teamB: 'b', status: 'scheduled' }]

    const finishedGames = finishedGamesFrom(rows)
    expect(finishedGames).toEqual([])

    const result = applyStandingsDiff([a, b], finishedGames, '2026-09-12', '2026-09-13')
    expect(result.teams.find((t) => t.teamId === 'a')!.games).toBe(120)
    expect(result.effectiveAsOfDate).toBe('2026-09-12')
  })

  it('5) 二重加算防止: 試合日 = 基準日 (asOf) と同日の試合は加算しない', () => {
    const a = team('a', 60, 60, 0)
    const b = team('b', 55, 60, 0)
    // 勝敗表の基準日が既に 9/13 になっている（＝この試合は既に反映済みのはず）
    const finishedGames: FinishedGame[] = [{ date: '2026-09-13', teamA: 'a', teamB: 'b', scoreA: 3, scoreB: 1 }]

    const result = applyStandingsDiff([a, b], finishedGames, '2026-09-13', '2026-09-13')

    expect(result.teams.find((t) => t.teamId === 'a')).toMatchObject({ games: 120, wins: 60, losses: 60 })
    expect(result.teams.find((t) => t.teamId === 'b')).toMatchObject({ games: 115, wins: 55, losses: 60 })
    expect(result.effectiveAsOfDate).toBe('2026-09-13')
  })

  it('6) 複数日の遅延: asOf=9/11 のとき、9/12 と 9/13 両方の終了済み試合を反映する', () => {
    const a = team('a', 60, 60, 0)
    const b = team('b', 55, 60, 0)
    const finishedGames: FinishedGame[] = [
      { date: '2026-09-12', teamA: 'a', teamB: 'b', scoreA: 4, scoreB: 2 },
      { date: '2026-09-13', teamA: 'a', teamB: 'b', scoreA: 1, scoreB: 3 },
    ]

    const result = applyStandingsDiff([a, b], finishedGames, '2026-09-11', '2026-09-13')

    // a: 9/12 勝ち, 9/13 負け → +2試合, +1勝, +1敗
    expect(result.teams.find((t) => t.teamId === 'a')).toMatchObject({ games: 122, wins: 61, losses: 61 })
    expect(result.teams.find((t) => t.teamId === 'b')).toMatchObject({ games: 117, wins: 56, losses: 61 })
    expect(result.effectiveAsOfDate).toBe('2026-09-13')
  })

  it('7) 交流戦（リーグ跨ぎ）: セ・パ両リーグそれぞれに反映される', () => {
    // セ・リーグ: baystars、パ・リーグ: hawks という設定で、両リーグ跨ぎの1試合を用意する
    const baystars = team('baystars', 60, 60, 0)
    const hawks: TeamStanding = { ...team('hawks', 70, 50, 0), league: 'pacific' }
    const finishedGames: FinishedGame[] = [
      { date: '2026-09-13', teamA: 'baystars', teamB: 'hawks', scoreA: 2, scoreB: 6 },
    ]

    const centralResult = applyStandingsDiff([baystars], finishedGames, '2026-09-12', '2026-09-13')
    const pacificResult = applyStandingsDiff([hawks], finishedGames, '2026-09-12', '2026-09-13')

    expect(centralResult.teams.find((t) => t.teamId === 'baystars')).toMatchObject({
      games: 121,
      wins: 60,
      losses: 61,
    })
    expect(pacificResult.teams.find((t) => t.teamId === 'hawks')).toMatchObject({
      games: 121,
      wins: 71,
      losses: 50,
    })
  })

  it('8) 差分反映後も直接対決 (h2h) の整合性が保たれる（games / totalRemaining / remainingHeadToHead）', () => {
    // 6球団、既に各ペア3試合ずつ消化済み（9/1時点）という前提で組み立てる
    const ids = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6']
    const baseCompleted: CompletedGame[] = []
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        for (let k = 0; k < 3; k += 1) {
          baseCompleted.push({ date: '2026-09-01', teamA: ids[i], teamB: ids[j] })
        }
      }
    }
    // 各球団 5 相手 × 3試合 = 15試合消化
    const teams = ids.map((id) => team(id, 8, 6, 1)) // 8+6+1=15試合
    const sourceAsOfDate = '2026-09-12'

    const remainingBefore = deriveRemainingHeadToHead(baseCompleted, teams, sourceAsOfDate)
    expect(remainingBefore.c1.c2).toBe(22) // 25 - 3

    const totalRemainingBefore = TOTAL_GAMES - teams[0].games
    const leagueRemainingBefore = Object.values(remainingBefore.c1).reduce((a, b) => a + b, 0)
    const externalRemainingBefore = totalRemainingBefore - leagueRemainingBefore

    // c1 対 c2 の追加1試合（9/13、リーグ内＝交流戦ではない）を反映する
    const finishedGames: FinishedGame[] = [{ date: '2026-09-13', teamA: 'c1', teamB: 'c2', scoreA: 5, scoreB: 2 }]
    const diff = applyStandingsDiff(teams, finishedGames, sourceAsOfDate, '2026-09-13')
    expect(diff.effectiveAsOfDate).toBe('2026-09-13')

    const completedAfter: CompletedGame[] = [...baseCompleted, { date: '2026-09-13', teamA: 'c1', teamB: 'c2' }]
    const remainingAfter = deriveRemainingHeadToHead(completedAfter, diff.teams, diff.effectiveAsOfDate)

    const c1After = diff.teams.find((t) => t.teamId === 'c1')!
    expect(c1After.games).toBe(teams[0].games + 1)
    expect(remainingAfter.c1.c2).toBe(remainingBefore.c1.c2 - 1)
    expect(remainingAfter.c2.c1).toBe(remainingAfter.c1.c2) // 対称性

    const totalRemainingAfter = TOTAL_GAMES - c1After.games
    expect(totalRemainingAfter).toBe(totalRemainingBefore - 1)

    const leagueRemainingAfter = Object.values(remainingAfter.c1).reduce((a, b) => a + b, 0)
    expect(leagueRemainingAfter).toBe(leagueRemainingBefore - 1)

    // リーグ内の試合なので、交流戦等の残り試合数（externalRemaining）は変化しないはず
    const externalRemainingAfter = totalRemainingAfter - leagueRemainingAfter
    expect(externalRemainingAfter).toBe(externalRemainingBefore)
  })
})

describe('mergeScheduleRows', () => {
  it('月別日程ページ側がまだ未確定（scheduled）のカードは、トップページ速報の確定結果で置き換える', () => {
    // 実データで確認した実際のバグ: 月別日程ページはその日のカードが未終了でも
    // スコア欄が空欄の行（status: scheduled）を必ず持つ。これを「既に反映済み」と
    // 誤認してトップページ速報の確定結果を捨ててしまうと、当日の終了試合が
    // いつまでも反映されない。
    const scheduleRows: ScheduleRow[] = [
      { date: '2026-09-12', teamA: 'baystars', teamB: 'giants', status: 'finished', scoreA: 4, scoreB: 3 },
      { date: '2026-09-13', teamA: 'baystars', teamB: 'giants', status: 'scheduled' }, // 月別日程ページはまだ未反映
    ]
    const liveRows: ScheduleRow[] = [
      { date: '2026-09-13', teamA: 'baystars', teamB: 'giants', status: 'finished', scoreA: 5, scoreB: 0 },
    ]
    const merged = mergeScheduleRows(scheduleRows, liveRows)
    expect(merged).toHaveLength(2)
    expect(merged.filter((r) => r.date === '2026-09-13')).toEqual([
      { date: '2026-09-13', teamA: 'baystars', teamB: 'giants', status: 'finished', scoreA: 5, scoreB: 0 },
    ])
  })

  it('月別日程ページ側が既に確定済み（finished）のカードは、トップページ速報で上書きしない', () => {
    const scheduleRows: ScheduleRow[] = [
      { date: '2026-09-12', teamA: 'baystars', teamB: 'giants', status: 'finished', scoreA: 4, scoreB: 3 },
    ]
    const liveRows: ScheduleRow[] = [
      { date: '2026-09-12', teamA: 'baystars', teamB: 'giants', status: 'finished', scoreA: 9, scoreB: 9 },
    ]
    const merged = mergeScheduleRows(scheduleRows, liveRows)
    expect(merged).toEqual([{ date: '2026-09-12', teamA: 'baystars', teamB: 'giants', status: 'finished', scoreA: 4, scoreB: 3 }])
  })

  it('日付+対戦カードが完全に一致しないキーは追加される（実運用: 日程ページが該当日を全く持たない場合）', () => {
    const scheduleRows: ScheduleRow[] = [
      { date: '2026-09-12', teamA: 'baystars', teamB: 'giants', status: 'finished', scoreA: 4, scoreB: 3 },
    ]
    const liveRows: ScheduleRow[] = [
      { date: '2026-09-13', teamA: 'baystars', teamB: 'giants', status: 'finished', scoreA: 5, scoreB: 0 },
    ]
    const merged = mergeScheduleRows(scheduleRows, liveRows)
    expect(merged).toHaveLength(2)
    expect(merged).toContainEqual({
      date: '2026-09-13',
      teamA: 'baystars',
      teamB: 'giants',
      status: 'finished',
      scoreA: 5,
      scoreB: 0,
    })
  })

  it('対戦カードの球団順（teamA/teamB）が入れ替わっていても同一カードとして重複排除する', () => {
    const scheduleRows: ScheduleRow[] = [
      { date: '2026-09-13', teamA: 'giants', teamB: 'baystars', status: 'finished', scoreA: 0, scoreB: 5 },
    ]
    const liveRows: ScheduleRow[] = [
      { date: '2026-09-13', teamA: 'baystars', teamB: 'giants', status: 'finished', scoreA: 5, scoreB: 0 },
    ]
    const merged = mergeScheduleRows(scheduleRows, liveRows)
    expect(merged).toHaveLength(1)
  })
})

describe('hasUnfinishedGameOn', () => {
  it('指定日に未終了（scheduled）の試合があれば true', () => {
    const rows: ScheduleRow[] = [
      { date: '2026-09-13', teamA: 'a', teamB: 'b', status: 'finished', scoreA: 1, scoreB: 0 },
      { date: '2026-09-13', teamA: 'c', teamB: 'd', status: 'scheduled' },
    ]
    expect(hasUnfinishedGameOn(rows, '2026-09-13')).toBe(true)
  })

  it('指定日の試合がすべて終了済み・中止なら false', () => {
    const rows: ScheduleRow[] = [
      { date: '2026-09-13', teamA: 'a', teamB: 'b', status: 'finished', scoreA: 1, scoreB: 0 },
      { date: '2026-09-13', teamA: 'c', teamB: 'd', status: 'cancelled' },
    ]
    expect(hasUnfinishedGameOn(rows, '2026-09-13')).toBe(false)
  })

  it('別日の未終了試合は数えない', () => {
    const rows: ScheduleRow[] = [{ date: '2026-09-14', teamA: 'a', teamB: 'b', status: 'scheduled' }]
    expect(hasUnfinishedGameOn(rows, '2026-09-13')).toBe(false)
  })
})

// makeLeague（6球団の realistic な LeagueStandings）を経由しても、applyStandingsDiff が
// 壊れず動くことを確認する（新フィールド sourceAsOfDate/isPartialDay 等の追加後の型整合性）
describe('applyStandingsDiff と LeagueStandings の型整合性', () => {
  it('makeLeague で作った teams をそのまま渡せる', () => {
    const league = makeLeague(
      [
        { id: 'baystars', wins: 61, losses: 63, ties: 3 },
        { id: 'giants', wins: 70, losses: 55, ties: 2 },
      ],
      null,
    )
    const finishedGames: FinishedGame[] = [
      { date: '2026-09-13', teamA: 'baystars', teamB: 'giants', scoreA: 5, scoreB: 0 },
    ]
    const result = applyStandingsDiff(league.teams, finishedGames, league.asOfDate!, '2026-09-13')
    expect(result.teams.find((t) => t.teamId === 'baystars')).toMatchObject({ wins: 62, losses: 63, games: 128 })
  })
})
