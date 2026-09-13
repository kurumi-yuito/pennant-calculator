/**
 * 実データ確認用テスト（ネットワークが必要なため既定ではスキップ）。
 *
 *   RUN_LIVE=1 npx vitest run tests/live-standings.test.ts
 *
 * NPB 公式の唯一のデータ取得元 (https://npb.jp/games/<year>/) から最新順位表を取得し、
 * さらに同じ npb.jp 内の月別日程・結果ページから残り直接対決数を復元したうえで、
 * 12 球団すべての計算結果を出力・検証する（server/api/standings.get.ts と同じ手順）。
 */
import { describe, expect, it } from 'vitest'
import { parseGamesPageStandings } from '../lib/parse-npb-standings'
import { parseScheduleMonthHtml } from '../lib/parse-npb-schedule'
import { deriveRemainingHeadToHead } from '../lib/head-to-head'
import { formatWinningPercentage } from '../lib/record'
import { TEAMS, TOTAL_GAMES } from '../lib/teams'
import {
  buildProjection,
  calcFiveHundredLine,
  calcRankLines,
  currentRank,
  remainingGames,
} from '../lib/scenario'
import type { CompletedGame } from '../lib/parse-npb-schedule'
import type { LeagueStandings } from '../lib/types'

const RUN_LIVE = process.env.RUN_LIVE === '1'
const SEASON = Number(process.env.NPB_SEASON ?? new Date().getFullYear())
const SEASON_START_MONTH = 3

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { 'User-Agent': 'pennant-calculator/1.0' } })
  expect(response.ok).toBe(true)
  return response.text()
}

async function loadStandings(): Promise<[LeagueStandings, LeagueStandings]> {
  const url = `https://npb.jp/games/${SEASON}/`
  const [central, pacific] = parseGamesPageStandings(await fetchText(url), url, SEASON)

  const asOfDates = [central.asOfDate, pacific.asOfDate].filter((d): d is string => d !== null)
  const endMonth = Math.max(SEASON_START_MONTH, ...asOfDates.map((d) => Number(d.slice(5, 7))))
  const monthNumbers = Array.from({ length: endMonth - SEASON_START_MONTH + 1 }, (_, i) => SEASON_START_MONTH + i)

  const perMonth = await Promise.all(
    monthNumbers.map(async (month) => {
      const mm = String(month).padStart(2, '0')
      const scheduleUrl = `https://npb.jp/games/${SEASON}/schedule_${mm}_detail.html`
      return parseScheduleMonthHtml(await fetchText(scheduleUrl), month, SEASON)
    }),
  )
  const completedGames: CompletedGame[] = perMonth.flat()

  const leagues = [central, pacific].map((league) => {
    if (!league.asOfDate) throw new Error(`${league.league}: asOfDate が取得できません`)
    return { ...league, remainingHeadToHead: deriveRemainingHeadToHead(completedGames, league.teams, league.asOfDate) }
  }) as [LeagueStandings, LeagueStandings]

  return leagues
}

describe.skipIf(!RUN_LIVE)('実データでの 12 球団チェック（残り直接対決の復元込み）', () => {
  it('全球団で NaN / undefined / Infinity を出さず、矛盾しない結果になる', async () => {
    const leagues = await loadStandings()
    const highlight: Record<string, ReturnType<typeof calcRankLines>[]> = {}

    for (const standings of leagues) {
      console.log(`\n===== ${standings.league} (${standings.asOfLabel} 現在) =====`)
      console.log(`直接対決の残り日程: ${standings.remainingHeadToHead ? '復元済み' : '不明'}`)
      for (const team of standings.teams) {
        const info = TEAMS.find((t) => t.id === team.teamId)
        const remaining = remainingGames(team)
        const rank = currentRank(standings, team.teamId)
        const pennant = calcRankLines(standings, team.teamId, 1)
        const cs = calcRankLines(standings, team.teamId, 3)
        const five = calcFiveHundredLine(team)
        const rows = buildProjection(team, [five.requiredWins, cs?.possibleWins ?? null])

        expect(info).toBeDefined()
        expect(pennant).not.toBeNull()
        expect(cs).not.toBeNull()
        if (!pennant || !cs) continue

        // 通常運用では、月別日程ページの取得・解析に成功していれば必ず既知になる
        expect(pennant.headToHeadKnown).toBe(true)
        expect(cs.headToHeadKnown).toBe(true)

        highlight[team.teamId] = [pennant, cs]

        console.log(
          [
            `${info?.shortName ?? team.teamId}`,
            `${rank?.rank}位${rank?.tied ? 'タイ' : ''}`,
            `${team.games}試合 ${team.wins}勝${team.losses}敗${team.ties}分`,
            `勝率 ${formatWinningPercentage(team.winningPercentage)}`,
            `残り${remaining}`,
            `| 優勝: ${pennant.status} 最短 ${pennant.possibleWins ?? '-'} 確定 ${pennant.clinchWins ?? '-'}`,
            `| CS: ${cs.status} 最短 ${cs.possibleWins ?? '-'} 確定 ${cs.clinchWins ?? '-'}`,
            `| 5割: ${five.status} 必要 ${five.requiredWins ?? '-'} (${five.finalWins}勝${five.finalLosses}敗 ${formatWinningPercentage(five.finalPercentage)})`,
          ].join(' '),
        )

        // 試合数・残り試合数
        expect(team.wins + team.losses + team.ties).toBe(team.games)
        expect(remaining).toBe(TOTAL_GAMES - team.games)
        expect(remaining).toBeGreaterThanOrEqual(0)
        expect(remaining).toBeLessThanOrEqual(TOTAL_GAMES)

        // 数値の健全性
        for (const value of [
          team.winningPercentage,
          five.finalPercentage,
          five.currentPercentage,
          ...rows.map((r) => r.percentage),
        ]) {
          expect(Number.isFinite(value)).toBe(true)
        }
        for (const value of [pennant.possibleWins, pennant.clinchWins, cs.possibleWins, cs.clinchWins, five.requiredWins]) {
          expect(value === null || Number.isInteger(value)).toBe(true)
          if (value !== null) {
            expect(value).toBeGreaterThanOrEqual(0)
            expect(value).toBeLessThanOrEqual(remaining)
          }
        }

        // 最短ライン <= 確定ライン
        if (pennant.possibleWins !== null && pennant.clinchWins !== null) {
          expect(pennant.clinchWins).toBeGreaterThanOrEqual(pennant.possibleWins)
        }
        if (cs.possibleWins !== null && cs.clinchWins !== null) {
          expect(cs.clinchWins).toBeGreaterThanOrEqual(cs.possibleWins)
        }
        // 優勝可能なら CS も可能
        if (pennant.possibleWins !== null) {
          expect(cs.possibleWins).not.toBeNull()
          if (cs.possibleWins !== null) expect(pennant.possibleWins).toBeGreaterThanOrEqual(cs.possibleWins)
        }

        // 全勝しても首位の現在勝数に届かないなら「優勝消滅」でなければならない
        const maxWins = team.wins + remaining
        const bestRivalWins = Math.max(
          ...standings.teams.filter((t) => t.teamId !== team.teamId).map((t) => t.wins),
        )
        if (maxWins < bestRivalWins) {
          expect(pennant.status).toBe('eliminated')
          expect(pennant.possibleWins).toBeNull()
        }

        // 5割ラインの手計算との一致
        const manual = Math.max(0, Math.ceil((team.wins + team.losses + remaining) / 2 - team.wins))
        if (manual <= remaining) {
          expect(five.requiredWins).toBe(manual)
          expect(five.finalWins / (five.finalWins + five.finalLosses)).toBeGreaterThanOrEqual(0.5)
        } else {
          expect(five.requiredWins).toBeNull()
          expect(five.status).toBe('eliminated')
        }
      }
    }

    // 3位前後の重点確認（DeNA / ヤクルト / 阪神 / 日本ハム / オリックス）
    console.log('\n===== 重点確認（優勝・CS 最短/確定） =====')
    for (const teamId of ['baystars', 'swallows', 'tigers', 'fighters', 'buffaloes']) {
      const [pennant, cs] = highlight[teamId] ?? []
      const info = TEAMS.find((t) => t.id === teamId)
      console.log(
        `${info?.shortName}: 優勝最短=${pennant?.possibleWins ?? '-'} 優勝確定=${pennant?.clinchWins ?? '-'} ` +
          `CS最短=${cs?.possibleWins ?? '-'} CS確定=${cs?.clinchWins ?? '-'}`,
      )
    }
  }, 60000)
})
